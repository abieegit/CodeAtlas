import { beforeEach, describe, expect, it, vi } from "vitest";

import * as path from "path";

import request from "supertest";

import type { NextFunction, Request, Response } from "express";

/*
 * Build 07 — async upload queue.
 *
 * Storage, repository records and jobs are mocked so the upload ORCHESTRATION
 * is exercised without R2 or a database. The real auth middleware is replaced
 * with a passthrough (auth itself is covered by auth.api.test.ts).
 */

vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
}));

vi.mock("../middleware/auth.middleware", () => ({
    requireAuth: (request: Request, _response: Response, next: NextFunction) => {
        request.user = { id: "user-a", email: "a@example.com" };
        next();
    }
}));

const { storage, repos, jobs } = vi.hoisted(() => ({
    storage: {
        isR2Configured: vi.fn(() => true),
        objectKeyFor: vi.fn(
            (userId: string, repositoryId: string) =>
                `repositories/${userId}/${repositoryId}/source.zip`
        ),
        putZip: vi.fn(async () => undefined),
        deleteObject: vi.fn(async () => undefined)
    },
    repos: {
        createRepository: vi.fn(),
        deleteRepository: vi.fn(async () => undefined),
        setRepositorySourceKey: vi.fn(async () => undefined),
        listRepositoriesForUser: vi.fn(async () => [])
    },
    jobs: {
        createJob: vi.fn()
    }
}));

vi.mock("../services/storage.service", () => storage);
vi.mock("../services/repositories.service", () => repos);
vi.mock("../services/jobs.service", () => jobs);

import { app } from "../server";

const archivesDir = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures",
    "archives"
);

beforeEach(() => {

    vi.clearAllMocks();

    storage.isR2Configured.mockReturnValue(true);

    repos.createRepository.mockResolvedValue({
        id: "repo-1",
        user_id: "user-a",
        name: "valid",
        source_type: "zip",
        status: "analyzing",
        graph_persisted: false,
        node_count: 0,
        relationship_count: 0,
        source_object_key: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
    });

    jobs.createJob.mockResolvedValue({
        id: "job-1",
        repository_id: "repo-1",
        user_id: "user-a",
        status: "pending",
        progress: 0,
        stage: "queued",
        error_message: null,
        attempt_count: 0,
        max_attempts: 3,
        locked_at: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
    });
});

function upload(name = "valid.zip") {
    return request(app)
        .post("/api/repositories/analyze")
        .attach("file", path.join(archivesDir, name));
}

describe("POST /api/repositories/analyze (Build 07 async queue)", () => {

    it("queues a valid ZIP and returns 202 with the repository + job ids", async () => {
        const response = await upload();

        expect(response.status).toBe(202);
        expect(response.body.repositoryId).toBe("repo-1");
        expect(response.body.jobId).toBe("job-1");
        expect(response.body.status).toBe("pending");
        expect(storage.putZip).toHaveBeenCalledTimes(1);
        expect(jobs.createJob).toHaveBeenCalledWith("repo-1", "user-a");
    });

    it("rejects a mislabeled archive that is not really a ZIP", async () => {
        const response = await upload("fake.zip");

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/ZIP/i);
        expect(repos.createRepository).not.toHaveBeenCalled();
    });

    it("rejects a .rar archive", async () => {
        const response = await upload("archive.rar");

        expect(response.status).toBe(400);
        expect(repos.createRepository).not.toHaveBeenCalled();
    });

    it("returns 503 when R2 is not configured", async () => {
        storage.isR2Configured.mockReturnValue(false);

        const response = await upload();

        expect(response.status).toBe(503);
        expect(repos.createRepository).not.toHaveBeenCalled();
    });

    it("rolls the repository back when the R2 upload fails", async () => {
        storage.putZip.mockRejectedValueOnce(new Error("r2 down"));

        const response = await upload();

        expect(response.status).toBe(500);
        expect(repos.deleteRepository).toHaveBeenCalledWith("repo-1", "user-a");
        expect(jobs.createJob).not.toHaveBeenCalled();
    });

    it("deletes the orphaned object when creating the job fails", async () => {
        jobs.createJob.mockRejectedValueOnce(new Error("db down"));

        const response = await upload();

        expect(response.status).toBe(500);
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
        expect(repos.deleteRepository).toHaveBeenCalledWith("repo-1", "user-a");
    });
});
