import { NextFunction, Request, Response } from "express";

import {
    findJobForUser,
    listJobsForUser,
    retryJobForUser,
    type AnalysisJob
} from "../services/jobs.service";

/** Public, safe shape of a job — never leaks internal columns. */
function serializeJob(job: AnalysisJob) {
    return {
        id: job.id,
        repositoryId: job.repository_id,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        errorMessage:
            job.status === "failed"
                ? job.error_message ?? "Analysis failed."
                : null,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at
    };
}

function jobIdOf(request: Request): string {
    return typeof request.params.jobId === "string"
        ? request.params.jobId
        : "";
}

/**
 * GET /api/jobs/<jobId> — the caller's own job status.
 * Ownership is enforced: a missing or foreign job yields the same 404.
 */
export async function getJob(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const userId = request.user?.id;

        if (!userId) {
            response.status(401).json({ error: "Missing bearer token" });
            return;
        }

        const jobId = jobIdOf(request);

        if (jobId === "") {
            response.status(400).json({ error: "A job id is required." });
            return;
        }

        const job = await findJobForUser(jobId, userId);

        if (!job) {
            response.status(404).json({ error: "No such job." });
            return;
        }

        response.json(serializeJob(job));

    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/jobs?limit=20 — the caller's jobs, newest first.
 */
export async function listJobs(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const userId = request.user?.id;

        if (!userId) {
            response.status(401).json({ error: "Missing bearer token" });
            return;
        }

        const raw =
            typeof request.query.limit === "string"
                ? Number(request.query.limit)
                : Number.NaN;

        const limit = Number.isFinite(raw)
            ? Math.min(Math.max(Math.trunc(raw), 1), 100)
            : 20;

        const jobs = await listJobsForUser(userId, limit);

        response.json({ jobs: jobs.map(serializeJob) });

    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/jobs/<jobId>/retry — re-queue a failed job the caller owns, only
 * while retries remain. Clients never touch status/attempt counts themselves.
 */
export async function retryJob(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const userId = request.user?.id;

        if (!userId) {
            response.status(401).json({ error: "Missing bearer token" });
            return;
        }

        const jobId = jobIdOf(request);

        if (jobId === "") {
            response.status(400).json({ error: "A job id is required." });
            return;
        }

        const existing = await findJobForUser(jobId, userId);

        if (!existing) {
            response.status(404).json({ error: "No such job." });
            return;
        }

        if (
            existing.status !== "failed" ||
            existing.attempt_count >= existing.max_attempts
        ) {
            response.status(409).json({
                error: "This job cannot be retried."
            });
            return;
        }

        const job = await retryJobForUser(jobId, userId);

        if (!job) {
            response.status(409).json({
                error: "This job cannot be retried."
            });
            return;
        }

        response.json(serializeJob(job));

    } catch (error) {
        next(error);
    }
}
