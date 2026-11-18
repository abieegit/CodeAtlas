import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJob, retryJob, type AnalysisJob } from "../api";

interface Props {
    jobId: string;
    onCompleted: (repositoryId: string) => void;
}

const POLL_MS = 2500;

const STAGE_LABELS: Record<string, string> = {
    queued: "Queued",
    downloading: "Downloading archive",
    extracting: "Extracting files",
    parsing: "Parsing source",
    building_graph: "Building graph",
    persisting_graph: "Persisting graph",
    completed: "Completed",
    failed: "Failed"
};

/**
 * Real, persisted analysis-job status (Build 07). It polls the backend for the
 * job's stored state — no simulated progress. On completion it hands the
 * repository id to the parent so the existing graph view can load it.
 */
export default function JobStatusPanel({ jobId, onCompleted }: Props) {

    const [job, setJob] = useState<AnalysisJob | null>(null);
    const [error, setError] = useState("");
    const [retrying, setRetrying] = useState(false);
    const [restartKey, setRestartKey] = useState(0);

    const completedRef = useRef("");

    useEffect(() => {

        let active = true;
        let timer: number | undefined;

        completedRef.current = "";

        async function tick(): Promise<void> {

            try {

                const next = await fetchJob(jobId);

                if (!active) {
                    return;
                }

                setJob(next);

                if (next.status === "completed") {
                    if (completedRef.current !== next.repositoryId) {
                        completedRef.current = next.repositoryId;
                        onCompleted(next.repositoryId);
                    }
                    return;
                }

                if (next.status === "failed") {
                    return;
                }

            } catch (cause) {

                if (active) {
                    setError((cause as Error).message);
                }
            }

            if (active) {
                timer = window.setTimeout(tick, POLL_MS);
            }
        }

        void tick();

        return () => {
            active = false;
            if (timer) {
                window.clearTimeout(timer);
            }
        };

    }, [jobId, onCompleted, restartKey]);

    const handleRetry = useCallback(async () => {

        setRetrying(true);
        setError("");

        try {
            await retryJob(jobId);
            setRestartKey((value) => value + 1);
        } catch (cause) {
            setError((cause as Error).message);
        } finally {
            setRetrying(false);
        }

    }, [jobId]);

    if (!job && error === "") {
        return (
            <p className="text-xs text-neutral-400" role="status">
                Loading analysis status…
            </p>
        );
    }

    const progress = Math.max(0, Math.min(100, job?.progress ?? 0));
    const stage = job ? STAGE_LABELS[job.stage] ?? job.stage : "";
    const canRetry =
        job?.status === "failed" && job.attemptCount < job.maxAttempts;

    return (
        <div className="flex flex-col gap-2 rounded border border-neutral-800 p-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white">
                    Analysis
                </span>
                <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                    {job?.status ?? "…"}
                </span>
            </div>

            <div
                className="h-1.5 w-full overflow-hidden rounded bg-neutral-800"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <p className="text-[11px] text-neutral-400" role="status">
                {job?.status === "failed"
                    ? `Failed: ${job.errorMessage ?? "Analysis failed."}`
                    : `${stage} — ${progress}%`}
            </p>

            {error !== "" && (
                <p role="alert" className="text-[11px] text-red-400">
                    {error}
                </p>
            )}

            {canRetry && (
                <button
                    className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-white hover:text-white disabled:opacity-40"
                    disabled={retrying}
                    onClick={() => void handleRetry()}
                >
                    {retrying ? "Retrying…" : "Retry analysis"}
                </button>
            )}
        </div>
    );
}
