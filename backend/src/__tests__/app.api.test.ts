import { describe, it, expect, vi } from "vitest";

import * as path from "path";

import request from "supertest";

import type { NextFunction, Request, Response } from "express";

/*
 * The Neo4j layer is mocked so these tests exercise archive validation,
 * ingestion and the response shape without writing to a database.
 */
vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
}));

/*
 * Build 06: authentication and repository-record persistence are mocked so
 * this test keeps exercising archive validation only. The real middleware is
 * covered by the dedicated auth/ownership tests.
 */
vi.mock("../middleware/auth.middleware", () => ({
    requireAuth: (request: Request, _response: Response, next: NextFunction) => {
        request.user = { id: "user-1", email: "user@example.com" };
        next();
    }
}));

vi.mock("../services/repositories.service", () => ({
    createRepository: vi.fn(async (userId: string, name: string) => ({
        id: "repo-1",
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
    })),
    setRepositorySourceKey: vi.fn(async () => undefined),
    deleteRepository: vi.fn(async () => undefined),
    findRepositoryForUser: vi.fn(async () => null),
    listRepositoriesForUser: vi.fn(async () => []),
    updateRepositoryOutcome: vi.fn(async () => undefined)
}));

/* Build 07: R2 storage + job creation are mocked (no bucket, no database). */
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
    createJob: vi.fn(async () => ({ id: "job-1", status: "pending" }))
}));

import { app } from "../server";

const archivesDir = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures",
    "archives"
);

describe("POST /api/repositories/analyze (archive validation)", () => {

    it("queues a valid ZIP and returns 202 with repository + job ids", async () => {
        const response = await request(app)
            .post("/api/repositories/analyze")
            .attach("file", path.join(archivesDir, "valid.zip"));

        expect(response.status).toBe(202);
        expect(response.body.repositoryId).toBe("repo-1");
        expect(response.body.jobId).toBe("job-1");
        expect(response.body.status).toBe("pending");
    });

    it("rejects a mislabeled archive that is not really a ZIP", async () => {
        const response = await request(app)
            .post("/api/repositories/analyze")
            .attach("file", path.join(archivesDir, "fake.zip"));

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/ZIP/i);
    });

    it("rejects a .rar archive", async () => {
        const response = await request(app)
            .post("/api/repositories/analyze")
            .attach("file", path.join(archivesDir, "archive.rar"));

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/ZIP/i);
    });
});
