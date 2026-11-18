import { beforeEach, describe, expect, it, vi } from "vitest";

import * as path from "path";

import request from "supertest";

import type { RepositoryRecord } from "../services/repositories.service";

/*
 * Build 06 — two-user ownership isolation.
 *
 * Authentication is faked per token; repository records live in an in-memory
 * table that enforces user scoping exactly like the real service. The REAL
 * requireAuth and requireOwnedRepository middleware run, so this exercises the
 * ownership boundary end-to-end without a database.
 *
 * `vi.hoisted` makes the table available to the (hoisted) mock factory.
 */
const { table } = vi.hoisted(() => ({
    table: [] as RepositoryRecord[]
}));

vi.mock("../services/auth.service", () => ({
    verifyAccessToken: vi.fn(async (token: string) => {
        if (token === "token-a") {
            return { id: "user-a", email: "a@example.com" };
        }
        if (token === "token-b") {
            return { id: "user-b", email: "b@example.com" };
        }
        return null;
    })
}));

vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async (id?: string) =>
        id
            ? {
                  nodes: [
                      {
                          id: "file:src/app.ts",
                          type: "File",
                          name: "app.ts",
                          filePath: "src/app.ts",
                          startLine: 1,
                          endLine: 2,
                          category: "source",
                          inDefaultScope: true
                      }
                  ],
                  relationships: []
              }
            : { nodes: [], relationships: [] }
    ),
    fetchFunctionContext: vi.fn(async () => null),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
}));

vi.mock("../services/repositories.service", () => ({
    createRepository: vi.fn(async (userId: string, name: string) => {
        const row: RepositoryRecord = {
            id: `repo-${table.length + 1}`,
            user_id: userId,
            name,
            source_type: "zip",
            status: "analyzing",
            graph_persisted: false,
            node_count: 0,
            relationship_count: 0,
            source_object_key: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z"
        };
        table.push(row);
        return row;
    }),
    findRepositoryForUser: vi.fn(async (id: string, userId: string) =>
        table.find((row) => row.id === id && row.user_id === userId) ?? null
    ),
    listRepositoriesForUser: vi.fn(async (userId: string) =>
        table.filter((row) => row.user_id === userId)
    ),
    updateRepositoryOutcome: vi.fn(async () => undefined),
    setRepositorySourceKey: vi.fn(async () => undefined),
    deleteRepository: vi.fn(async () => undefined)
}));

/* Build 07: R2 + job creation are mocked so uploads queue without a bucket. */
vi.mock("../services/storage.service", () => ({
    isR2Configured: vi.fn(() => true),
    objectKeyFor: vi.fn(
        (userId: string, repositoryId: string) =>
            `repositories/${userId}/${repositoryId}/source.zip`
    ),
    putZip: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined)
}));

vi.mock("../services/jobs.service", () => ({
    createJob: vi.fn(async () => ({ id: "job-1", status: "pending" })),
    findJobForUser: vi.fn(async () => null),
    listJobsForUser: vi.fn(async () => []),
    retryJobForUser: vi.fn(async () => null)
}));

import { app } from "../server";
import { fetchGraph } from "../services/graph.service";

const fetchGraphMock = vi.mocked(fetchGraph);

const archivesDir = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures",
    "archives"
);

const AUTH_A = { Authorization: "Bearer token-a" };
const AUTH_B = { Authorization: "Bearer token-b" };

async function uploadAs(auth: Record<string, string>) {
    return request(app)
        .post("/api/repositories/analyze")
        .set(auth)
        .attach("file", path.join(archivesDir, "valid.zip"));
}

beforeEach(() => {
    table.length = 0;
    fetchGraphMock.mockClear();
});

describe("Build 06 — repository ownership (mocked Supabase)", () => {

    it("creates a repository owned by the uploading user", async () => {
        const response = await uploadAs(AUTH_A);

        expect(response.status).toBe(202);
        expect(response.body.repositoryId).toBeDefined();
        expect(table).toHaveLength(1);
        expect(table[0].user_id).toBe("user-a");
    });

    it("lists only the caller's own repositories", async () => {
        const upload = await uploadAs(AUTH_A);
        const repositoryId = upload.body.repositoryId as string;

        const asA = await request(app).get("/api/repositories").set(AUTH_A);
        expect(asA.status).toBe(200);
        expect(
            asA.body.repositories.map((entry: { id: string }) => entry.id)
        ).toEqual([repositoryId]);

        const asB = await request(app).get("/api/repositories").set(AUTH_B);
        expect(asB.status).toBe(200);
        expect(asB.body.repositories).toEqual([]);
    });

    it("refuses user B every read of user A's repository (404, no graph read)", async () => {
        const upload = await uploadAs(AUTH_A);
        const id = upload.body.repositoryId as string;

        fetchGraphMock.mockClear();

        const attempts = [
            `/api/graph?repository=${id}`,
            `/api/analysis?repository=${id}`,
            `/api/analysis/function?repository=${id}&nodeId=function:x`,
            `/api/workflows?repository=${id}`,
            `/api/workflows/wf-1?repository=${id}`
        ];

        for (const route of attempts) {
            const response = await request(app).get(route).set(AUTH_B);
            expect(response.status).toBe(404);
        }

        /* A cross-user request must never reach the graph. */
        expect(fetchGraphMock).not.toHaveBeenCalled();
    });

    it("lets the owner read their own graph", async () => {
        const upload = await uploadAs(AUTH_A);
        const id = upload.body.repositoryId as string;

        const response = await request(app)
            .get(`/api/graph?repository=${id}`)
            .set(AUTH_A);

        expect(response.status).toBe(200);
        expect(response.body.nodes.length).toBeGreaterThan(0);
    });

    it("gives user B a separate repository when they upload the same ZIP", async () => {
        const a = await uploadAs(AUTH_A);
        const b = await uploadAs(AUTH_B);

        expect(a.status).toBe(202);
        expect(b.status).toBe(202);
        expect(a.body.repositoryId).not.toBe(b.body.repositoryId);
        expect(table.map((row) => row.user_id).sort()).toEqual([
            "user-a",
            "user-b"
        ]);
    });
});
