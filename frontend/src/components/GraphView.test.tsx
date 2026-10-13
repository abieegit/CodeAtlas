import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GraphView, { type GraphViewHandle } from "./GraphView";

import type { GraphData, GraphNode } from "../types";

/**
 * d3-timer captures `window.requestAnimationFrame` and the `performance`
 * object when its module loads, so faking timers alone is not enough. These
 * hoisted stubs are installed BEFORE the modules are imported: request
 * animation frames go through setTimeout (which fake timers intercept) and
 * d3's clock reads a controllable time source.
 */
const clock = vi.hoisted(() => {

    const state = { time: 0 };

    const fakePerformance = { now: () => state.time };

    try {
        Object.defineProperty(globalThis, "performance", {
            value: fakePerformance,
            configurable: true,
            writable: true
        });
    } catch {
        // jsdom without a configurable performance — d3 falls back to real time.
    }

    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
        callback: (time: number) => void
    ) => {
        return (globalThis as {
            setTimeout: (fn: () => void, ms: number) => number;
        }).setTimeout(() => callback(state.time), 16);
    };

    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (
        handle: number
    ) => {
        return (globalThis as {
            clearTimeout: (handle: number) => void;
        }).clearTimeout(handle);
    };

    return state;
});

function node(
    id: string,
    type: GraphNode["type"],
    name: string,
    filePath: string = `src/${name}.ts`
): GraphNode {
    return { id, type, name, filePath, startLine: 1, endLine: 2 };
}

function iconGraph(): GraphData {
    return {
        nodes: [
            node("file:src/db/connection.ts", "File", "connection.ts", "src/db/connection.ts"),
            node("file:src/utils/helpers.ts", "File", "helpers.ts", "src/utils/helpers.ts"),
            node(
                "function:src/integrations/webhooks.ts:sendWebhook",
                "Function",
                "sendWebhook",
                "src/integrations/webhooks.ts"
            )
        ],
        relationships: []
    };
}

function chainGraph(): GraphData {
    return {
        nodes: [
            node("function:main.ts:main", "Function", "main"),
            node("function:main.ts:step", "Function", "step"),
            node("function:main.ts:leaf", "Function", "leaf")
        ],
        relationships: [
            { source: "function:main.ts:main", target: "function:main.ts:step", type: "CALLS" },
            { source: "function:main.ts:step", target: "function:main.ts:leaf", type: "CALLS" }
        ]
    };
}

function subsetGraph(): GraphData {
    return {
        nodes: [
            node("function:main.ts:main", "Function", "main"),
            node("function:main.ts:step", "Function", "step")
        ],
        relationships: [
            { source: "function:main.ts:main", target: "function:main.ts:step", type: "CALLS" }
        ]
    };
}

function svgOf(container: HTMLElement): SVGSVGElement {
    return container.querySelector("svg") as SVGSVGElement;
}

/** k of the d3-zoom state stored on the svg element. */
function zoomStateOf(container: HTMLElement): { k: number; x: number; y: number } {
    const zoom = (svgOf(container) as unknown as {
        __zoom: { k: number; x: number; y: number };
    }).__zoom;
    return zoom;
}

/** k of the zoom container <g> transform actually applied to the scene. */
function appliedKOf(container: HTMLElement): number {

    const transform = svgOf(container)
        .querySelector("g")
        ?.getAttribute("transform") ?? "";

    const match = transform.match(/scale\(([-\d.]+)\)/);

    return match ? Number(match[1]) : 1;
}

function nodeTransform(
    container: HTMLElement,
    name: string
): { x: number; y: number } | null {

    const groups = Array.from(
        svgOf(container).querySelectorAll("g g g")
    );

    const group = groups.find(
        (entry) => entry.querySelector("title")?.textContent?.includes(name)
    );

    if (!group) {
        return null;
    }

    const match = (group.getAttribute("transform") ?? "").match(
        /translate\(([-\d.]+),([-\d.]+)\)/
    );

    return match
        ? { x: Number(match[1]), y: Number(match[2]) }
        : null;
}

/**
 * Advance the controllable clock and the intercepted timers together, so
 * simulation frames and transitions run deterministically.
 */
function advance(ms: number): void {
    act(() => {
        clock.time += ms;
        vi.advanceTimersByTime(ms);
    });
}

/**
 * Long advances are split into chunks: a single very large
 * advanceTimersByTime can hit the fake-timer loop limit and silently stop
 * mid-way, while the real d3 frame loop fires every ~16ms.
 */
function advanceLong(ms: number, step = 250): void {
    let remaining = ms;
    while (remaining > 0) {
        const chunk = Math.min(step, remaining);
        advance(chunk);
        remaining -= chunk;
    }
}

function dblClickZoom(container: HTMLElement): void {
    fireEvent.dblClick(svgOf(container), { clientX: 10, clientY: 10 });
    advance(400);
}

beforeEach(() => {
    clock.time = 0;
    vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"]
    });
});

afterEach(() => {
    cleanup();
    /*
     * Unmounting stops the simulation, which schedules one last d3-timer
     * wake. It must fire while the fake clock is still installed: d3 is an
     * externalised dependency, so its module-level `frame` flag survives
     * across tests, and a discarded wake leaves it set — every later test
     * in this file would then silently stop ticking.
     *
     * Two flushes cover both React effect-flush orderings (at act entry and
     * at act exit).
     */
    act(() => {
        clock.time += 300;
        vi.advanceTimersByTime(300);
    });
    act(() => {
        clock.time += 300;
        vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
});

describe("GraphView viewport persistence", () => {

    it("keeps the user's zoom after the simulation settles (regression for the ~3s reset)", async () => {
        const { container } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advance(100);
        dblClickZoom(container);

        expect(zoomStateOf(container).k).toBe(2);
        expect(appliedKOf(container)).toBe(2);

        // Past the whole settle window (the old code reset the view here).
        advanceLong(15000);

        expect(zoomStateOf(container).k).toBe(2);
        expect(appliedKOf(container)).toBe(2);
    });

    it("restores the applied viewport transform after a same-layout re-render", async () => {
        const { container, rerender } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advance(100);
        dblClickZoom(container);

        rerender(
            <GraphView
                graph={subsetGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advance(2000);

        expect(zoomStateOf(container).k).toBe(2);
        expect(appliedKOf(container)).toBe(2);
    });

    it("auto-fits a fresh layout once when the user has not navigated, and not again", async () => {
        const { container, rerender } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advanceLong(15000);

        const fitted = zoomStateOf(container).k;
        expect(fitted).toBeGreaterThan(1);

        rerender(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advanceLong(15000);

        expect(zoomStateOf(container).k).toBe(fitted);
    });

    it("keeps node coordinates across a same-layout re-render", async () => {
        const { container, rerender } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advance(800);

        // "step" exists in both the full chain and the re-rendered subset.
        const before = nodeTransform(container, "step");
        expect(before).not.toBeNull();

        rerender(
            <GraphView
                graph={subsetGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advance(40);

        const after = nodeTransform(container, "step");
        expect(after).not.toBeNull();

        const distance = Math.hypot(
            after!.x - before!.x,
            after!.y - before!.y
        );

        expect(distance).toBeLessThan(80);
    });

    it("starts a fresh layout when the layout key changes", async () => {
        const { container, rerender } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
            />
        );

        advanceLong(15000);

        expect(zoomStateOf(container).k).toBeGreaterThan(1);

        rerender(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-b"
            />
        );

        advance(50);

        // A new layout begins untransformed and re-fits after settling.
        expect(zoomStateOf(container).k).toBe(1);

        advanceLong(15000);

        expect(zoomStateOf(container).k).toBeGreaterThan(1);
    });
});

describe("GraphView imperative actions", () => {

    it("Fit graph fits the graph into the viewport", async () => {
        const ref = createRef<GraphViewHandle>();
        const { container } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
                ref={ref}
            />
        );

        advance(50);

        act(() => {
            ref.current?.fitToView();
        });

        advance(600);

        // jsdom falls back to the 900x640 viewport; the three nodes occupy
        // a small area, so the fit scale is capped at 1.5.
        expect(zoomStateOf(container).k).toBeGreaterThan(1);
    });

    it("revealNode centres the given node without restarting the simulation", async () => {
        const onSelect = vi.fn();
        const ref = createRef<GraphViewHandle>();
        const { container } = render(
            <GraphView
                graph={chainGraph()}
                selectedId={null}
                onSelect={onSelect}
                layoutKey="repo-a"
                ref={ref}
            />
        );

        // Let the layout settle so node coordinates stop moving.
        advanceLong(15000);

        act(() => {
            ref.current?.revealNode("function:main.ts:leaf");
        });

        advance(600);

        const zoom = zoomStateOf(container);
        const target = nodeTransform(container, "leaf");

        expect(target).not.toBeNull();

        // The revealed node is horizontally centred in the 900px viewport.
        const centreX = zoom.k * target!.x + zoom.x;
        expect(centreX).toBeCloseTo(450, 0);
    });
});

describe("GraphView architectural icon overlay", () => {

    it("renders no icons while the overlay is off", () => {
        const { container } = render(
            <GraphView
                graph={iconGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
                showIcons={false}
            />
        );

        advance(50);

        expect(container.querySelectorAll("use")).toHaveLength(0);
        // The reusable artwork is declared even when unused.
        expect(
            container.querySelectorAll("symbol[id^='ca-icon-']").length
        ).toBeGreaterThan(0);
    });

    it("renders icons only for classified nodes and restores the original look", () => {
        const { container, rerender } = render(
            <GraphView
                graph={iconGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
                showIcons
            />
        );

        advance(50);

        // database + external are classified; helpers.ts stays plain.
        expect(container.querySelectorAll("use")).toHaveLength(2);

        rerender(
            <GraphView
                graph={iconGraph()}
                selectedId={null}
                onSelect={vi.fn()}
                layoutKey="repo-a"
                showIcons={false}
            />
        );

        expect(container.querySelectorAll("use")).toHaveLength(0);
        expect(
            container.querySelectorAll("g.ca-icon-badge")
        ).toHaveLength(0);
    });

    it("toggling icons preserves the viewport, node positions and graph data", () => {
        const graph = iconGraph();
        const graphSnapshot = JSON.stringify(graph);
        // Stable callbacks: a new onSelect identity would legitimately
        // re-run the main effect; the toggle itself must not.
        const onSelect = vi.fn();

        const { container, rerender } = render(
            <GraphView
                graph={graph}
                selectedId={null}
                onSelect={onSelect}
                layoutKey="repo-a"
                showIcons={false}
            />
        );

        advanceLong(15000);

        const zoomBefore = zoomStateOf(container);
        const nodeBefore = nodeTransform(container, "connection.ts");
        expect(nodeBefore).not.toBeNull();

        rerender(
            <GraphView
                graph={graph}
                selectedId={null}
                onSelect={onSelect}
                layoutKey="repo-a"
                showIcons
            />
        );

        advance(100);

        rerender(
            <GraphView
                graph={graph}
                selectedId={null}
                onSelect={onSelect}
                layoutKey="repo-a"
                showIcons={false}
            />
        );

        advance(100);

        const zoomAfter = zoomStateOf(container);
        const nodeAfter = nodeTransform(container, "connection.ts");

        expect(zoomAfter.k).toBe(zoomBefore.k);
        expect(zoomAfter.x).toBe(zoomBefore.x);
        expect(zoomAfter.y).toBe(zoomBefore.y);
        expect(nodeAfter!.x).toBe(nodeBefore!.x);
        expect(nodeAfter!.y).toBe(nodeBefore!.y);
        expect(JSON.stringify(graph)).toBe(graphSnapshot);
    });
});
