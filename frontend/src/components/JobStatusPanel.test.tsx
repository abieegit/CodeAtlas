import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JobStatusPanel from "./JobStatusPanel";
import type { AnalysisJob } from "../api";

vi.mock("../api", () => ({
    fetchJob: vi.fn(),
    retryJob: vi.fn()
}));

import { fetchJob, retryJob } from "../api";

const fetchJobMock = vi.mocked(fetchJob);
const retryJobMock = vi.mocked(retryJob);

function makeJob(overrides: Partial<AnalysisJob> = {}): AnalysisJob {
    return {
        id: "job-1",
        repositoryId: "repo-1",
        status: "processing",
        progress: 50,
        stage: "parsing",
        errorMessage: null,
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: "2026-01-01T00:00:00Z",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        ...overrides
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("JobStatusPanel (Build 07)", () => {

    it("shows the real persisted stage and progress", async () => {
        fetchJobMock.mockResolvedValue(makeJob());

        render(<JobStatusPanel jobId="job-1" onCompleted={vi.fn()} />);

        expect(
            await screen.findByText(/Parsing source — 50%/)
        ).toBeInTheDocument();
    });

    it("calls onCompleted with the repository id when the job completes", async () => {
        const onCompleted = vi.fn();
        fetchJobMock.mockResolvedValue(
            makeJob({ status: "completed", progress: 100, stage: "completed" })
        );

        render(<JobStatusPanel jobId="job-1" onCompleted={onCompleted} />);

        await vi.waitFor(() =>
            expect(onCompleted).toHaveBeenCalledWith("repo-1")
        );
    });

    it("shows a safe error and offers a retry for a failed job", async () => {
        fetchJobMock.mockResolvedValue(
            makeJob({
                status: "failed",
                stage: "failed",
                errorMessage: "Analysis failed."
            })
        );
        retryJobMock.mockResolvedValue(makeJob());

        render(<JobStatusPanel jobId="job-1" onCompleted={vi.fn()} />);

        expect(
            await screen.findByText(/Analysis failed\./)
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /retry analysis/i })
        );

        await vi.waitFor(() =>
            expect(retryJobMock).toHaveBeenCalledWith("job-1")
        );
    });

    it("does not offer a retry when attempts are exhausted", async () => {
        fetchJobMock.mockResolvedValue(
            makeJob({
                status: "failed",
                stage: "failed",
                errorMessage: "Unsupported repository.",
                attemptCount: 3,
                maxAttempts: 3
            })
        );

        render(<JobStatusPanel jobId="job-1" onCompleted={vi.fn()} />);

        expect(
            await screen.findByText(/Unsupported repository\./)
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    });
});
