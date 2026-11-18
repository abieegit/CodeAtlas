import * as fs from "fs";
import * as path from "path";

import { pipeline } from "stream/promises";

import { env } from "./config/env";
import { assertSupabaseConfigured } from "./database/supabase";
import { neo4jDriver } from "./database/neo4j";

import { extractZip } from "./services/ingestion.service";
import type { ExtractedRepository } from "./services/ingestion.service";
import { analyzeAndStore } from "./services/parser.service";
import { findSourceFiles } from "./services/repository.service";
import {
    assertR2Configured,
    getZipStream
} from "./services/storage.service";
import {
    claimNextJob,
    exhaustJob,
    updateJobProgress,
    type AnalysisJob
} from "./services/jobs.service";
import {
    findRepositoryForUser,
    updateRepositoryOutcome
} from "./services/repositories.service";

import {
    ensureDirectory,
    removeDirectoryIfExists,
    removeFileIfExists
} from "./utils/file.utils";

/*
 * CodeAtlas analysis worker (Build 07).
 *
 * A SEPARATE process from the API. It claims pending jobs atomically from
 * PostgreSQL, downloads the source ZIP from the private R2 bucket, extracts
 * and analyses it with the EXISTING pipeline (analyzeAndStore), persists the
 * graph, then updates the job and repository rows. Jobs are processed
 * sequentially; shutdown is graceful. It never logs secrets, tokens, source
 * contents or object bodies.
 */

/** A problem that retrying cannot fix (bad archive, unsupported repository). */
class PermanentJobError extends Error {}

/* Coarse stage boundaries — each value is a real completed step, not a fake. */
const PROGRESS = {
    downloading: 10,
    extracting: 25,
    parsing: 50,
    persisting: 90,
    completed: 100
} as const;

let running = true;

function log(message: string): void {
    console.log(`[worker] ${message}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Exported for tests; the worker itself calls it from the poll loop. */
export async function processJob(job: AnalysisJob): Promise<void> {

    const repository = await findRepositoryForUser(
        job.repository_id,
        job.user_id
    );

    if (!repository || !repository.source_object_key) {
        await exhaustJob(
            job.id,
            "The source archive could not be located.",
            job.max_attempts
        );
        return;
    }

    const objectKey = repository.source_object_key;
    const zipPath = path.join(env.uploadsDir, `${job.repository_id}.zip`);

    let extractionDir: string | undefined;

    try {

        ensureDirectory(env.uploadsDir);

        /* --- downloading --- */
        await updateJobProgress(job.id, {
            status: "processing",
            stage: "downloading",
            progress: PROGRESS.downloading
        });

        const stream = await getZipStream(objectKey);
        await pipeline(stream, fs.createWriteStream(zipPath));

        /* --- extracting (archive problems are permanent) --- */
        await updateJobProgress(job.id, {
            stage: "extracting",
            progress: PROGRESS.extracting
        });

        let extracted: ExtractedRepository;

        try {
            extracted = await extractZip(zipPath, repository.name);
        } catch (error) {
            throw new PermanentJobError(
                `The archive could not be read: ${(error as Error).message}`
            );
        }

        extractionDir = extracted.extractionDir;

        if (findSourceFiles(extracted.repositoryPath).length === 0) {
            throw new PermanentJobError(
                "No supported JavaScript/TypeScript files were found in the archive."
            );
        }

        /* --- parsing / building the graph (one existing call) --- */
        await updateJobProgress(job.id, {
            stage: "parsing",
            progress: PROGRESS.parsing
        });

        const result = await analyzeAndStore(
            extracted.repositoryPath,
            repository.name,
            job.repository_id
        );

        /* --- persisting the outcome --- */
        await updateJobProgress(job.id, {
            stage: "persisting_graph",
            progress: PROGRESS.persisting
        });

        await updateRepositoryOutcome(job.repository_id, job.user_id, {
            status: "completed",
            graphPersisted: result.persisted,
            nodeCount: result.graph.nodes.length,
            relationshipCount: result.graph.relationships.length
        });

        await updateJobProgress(job.id, {
            status: "completed",
            stage: "completed",
            progress: PROGRESS.completed
        });

        log(`job ${job.id} completed (${result.graph.nodes.length} nodes).`);

    } catch (error) {

        const permanent = error instanceof PermanentJobError;

        try {
            await updateRepositoryOutcome(job.repository_id, job.user_id, {
                status: "failed"
            });
        } catch (updateError) {
            log(`could not mark repository failed: ${(updateError as Error).message}`);
        }

        if (permanent) {
            await exhaustJob(
                job.id,
                (error as Error).message,
                job.max_attempts
            );
        } else {
            await updateJobProgress(job.id, {
                status: "failed",
                stage: "failed",
                errorMessage: "Analysis failed. It can be retried."
            });
        }

        log(`job ${job.id} failed: ${(error as Error).message}`);

    } finally {

        removeFileIfExists(zipPath);

        if (extractionDir) {
            removeDirectoryIfExists(extractionDir);
        }
    }
}

async function tick(): Promise<void> {

    const job = await claimNextJob(env.worker.staleSeconds);

    if (!job) {
        return;
    }

    log(`claimed job ${job.id} (attempt ${job.attempt_count}/${job.max_attempts}).`);

    await processJob(job);
}

async function main(): Promise<void> {

    /* The worker cannot function without Supabase or R2 — fail fast. */
    assertSupabaseConfigured();
    assertR2Configured();
    ensureDirectory(env.uploadsDir);

    log(
        `started; polling every ${env.worker.pollIntervalMs}ms ` +
            `(stale threshold ${env.worker.staleSeconds}s).`
    );

    while (running) {

        try {
            await tick();
        } catch (error) {
            log(`loop error: ${(error as Error).message}`);
        }

        if (running) {
            await sleep(env.worker.pollIntervalMs);
        }
    }

    log("shutting down.");

    try {
        await neo4jDriver.close();
    } catch {
        /* best effort */
    }

    process.exit(0);
}

process.on("SIGINT", () => {
    running = false;
});

process.on("SIGTERM", () => {
    running = false;
});

if (require.main === module) {
    void main();
}
