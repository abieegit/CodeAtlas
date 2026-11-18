import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { EnqueueResponse } from "./api";
import type { GraphData } from "./types";

vi.mock("./api", () => ({
    analyzeArchive: vi.fn(),
    loadGraph: vi.fn(),
    listRepositories: vi.fn(),
    listJobs: vi.fn(),
    fetchJob: vi.fn(),
    retryJob: vi.fn(),
    fetchAnalysisReport: vi.fn(),
    fetchFunctionSummary: vi.fn(),
    fetchWorkflows: vi.fn(),
    fetchWorkflow: vi.fn(),
    refineWorkflow: vi.fn(),
    clearWorkflowCaches: vi.fn()
}));

const {
    analyzeArchive,
    loadGraph,
    listJobs,
    listRepositories,
    fetchJob,
    fetchWorkflows,
    fetchWorkflow
} = vi.mocked(await import("./api"));

function makeGraph(options: { outOfScopeDb?: boolean } = {}): GraphData {
    return {
        nodes: [
            {
                id: "file:src/db/connection.ts",
                type: "File",
                name: "connection.ts",
                filePath: "src/db/connection.ts",
                startLine: 1,
                endLine: 10,
                inDefaultScope: options.outOfScopeDb ? false : true
            },
            {
                id: "file:src/utils/helpers.ts",
                type: "File",
                name: "helpers.ts",
                filePath: "src/utils/helpers.ts",
                startLine: 1,
                endLine: 20,
                inDefaultScope: true
            },
            {
                id: "function:src/db/connection.ts:connect",
                type: "Function",
                name: "connect",
                filePath: "src/db/connection.ts",
                startLine: 2,
                endLine: 8,
                inDefaultScope: options.outOfScopeDb ? false : true
            }
        ],
        relationships: [
            {
                source: "file:src/db/connection.ts",
                target: "function:src/db/connection.ts:connect",
                type: "CONTAINS"
            }
        ]
    };
}

function makeEnqueue(): EnqueueResponse {
    return {
        repositoryId: "demo",
        repositoryName: "demo",
        jobId: "job-1",
        status: "pending"
    };
}

beforeEach(() => {
    listJobs.mockResolvedValue([]);
    listRepositories.mockResolvedValue([]);
});

/**
 * Build 07: an upload queues a job; the status panel polls until it completes,
 * then the existing graph viewer loads the finished graph.
 */
async function analyze(graph: GraphData) {
    analyzeArchive.mockResolvedValue(makeEnqueue());

    fetchJob.mockResolvedValue({
        id: "job-1",
        repositoryId: "demo",
        status: "completed",
        progress: 100,
        stage: "completed",
        errorMessage: null,
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: "2026-01-01T00:00:00Z",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:00:00Z"
    });

    loadGraph.mockResolvedValue(graph);

    const { container } = render(<App />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
        target: { files: [new File(["zip"], "demo.zip")] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze repository" }));

    /*
     * The job completes → App loads the graph → the graph-only search box
     * appears, which is what the rest of these tests interact with.
     */
    await screen.findByLabelText("Search graph nodes");

    return container;
}

afterEach(async () => {
    cleanup();
    vi.clearAllMocks();
    /*
     * The mounted GraphView leaves a final d3-timer wake scheduled by its
     * unmount cleanup; a short real delay lets it fire (jsdom runs real
     * requestAnimationFrame) so later tests in this file tick normally.
     */
    await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("App search integration", () => {

    it("navigates a search result to the details panel", async () => {
        await analyze(makeGraph());

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "connection" } }
        );

        // Both the file and the function inside it match; pick the file.
        const fileResult = screen
            .getAllByRole("button", { name: /connection/ })
            .find((button) => button.textContent?.includes("File"));

        expect(fileResult).toBeDefined();
        fireEvent.click(fileResult!);

        const heading = await screen.findByRole("heading", {
            name: "connection.ts"
        });

        expect(heading).toBeInTheDocument();
        expect(screen.getByText("src/db/connection.ts")).toBeInTheDocument();
    });

    it("reveals an out-of-scope search result on demand", async () => {
        await analyze(makeGraph({ outOfScopeDb: true }));

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "connection" } }
        );

        const hiddenNotes = screen.getAllByText(/Hidden:/);
        expect(hiddenNotes.length).toBeGreaterThan(0);
        expect(hiddenNotes[0]).toHaveTextContent(
            "outside the Application scope"
        );

        fireEvent.click(
            screen.getAllByRole("button", { name: /Reveal & select/i })[0]
        );

        expect(
            await screen.findByRole("heading", { name: "connection.ts" })
        ).toBeInTheDocument();
    });
});

describe("App Coremation tab (Build 05)", () => {

    const workflowList = {
        repository: "demo",
        evidenceVersion: "v1" as const,
        count: 1,
        workflows: [
            {
                id: "wf:function:src/db/connection.ts:connect",
                title: "connect — call path",
                entryLabel: "connect",
                stepCount: 2,
                pathCount: 1,
                hasHttpBoundary: false,
                branchCount: 0,
                unresolvedCount: 0,
                evidenceVersion: "v1" as const
            }
        ]
    };

    const workflowPayload = {
        id: "wf:function:src/db/connection.ts:connect",
        repository: "demo",
        title: "connect — call path",
        description: "Statically reconstructed candidate path through 1 resolved call.",
        entryKey: "step:connect",
        steps: [
            {
                key: "step:connect",
                label: "connect",
                kind: "entry",
                entityId: "function:src/db/connection.ts:connect",
                filePath: "src/db/connection.ts",
                line: 2,
                evidence: "resolved"
            },
            {
                key: "step:connect->helper:1",
                label: "helper",
                kind: "function",
                entityId: "function:src/utils/helpers.ts:helper",
                filePath: "src/utils/helpers.ts",
                line: 4,
                evidence: "resolved"
            }
        ],
        edges: [
            {
                from: "step:connect",
                to: "step:connect->helper:1",
                kind: "call",
                evidence: "resolved"
            }
        ],
        paths: [
            {
                id: "path:main",
                label: "Main path",
                kind: "main",
                stepKeys: ["step:connect", "step:connect->helper:1"]
            }
        ],
        provenance: {
            graphFingerprint: "5:CALLS=1,CONTAINS=3:ev=2",
            evidenceVersion: "v1",
            resolvedCalls: 1,
            unresolvedCalls: 0,
            httpBoundaries: 0,
            branchPoints: 0,
            truncated: false,
            maxDepth: 10,
            maxSteps: 24
        },
        refinement: { state: "not-requested" }
    };

    it("sits immediately after Analysis Report and renders the workflow", async () => {

        fetchWorkflows.mockResolvedValue(workflowList as never);
        fetchWorkflow.mockResolvedValue(workflowPayload as never);

        await analyze(makeGraph());

        const tabs = screen.getAllByRole("button").filter((button) =>
            ["Knowledge Graph", "Analysis Report", "Coremation"].includes(
                button.textContent ?? ""
            )
        );

        expect(tabs.map((tab) => tab.textContent)).toEqual([
            "Knowledge Graph",
            "Analysis Report",
            "Coremation"
        ]);

        fireEvent.click(screen.getByRole("button", { name: "Coremation" }));

        expect(await screen.findByText("connect — call path")).toBeInTheDocument();
        expect(
            await screen.findByText(/simulated traversal of a candidate path/i)
        ).toBeInTheDocument();
        expect(fetchWorkflows).toHaveBeenCalledWith("demo");
    });

    it("does not disturb the knowledge graph when switching back", async () => {

        fetchWorkflows.mockResolvedValue(workflowList as never);
        fetchWorkflow.mockResolvedValue(workflowPayload as never);

        await analyze(makeGraph());

        fireEvent.click(screen.getByRole("button", { name: "Coremation" }));
        await screen.findByText("connect — call path");

        fireEvent.click(screen.getByRole("button", { name: "Knowledge Graph" }));

        /* The graph-only controls come back, proving the tab switch is clean. */
        expect(screen.getByRole("button", { name: /Fit graph/i })).toBeInTheDocument();
        expect(screen.getByLabelText("Search graph nodes")).toBeInTheDocument();
    });

    it("asks for a repository before showing workflows", async () => {

        render(<App />);

        fireEvent.click(screen.getByRole("button", { name: "Coremation" }));

        /*
         * With nothing loaded the app keeps its upload prompt; the tab must
         * not go and ask the backend for workflows of an unknown repository.
         */
        expect(
            await screen.findByText(/Upload a repository ZIP/i)
        ).toBeInTheDocument();
        expect(fetchWorkflows).not.toHaveBeenCalled();
    });
});
