import { supabaseAdmin } from "../database/supabase";

/*
 * Analysis jobs (Build 07) — the durable PostgreSQL job queue.
 *
 * Every statement uses the service-role client (which bypasses RLS), so each
 * one is explicitly scoped by the owner id where a user is involved. The
 * atomic claim + stale recovery live in the SQL function claim_analysis_job
 * (FOR UPDATE SKIP LOCKED); this service only calls it.
 */

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface AnalysisJob {
    id: string;
    repository_id: string;
    user_id: string;
    status: JobStatus;
    progress: number;
    stage: string;
    error_message: string | null;
    attempt_count: number;
    max_attempts: number;
    locked_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export async function createJob(
    repositoryId: string,
    userId: string
): Promise<AnalysisJob> {

    const { data, error } = await supabaseAdmin
        .from("analysis_jobs")
        .insert({
            repository_id: repositoryId,
            user_id: userId,
            status: "pending",
            stage: "queued",
            progress: 0
        })
        .select("*")
        .single();

    if (error || !data) {
        throw new Error(
            `Could not create the analysis job: ${error?.message ?? "unknown error"}`
        );
    }

    return data as AnalysisJob;
}

/** Ownership-scoped lookup; returns null for a job that is missing or foreign. */
export async function findJobForUser(
    jobId: string,
    userId: string
): Promise<AnalysisJob | null> {

    const { data, error } = await supabaseAdmin
        .from("analysis_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw new Error(`Could not read the analysis job: ${error.message}`);
    }

    return (data as AnalysisJob | null) ?? null;
}

export async function listJobsForUser(
    userId: string,
    limit = 20
): Promise<AnalysisJob[]> {

    const { data, error } = await supabaseAdmin
        .from("analysis_jobs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(`Could not list the analysis jobs: ${error.message}`);
    }

    return (data ?? []) as AnalysisJob[];
}

/**
 * Atomically claims the next pending job (or returns null). Stale
 * 'processing' jobs are recovered inside the same SQL function.
 */
export async function claimNextJob(
    staleSeconds: number
): Promise<AnalysisJob | null> {

    const { data, error } = await supabaseAdmin.rpc("claim_analysis_job", {
        p_stale_seconds: staleSeconds
    });

    if (error) {
        throw new Error(`Could not claim an analysis job: ${error.message}`);
    }

    const rows = (data ?? []) as AnalysisJob[];

    return rows[0] ?? null;
}

export interface JobProgress {
    status?: JobStatus;
    progress?: number;
    stage?: string;
    errorMessage?: string | null;
}

/**
 * Updates a job's progress/status. Used by the worker; never reachable from a
 * client request.
 */
export async function updateJobProgress(
    jobId: string,
    update: JobProgress
): Promise<void> {

    const patch: Record<string, unknown> = {};

    if (update.status !== undefined) {
        patch.status = update.status;
    }
    if (update.progress !== undefined) {
        patch.progress = update.progress;
    }
    if (update.stage !== undefined) {
        patch.stage = update.stage;
    }
    if (update.errorMessage !== undefined) {
        patch.error_message = update.errorMessage;
    }
    if (update.status === "completed") {
        patch.completed_at = new Date().toISOString();
        patch.locked_at = null;
    }
    if (update.status === "failed") {
        patch.locked_at = null;
    }

    const { error } = await supabaseAdmin
        .from("analysis_jobs")
        .update(patch)
        .eq("id", jobId);

    if (error) {
        throw new Error(`Could not update the analysis job: ${error.message}`);
    }
}

/**
 * Re-queues a failed job the caller owns, only when a retry is still allowed.
 * Clients cannot touch status/attempt counts directly — this is the only path.
 */
export async function retryJobForUser(
    jobId: string,
    userId: string
): Promise<AnalysisJob | null> {

    const job = await findJobForUser(jobId, userId);

    if (!job) {
        return null;
    }

    if (job.status !== "failed" || job.attempt_count >= job.max_attempts) {
        return null;
    }

    const { data, error } = await supabaseAdmin
        .from("analysis_jobs")
        .update({
            status: "pending",
            progress: 0,
            stage: "queued",
            error_message: null,
            locked_at: null
        })
        .eq("id", jobId)
        .eq("user_id", userId)
        .eq("status", "failed")
        .select("*")
        .maybeSingle();

    if (error) {
        throw new Error(`Could not retry the analysis job: ${error.message}`);
    }

    return (data as AnalysisJob | null) ?? null;
}

/**
 * Marks a job failed with no retry eligibility (a permanent error such as an
 * invalid archive). Sets attempt_count to the limit so the retry path refuses.
 */
export async function exhaustJob(
    jobId: string,
    message: string,
    maxAttempts: number
): Promise<void> {

    const { error } = await supabaseAdmin
        .from("analysis_jobs")
        .update({
            status: "failed",
            stage: "failed",
            error_message: message,
            attempt_count: maxAttempts,
            locked_at: null
        })
        .eq("id", jobId);

    if (error) {
        throw new Error(`Could not finalise the analysis job: ${error.message}`);
    }
}
