import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CoremationView from "./CoremationView";

vi.mock("../api", () => ({
    fetchWorkflows: vi.fn(),
    fetchWorkflow: vi.fn(),
    refineWorkflow: vi.fn()
}));

const { fetchWorkflows, fetchWorkflow, refineWorkflow } = vi.mocked(
    await import("../api")
);

/*
 * Build 05 Coremation view. The workflow payload below is the same shape the
 * backend returns; nothing here talks to a real server or a real model.
 */

const step = (
    key: string,
    label: string,
    kind: "entry" | "route" | "function" | "error",
    filePath: string,
    line: number,
    extra: Record<string, unknown> = {}
) => ({
    key,
    label,
    kind,
    entityId: `function:${filePath}:${label}`,
    filePath,
    line,
    evidence: "resolved",
    ...extra
});

const workflowPayload = (refinementState = "not-requested") => ({
    id: "wf:function:client/api.ts:loadOrder",
    repository: "demo",
    title: "loadOrder — call path",
    description: "Statically reconstructed candidate path through 2 resolved calls.",
    entryKey: "step:client",
    steps: [
        step("step:client", "loadOrder", "entry", "client/api.ts", 2),
        step("route:1", "GET /api/orders/:id", "route", "routes/orders.routes.ts", 6),
        step("step:controller", "getOrder", "function", "controllers/orders.controller.ts", 4, {
            branch: "if.then",
            condition: "!request.params.id"
        }),
        step("error:1", "throw at line 6", "error", "controllers/orders.controller.ts", 6)
    ],
    edges: [
        { from: "step:client", to: "route:1", kind: "http", evidence: "resolved" },
        { from: "route:1", to: "step:controller", kind: "call", evidence: "resolved" },
        { from: "step:controller", to: "error:1", kind: "throw", evidence: "ambiguous" }
    ],
    paths: [
        { id: "path:main", label: "Main path", kind: "main", stepKeys: ["step:client", "route:1", "step:controller"] },
        { id: "path:error", label: "Error path (source shows a throw)", kind: "error", stepKeys: ["step:client", "error:1"] }
    ],
    provenance: {
        graphFingerprint: "9:CALLS=1,CONTAINS=3:ev=3",
        evidenceVersion: "v1",
        resolvedCalls: 2,
        unresolvedCalls: 1,
        httpBoundaries: 1,
        branchPoints: 1,
        truncated: false,
        maxDepth: 10,
        maxSteps: 24
    },
    refinement: { state: refinementState }
});

const listPayload = () => ({
    repository: "demo",
    evidenceVersion: "v1" as const,
    count: 1,
    workflows: [
        {
            id: "wf:function:client/api.ts:loadOrder",
            title: "loadOrder — call path",
            entryLabel: "loadOrder",
            stepCount: 4,
            pathCount: 2,
            hasHttpBoundary: true,
            branchCount: 1,
            unresolvedCount: 1,
            evidenceVersion: "v1" as const
        }
    ]
});

/*
 * A controllable animation clock: frames only run when a test asks for
 * them, so playback assertions stay deterministic.
 */
let frameCallbacks: FrameRequestCallback[] = [];
let nowMs = 0;

function runFrames(elapsedMs: number): void {

    const stepSize = 16;

    act(() => {

        for (let elapsed = 0; elapsed < elapsedMs; elapsed += stepSize) {

            nowMs += stepSize;

            const pending = frameCallbacks;
            frameCallbacks = [];

            for (const callback of pending) {
                callback(nowMs);
            }
        }
    });
}

beforeEach(() => {

    frameCallbacks = [];
    nowMs = 0;

    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((callback: FrameRequestCallback) => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        })
    );

    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    vi.stubGlobal("performance", { now: () => nowMs });

    fetchWorkflows.mockResolvedValue(listPayload() as never);
    fetchWorkflow.mockResolvedValue(workflowPayload() as never);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe("CoremationView", () => {

    it("loads the candidate list and the first workflow", async () => {

        render(<CoremationView repository="demo" />);

        expect(await screen.findByText("loadOrder — call path")).toBeInTheDocument();
        expect(fetchWorkflows).toHaveBeenCalledWith("demo");
        expect(fetchWorkflow).toHaveBeenCalledWith("demo", "wf:function:client/api.ts:loadOrder");
    });

    it("shows loading state before data arrives", () => {

        fetchWorkflows.mockReturnValue(new Promise(() => {}) as never);

        render(<CoremationView repository="demo" />);

        expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("renders one node per step with a text badge, not colour alone", async () => {

        const { container } = render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        expect(container.querySelectorAll("rect")).toHaveLength(4);
        expect(screen.getAllByText("ENTRY")).toHaveLength(1);
        expect(screen.getAllByText(/ROUTE/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/ERROR/).length).toBeGreaterThan(0);
    });

    it("labels the animation as a simulated static traversal", async () => {

        render(<CoremationView repository="demo" />);

        expect(
            await screen.findByText(/simulated traversal of a candidate path/i)
        ).toBeInTheDocument();
    });

    it("selects a step and shows its evidence and source reference", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        fireEvent.click(
            screen.getByRole("button", {
                name: "CALL getOrder — controllers/orders.controller.ts:4"
            })
        );

        expect(await screen.findByText("!request.params.id")).toBeInTheDocument();
        expect(
            screen.getByText("controllers/orders.controller.ts:4")
        ).toBeInTheDocument();
        expect(screen.getByText("if.then")).toBeInTheDocument();
    });

    it("draws an uncertain transition dashed, so a guess never looks verified", async () => {

        const { container } = render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        const dashed = container.querySelectorAll(
            'path[stroke-dasharray="5 4"]'
        );

        expect(dashed.length).toBeGreaterThan(0);
    });

    it("plays, pauses, replays and resets without any backend call", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        fetchWorkflows.mockClear();
        fetchWorkflow.mockClear();

        fireEvent.click(screen.getByRole("button", { name: "Play" }));

        expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();

        runFrames(950);

        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        fireEvent.click(screen.getByRole("button", { name: "Replay" }));
        fireEvent.click(screen.getByRole("button", { name: "Reset" }));

        /* the speed button cycles upward */
        const speed = screen.getByRole("button", { name: /Speed/i });
        fireEvent.click(speed);
        expect(speed).toHaveTextContent("Speed 2x");

        expect(fetchWorkflows).not.toHaveBeenCalled();
        expect(fetchWorkflow).not.toHaveBeenCalled();
    });

    it("advances the highlighted step as frames run, with no new requests", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        /* only requests made after playback matter here */
        fetchWorkflow.mockClear();
        fetchWorkflows.mockClear();

        fireEvent.click(screen.getByRole("button", { name: "Play" }));

        runFrames(1000);

        /*
         * The first transition is now active, which is observable through the
         * highlighted edge stroke and the moved marker; no data request was
         * made to get here.
         */
        const highlighted = document.querySelectorAll('path[stroke="#ffffff"]');

        expect(highlighted.length).toBeGreaterThan(0);

        expect(
            screen.getByRole("button", {
                name: "ROUTE GET /api/orders/:id — routes/orders.routes.ts:6"
            })
        ).toHaveAttribute("aria-pressed", "true");

        expect(fetchWorkflow).not.toHaveBeenCalled();
    });

    it("moves the marker along the path as time passes", async () => {

        const { container } = render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        const before = container.querySelector("circle");

        expect(before).toBeTruthy();

        const xBefore = Number(before?.getAttribute("cx"));

        fireEvent.click(screen.getByRole("button", { name: "Play" }));

        runFrames(1000);

        const after = container.querySelector("circle");

        expect(Number(after?.getAttribute("cx"))).toBeGreaterThan(xBefore);
    });

    it("walks the path with the step buttons for reduced-motion users", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        fireEvent.click(screen.getByRole("button", { name: /Next step/i }));

        await waitFor(() =>
            expect(
                screen.getByRole("button", {
                    name: "ROUTE GET /api/orders/:id — routes/orders.routes.ts:6"
                })
            ).toHaveAttribute("aria-pressed", "true")
        );

        fireEvent.click(screen.getByRole("button", { name: /Prev step/i }));

        expect(
            screen.getByRole("button", {
                name: "ENTRY loadOrder — client/api.ts:2"
            })
        ).toHaveAttribute("aria-pressed", "true");
    });

    it("switches between mutually exclusive paths", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        const select = screen.getByLabelText("Path") as HTMLSelectElement;

        expect(select.options).toHaveLength(2);

        fireEvent.change(select, { target: { value: "path:error" } });

        expect(
            screen.getByRole("option", { name: /Error path/i })
        ).toBeInTheDocument();

        /*
         * Switching paths restarts the traversal at the first step of the
         * selected path and never mixes it with the other branch.
         */
        await waitFor(() =>
            expect(
                screen.getByRole("button", {
                    name: "ENTRY loadOrder — client/api.ts:2"
                })
            ).toHaveAttribute("aria-pressed", "true")
        );

        fireEvent.click(screen.getByRole("button", { name: /Next step/i }));

        await waitFor(() =>
            expect(
                screen.getByRole("button", {
                    name: "ERROR throw at line 6 — controllers/orders.controller.ts:6"
                })
            ).toHaveAttribute("aria-pressed", "true")
        );

        /* the main path's middle step is not part of this traversal */
        expect(
            screen.getByRole("button", {
                name: "ROUTE GET /api/orders/:id — routes/orders.routes.ts:6"
            })
        ).toHaveAttribute("aria-pressed", "false");
    });

    it("shows AI wording as a separate, attributed label", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        refineWorkflow.mockResolvedValue({
            ...workflowPayload("applied"),
            refinement: {
                state: "applied",
                stepLabels: { "step:client": "Ask the API for one order" },
                title: "Load an order"
            }
        } as never);

        fireEvent.click(screen.getByRole("button", { name: /Improve labels/i }));

        expect(
            await screen.findByText(/AI wording applied/i)
        ).toBeInTheDocument();

        /* The deterministic label stays visible; AI wording is attributed. */
        expect(screen.getAllByText("loadOrder").length).toBeGreaterThan(0);
        expect(refineWorkflow).toHaveBeenCalled();
    });

    it("explains refinement unavailability and keeps deterministic labels", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        refineWorkflow.mockResolvedValue({
            ...workflowPayload("unavailable"),
            refinement: {
                state: "unavailable",
                note: "The LLM API key is not configured."
            }
        } as never);

        fireEvent.click(screen.getByRole("button", { name: /Improve labels/i }));

        expect(
            await screen.findByText(/Refinement unavailable — showing deterministic labels/i)
        ).toBeInTheDocument();
        expect(screen.getAllByText("loadOrder").length).toBeGreaterThan(0);
    });

    it("cancels its animation frame on unmount", async () => {

        const { unmount } = render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        unmount();

        expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled();
    });

    it("shows a text alternative of the path", async () => {

        render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        fireEvent.click(screen.getByText("Text alternative of this path"));

        expect(
            await screen.findByText(/1\. ENTRY loadOrder \(client\/api\.ts:2\)/)
        ).toBeInTheDocument();
    });

    it("reports an empty repository honestly", async () => {

        fetchWorkflows.mockResolvedValue({
            repository: "demo",
            evidenceVersion: "v1",
            count: 0,
            workflows: []
        } as never);

        render(<CoremationView repository="demo" />);

        expect(
            await screen.findByText(/No workflow could be reconstructed/i)
        ).toBeInTheDocument();
    });

    it("tells the user when the stored graph predates the evidence", async () => {

        fetchWorkflows.mockResolvedValue({
            repository: "demo",
            evidenceVersion: "none",
            count: 0,
            workflows: []
        } as never);

        render(<CoremationView repository="demo" />);

        expect(await screen.findByText(/predates Build 05 workflow evidence/i)).toBeInTheDocument();
    });

    it("surfaces an API error with a retry action", async () => {

        fetchWorkflows.mockRejectedValue(new Error("Neo4j is unavailable") as never);

        render(<CoremationView repository="demo" />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Neo4j is unavailable");

        fetchWorkflows.mockResolvedValue(listPayload() as never);

        fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

        expect(await screen.findByText("loadOrder — call path")).toBeInTheDocument();
    });

    it("reloads when the repository changes", async () => {

        const { rerender } = render(<CoremationView repository="demo" />);

        await screen.findByText("loadOrder — call path");

        fetchWorkflows.mockResolvedValue({
            ...listPayload(),
            workflows: [
                {
                    ...listPayload().workflows[0],
                    id: "wf:other",
                    title: "otherWorkflow — call path"
                }
            ]
        } as never);

        rerender(<CoremationView repository="other" />);

        expect(await screen.findByText("otherWorkflow — call path")).toBeInTheDocument();
        expect(fetchWorkflows).toHaveBeenCalledWith("other");
    });
});
