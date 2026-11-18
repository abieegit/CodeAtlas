import { beforeEach, describe, expect, it, vi } from "vitest";

import * as fs from "fs";

import { Readable } from "stream";

import { env } from "../config/env";

/*
 * Build 07 — worker processing.
 *
 * Every collaborator (R2, ingestion, parser, jobs, repositories, file utils)
 * is mocked so processJob's orchestration, failure classification and
 * temporary-file cleanup are exercised without R2, Neo4j or the database.
 */

vi.mock("../database/neo4j", () => ({
    neo4jDriver: { close: vi.fn(async () => undefined) },
    database: "neo4j"
}));

const { deps } = vi.hoisted(() => ({
    deps: {
        extractZip: vi.fn(),
        findSourceFiles: vi.fn(),
        analyzeAndStore: vi.fn(),
        getZipStream: vi.fn(),
        assertR2Configured: vi.fn(),
        claimNextJob: vi.fn(),
        updateJobProgress: vi.fn(async () => undefined),
        exhaustJob: vi.fn(async () => undefined),
        findRepositoryForUser: vi.fn(),
        updateRepositoryOutcome: vi.fn(async () => undefined),
        ensureDirectory: vi.fn(),
        removeFileIfExists: vi.fn(),
        removeDirectoryIfExists: vi.fn()
    }
}));

vi.mock("../services/ingestion.service", () => ({
    extractZip: deps.extractZip
}));
vi.mock("../services/repository.service", () => ({
    findSourceFiles: deps.findSourceFiles
}));
vi.mock("../services/parser.service", () => ({
    analyzeAndStore: deps.analyzeAndStore
}));
vi.mock("../services/storage.service", () => ({
    getZipStream: deps.getZipStream,
    assertR2Configured: deps.assertR2Configured
}));
vi.mock("../services/jobs.service", () => ({
    claimNextJob: deps.claimNextJob,
    updateJobProgress: deps.updateJobProgress,
    exhaustJob: deps.exhaustJob
}));
vi.mock("../services/repositories.service", () => ({
    findRepositoryForUser: deps.findRepositoryForUser,
    updateRepositoryOutcome: deps.updateRepositoryOutcome
}));
vi.mock("../utils/file.utils", () => ({
    ensureDirectory: deps.ensureDirectory,
    removeFileIfExists: deps.removeFileIfExists,
    removeDirectoryIfExists: deps.removeDirectoryIfExists
}));

import { processJob } from "../worker";

const JOB = {
    id: "job-1",
    repository_id: "repo-1",
    user_id: "user-a",
    status: "processing",
    progress: 0,
    stage: "downloading",
    error_message: null,
    attempt_count: 1,
    max_attempts: 3,
    locked_at: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
};

beforeEach(() => {

    vi.clearAllMocks();

    fs.mkdirSync(env.uploadsDir, { recursive: true });

    deps.getZipStream.mockResolvedValue(Readable.from([Buffer.from("PK")]));

    /* Cleanup helpers delete for real so no temp files linger. */
    deps.removeFileIfExists.mockImplementation((target: string) => {
        try {
            fs.rmSync(target, { force: true });
        } catch {
            /* ignore */
        }
    });
    deps.removeDirectoryIfExists.mockImplementation(() => undefined);

    deps.findRepositoryForUser.mockResolvedValue({
        id: "repo-1",
        user_id: "user-a",
        name: "demo",
        source_object_key: "repositories/user-a/repo-1/source.zip"
    });

    deps.extractZip.mockResolvedValue({
        repositoryName: "demo",
        repositoryPath: "/tmp/demo",
        extractionDir: "/tmp/demo-extraction"
    });

    deps.findSourceFiles.mockReturnValue(["src/a.ts"]);

    deps.analyzeAndStore.mockResolvedValue({
        graph: { nodes: [{}, {}], relationships: [{}] },
        persisted: true
    });
});

describe("Build 07 — worker processing", () => {

    it("processes a job and records completion with counts", async () => {
        await processJob(JOB as never);

        expect(deps.updateRepositoryOutcome).toHaveBeenCalledWith(
            "repo-1",
            "user-a",
            expect.objectContaining({
                status: "completed",
                graphPersisted: true,
                nodeCount: 2,
                relationshipCount: 1
            })
        );
        expect(deps.updateJobProgress).toHaveBeenCalledWith(
            "job-1",
            expect.objectContaining({ status: "completed", progress: 100 })
        );
        expect(deps.exhaustJob).not.toHaveBeenCalled();
    });

    it("fails permanently when the archive has no supported source files", async () => {
        deps.findSourceFiles.mockReturnValue([]);

        await processJob(JOB as never);

        expect(deps.exhaustJob).toHaveBeenCalledTimes(1);
        expect(deps.updateJobProgress).not.toHaveBeenCalledWith(
            "job-1",
            expect.objectContaining({ status: "completed" })
        );
    });

    it("treats an unreadable archive as a permanent failure", async () => {
        deps.extractZip.mockRejectedValue(new Error("not a zip"));

        await processJob(JOB as never);

        expect(deps.exhaustJob).toHaveBeenCalledTimes(1);
    });

    it("records a retryable failure when analysis throws", async () => {
        deps.analyzeAndStore.mockRejectedValue(new Error("boom"));

        await processJob(JOB as never);

        expect(deps.updateJobProgress).toHaveBeenCalledWith(
            "job-1",
            expect.objectContaining({ status: "failed" })
        );
        expect(deps.exhaustJob).not.toHaveBeenCalled();
        expect(deps.updateRepositoryOutcome).toHaveBeenCalledWith(
            "repo-1",
            "user-a",
            { status: "failed" }
        );
    });

    it("cleans up the temporary ZIP and extraction dir on success", async () => {
        await processJob(JOB as never);

        expect(deps.removeFileIfExists).toHaveBeenCalled();
        expect(deps.removeDirectoryIfExists).toHaveBeenCalledWith(
            "/tmp/demo-extraction"
        );
    });

    it("cleans up the temporary ZIP even when processing fails", async () => {
        deps.analyzeAndStore.mockRejectedValue(new Error("boom"));

        await processJob(JOB as never);

        expect(deps.removeFileIfExists).toHaveBeenCalled();
    });

    it("fails permanently when the repository has no stored object key", async () => {
        deps.findRepositoryForUser.mockResolvedValue({
            id: "repo-1",
            user_id: "user-a",
            name: "demo",
            source_object_key: null
        });

        await processJob(JOB as never);

        expect(deps.exhaustJob).toHaveBeenCalledTimes(1);
        expect(deps.getZipStream).not.toHaveBeenCalled();
    });
});
