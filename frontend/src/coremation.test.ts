import { describe, expect, it } from "vitest";

import {
    advance,
    canvasSize,
    describeWorkflowTextually,
    edgeIsUncertain,
    edgePath,
    initialPlayback,
    layoutWorkflow,
    markerPosition,
    pathStepKeys,
    prefersReducedMotion,
    preferredPath,
    presentStep,
    SPEEDS
} from "./coremation";

import type { Workflow } from "./workflow";

/*
 * Coremation's pure view helpers: layout, playback maths and label rules.
 * None of this touches the network, so these tests also prove the animation
 * cannot trigger a model call.
 */

function workflow(overrides: Partial<Workflow> = {}): Workflow {
    return {
        id: "wf:demo",
        repository: "demo",
        title: "loadOrder — call path",
        description: "Statically reconstructed candidate path.",
        entryKey: "step:client",
        steps: [
            {
                key: "step:client",
                label: "loadOrder",
                kind: "entry",
                entityId: "function:client/api.ts:loadOrder",
                filePath: "client/api.ts",
                line: 2,
                evidence: "resolved",
                sequence: 0
            },
            {
                key: "route:GET:/api/orders/:id:6",
                label: "GET /api/orders/:id",
                kind: "route",
                entityId: "function:controllers/orders.controller.ts:getOrder",
                filePath: "routes/orders.routes.ts",
                line: 6,
                evidence: "resolved"
            },
            {
                key: "step:controller",
                label: "getOrder",
                kind: "function",
                entityId: "function:controllers/orders.controller.ts:getOrder",
                filePath: "controllers/orders.controller.ts",
                line: 4,
                branch: "if.then",
                condition: "!request.params.id",
                evidence: "resolved"
            },
            {
                key: "error:controller:6",
                label: "throw at line 6",
                kind: "error",
                entityId: "function:controllers/orders.controller.ts:getOrder",
                filePath: "controllers/orders.controller.ts",
                line: 6,
                evidence: "resolved"
            }
        ],
        edges: [
            {
                from: "step:client",
                to: "route:GET:/api/orders/:id:6",
                kind: "http",
                evidence: "resolved"
            },
            {
                from: "route:GET:/api/orders/:id:6",
                to: "step:controller",
                kind: "call",
                evidence: "resolved"
            },
            {
                from: "step:controller",
                to: "error:controller:6",
                kind: "throw",
                evidence: "unresolved"
            }
        ],
        paths: [
            {
                id: "path:main",
                label: "Main path",
                kind: "main",
                stepKeys: ["step:client", "route:GET:/api/orders/:id:6", "step:controller"]
            },
            {
                id: "path:error",
                label: "Error path (source shows a throw)",
                kind: "error",
                stepKeys: ["step:client", "error:controller:6"]
            }
        ],
        provenance: {
            graphFingerprint: "9:CALLS=1,CONTAINS=3:ev=3",
            evidenceVersion: "v1",
            resolvedCalls: 2,
            unresolvedCalls: 1,
            selfCalls: 1,
            httpBoundaries: 1,
            branchPoints: 1,
            truncated: false,
            maxDepth: 10,
            maxSteps: 24
        },
        refinement: { state: "not-requested" },
        ...overrides
    };
}

describe("layoutWorkflow", () => {

    it("places the entry first and each reachable step one layer later", () => {

        const positions = layoutWorkflow(workflow());

        expect(positions.get("step:client")?.layer).toBe(0);
        expect(positions.get("route:GET:/api/orders/:id:6")?.layer).toBe(1);
        expect(positions.get("step:controller")?.layer).toBe(2);
    });

    it("is deterministic for the same workflow", () => {

        const first = [...layoutWorkflow(workflow()).entries()].map(
            ([key, position]) => `${key}:${position.x},${position.y}`
        );

        const second = [...layoutWorkflow(workflow()).entries()].map(
            ([key, position]) => `${key}:${position.x},${position.y}`
        );

        expect(first).toEqual(second);
    });

    it("never overlaps two steps in the same layer", () => {

        const positions = layoutWorkflow(workflow());
        const ys = [...positions.values()]
            .filter((position) => position.layer === (positions.get("error:controller:6")?.layer ?? -1))
            .map((position) => position.y);

        expect(new Set(ys).size).toBe(ys.length);
    });

    it("sizes the canvas to contain every node", () => {

        const positions = layoutWorkflow(workflow());
        const size = canvasSize(positions);

        for (const position of positions.values()) {
            expect(position.x + position.width).toBeLessThanOrEqual(size.width);
            expect(position.y + position.height).toBeLessThanOrEqual(size.height);
        }
    });

    it("returns no path for an edge whose ends are unknown", () => {

        const positions = layoutWorkflow(workflow());

        expect(edgePath(positions, { from: "nope", to: "step:client", kind: "call", evidence: "resolved" })).toBeNull();
        expect(edgePath(positions, workflow().edges[0])).toContain("M ");
    });
});

describe("playback maths", () => {

    it("does not advance while paused", () => {

        const state = initialPlayback("path:main");

        expect(advance(state, 3, 5000)).toEqual(state);
    });

    it("walks the path in order and finishes at the last step", () => {

        let state = { ...initialPlayback("path:main"), playing: true };

        state = advance(state, 3, 900);

        expect(state.index).toBe(1);
        expect(state.playing).toBe(true);

        state = advance(state, 3, 1800);

        expect(state.index).toBe(2);
        expect(state.finished).toBe(true);
        expect(state.playing).toBe(false);
    });

    it("respects the speed setting", () => {

        const fast = advance({ ...initialPlayback("path:main", 2), playing: true }, 3, 900);

        expect(fast.index).toBe(2);
        expect(SPEEDS).toEqual([0.5, 1, 2]);
    });

    it("never runs past the end of a path", () => {

        const state = advance({ ...initialPlayback("path:main"), playing: true }, 1, 10_000);

        expect(state.index).toBe(0);
        expect(state.finished).toBe(true);
    });

    it("puts the marker on the current step at progress 0", () => {

        const positions = layoutWorkflow(workflow());
        const keys = pathStepKeys(workflow().paths[0]);

        const marker = markerPosition(positions, keys, initialPlayback("path:main"));

        const entry = positions.get("step:client");

        expect(marker).toEqual({
            x: (entry?.x ?? 0) + (entry?.width ?? 0) / 2,
            y: (entry?.y ?? 0) + (entry?.height ?? 0) / 2
        });
    });

    it("interpolates between steps as progress advances", () => {

        const positions = layoutWorkflow(workflow());
        const keys = pathStepKeys(workflow().paths[0]);

        const at0 = markerPosition(positions, keys, initialPlayback("path:main"));
        const atHalf = markerPosition(
            positions,
            keys,
            { ...initialPlayback("path:main"), playing: true, progress: 0.5 }
        );

        expect(atHalf!.x).toBeGreaterThan(at0!.x);
    });

    it("returns no marker for an empty path", () => {

        expect(markerPosition(layoutWorkflow(workflow()), [], initialPlayback("x"))).toBeNull();
    });

    it("prefers the main path and falls back sensibly", () => {

        const base = workflow();

        expect(preferredPath(base)?.id).toBe("path:main");
        expect(preferredPath({ ...base, paths: [base.paths[1]] })?.kind).toBe("error");
        expect(preferredPath({ ...base, paths: [] })).toBeUndefined();
    });
});

describe("labels and honesty markers", () => {

    it("shows the source-derived label until a refinement is applied", () => {

        const step = workflow().steps[2];

        expect(presentStep(step).label).toBe("getOrder");
        expect(presentStep(step).refined).toBe(false);
    });

    it("marks AI wording as AI wording", () => {

        const step = workflow().steps[2];

        const presentation = presentStep(step, {
            state: "applied",
            stepLabels: { [step.key]: "Validate and read the order" }
        });

        expect(presentation.label).toBe("Validate and read the order");
        expect(presentation.refined).toBe(true);
    });

    it("keeps ambiguous and unresolved evidence visible in the label", () => {

        const ambiguous = presentStep({ ...workflow().steps[2], evidence: "ambiguous" });

        expect(ambiguous.label).toContain("ambiguous");

        const uncertain = workflow().edges[2];

        expect(edgeIsUncertain(uncertain)).toBe(true);
        expect(edgeIsUncertain(workflow().edges[0])).toBe(false);
    });

    it("uses text badges, not colour alone", () => {

        const step = workflow().steps[1];

        expect(presentStep(step).badge).toBe("ROUTE");
        expect(presentStep(workflow().steps[0]).badge).toBe("ENTRY");
        expect(presentStep(workflow().steps[3]).badge).toBe("ERROR");
    });

    it("describes a path as ordered text", () => {

        const text = describeWorkflowTextually(workflow(), workflow().paths[0]);

        expect(text).toContain("loadOrder");
        expect(text.indexOf("loadOrder")).toBeLessThan(
            text.indexOf("GET /api/orders/:id")
        );
        expect(text).toContain("client/api.ts:2");
    });
});

describe("reduced motion", () => {

    it("is detected when the platform asks for it", () => {

        expect(
            prefersReducedMotion(() => ({ matches: true }))
        ).toBe(true);

        expect(
            prefersReducedMotion(() => ({ matches: false }))
        ).toBe(false);
    });

    it("is false when matchMedia is unavailable or throws", () => {

        expect(prefersReducedMotion(undefined)).toBe(false);

        expect(
            prefersReducedMotion(() => {
                throw new Error("no matchMedia");
            })
        ).toBe(false);
    });
});
