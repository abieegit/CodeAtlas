import { beforeEach, describe, expect, it, vi } from "vitest";

import request from "supertest";

/*
 * Build 07 — job API + ownership.
 *
 * Authentication is faked per token; the job store is an in-memory table that
 * enforces user scoping exactly like the real service. The REAL requireAuth
 * middleware runs, so 401s and cross-user 404s are genuinely exercised.
 */

const { table } = vi.hoisted(() => ({
    table: [] as Array<Record<string, unknown>>
}));

vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
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

vi.mock("../services/jobs.service", () => ({
    createJob: vi.fn(),
    findJobForUser: vi.fn(async (id: string, userId: string) =>
        table.find((job) => job.id === id && job.user_id === userId) ?? null
    ),
    listJobsForUser: vi.fn(async (userId: string) =>
        table.filter((job) => job.user_id === userId)
    ),
    retryJobForUser: vi.fn(async (id: string, userId: string) => {
        const job = table.find(
            (entry) => entry.id === id && entry.user_id === userId
        );
        if (
            !job ||
            job.status !== "failed" ||
            (job.attempt_count as number) >= (job.max_attempts as number)
        ) {
            return null;
        }
        job.status = "pending";
        return job;
    })
}));

import { app } from "../server";

const AUTH_A = { Authorization: "Bearer token-a" };
const AUTH_B = { Authorization: "Bearer token-b" };

function job(overrides: Record<string, unknown> = {}) {
    return {
        id: "job-1",
        repository_id: "repo-1",
        user_id: "user-a",
        status: "failed",
        progress: 40,
        stage: "failed",
        error_message: "Analysis failed.",
        attempt_count: 1,
        max_attempts: 3,
        locked_at: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides
    };
}

beforeEach(() => {
    table.length = 0;
});

describe("Build 07 — job API (mocked Supabase)", () => {

    it("requires authentication", async () => {
        const response = await request(app).get("/api/jobs");
        expect(response.status).toBe(401);
    });

    it("returns the caller's own job", async () => {
        table.push(job());

        const response = await request(app).get("/api/jobs/job-1").set(AUTH_A);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe("job-1");
        expect(response.body.repositoryId).toBe("repo-1");
        expect(response.body.status).toBe("failed");
        expect(response.body.errorMessage).toBe("Analysis failed.");
    });

    it("hides another user's job behind a non-disclosing 404", async () => {
        table.push(job());

        const response = await request(app).get("/api/jobs/job-1").set(AUTH_B);

        expect(response.status).toBe(404);
    });

    it("lists only the caller's own jobs", async () => {
        table.push(job({ id: "job-a", user_id: "user-a" }));
        table.push(job({ id: "job-b", user_id: "user-b" }));

        const response = await request(app).get("/api/jobs").set(AUTH_A);

        expect(response.status).toBe(200);
        expect(response.body.jobs.map((entry: { id: string }) => entry.id)).toEqual([
            "job-a"
        ]);
    });

    it("lets the owner retry a failed, eligible job", async () => {
        table.push(job());

        const response = await request(app)
            .post("/api/jobs/job-1/retry")
            .set(AUTH_A);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("pending");
    });

    it("refuses to retry another user's job with 404", async () => {
        table.push(job());

        const response = await request(app)
            .post("/api/jobs/job-1/retry")
            .set(AUTH_B);

        expect(response.status).toBe(404);
    });

    it("refuses to retry when no attempts remain (409)", async () => {
        table.push(job({ attempt_count: 3 }));

        const response = await request(app)
            .post("/api/jobs/job-1/retry")
            .set(AUTH_A);

        expect(response.status).toBe(409);
    });

    it("does not expose internal fields in the response", async () => {
        table.push(job());

        const response = await request(app).get("/api/jobs/job-1").set(AUTH_A);

        expect(response.body.userId).toBeUndefined();
        expect(response.body.user_id).toBeUndefined();
        expect(response.body.lockedAt).toBeUndefined();
        expect(response.body.locked_at).toBeUndefined();
    });
});
