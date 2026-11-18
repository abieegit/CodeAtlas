import type {
    Workflow,
    WorkflowEdge,
    WorkflowPath,
    WorkflowStep,
    WorkflowStepKind
} from "./workflow";

/*
 * Pure Coremation helpers: layout, playback timing and label resolution.
 * No React, no D3, no network — everything here is unit-testable and is the
 * only place the animation maths lives, so the view stays declarative.
 */

export interface NodePosition {
    key: string;
    x: number;
    y: number;
    width: number;
    height: number;
    layer: number;
}

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 56;
export const LAYER_GAP = 228;
export const ROW_GAP = 76;
export const MARGIN_X = 28;
export const MARGIN_Y = 28;

/** Milliseconds to travel between two steps at 1x speed. */
export const STEP_DURATION_MS = 900;
export const SPEEDS = [0.5, 1, 2] as const;

export interface PlaybackState {
    pathId: string;
    /** Index into the path's step list. */
    index: number;
    /** 0..1 travel between the current step and the next. */
    progress: number;
    playing: boolean;
    speed: number;
    finished: boolean;
}

export function initialPlayback(pathId: string, speed = 1): PlaybackState {
    return { pathId, index: 0, progress: 0, playing: false, speed, finished: false };
}

/**
 * Assigns each step a column (its distance from the entry along real edges)
 * and a row inside that column. Purely a function of the workflow, so the
 * same workflow always lays out identically.
 */
export function layoutWorkflow(workflow: Workflow): Map<string, NodePosition> {

    const byKey = new Map(workflow.steps.map((step) => [step.key, step]));
    const outgoing = new Map<string, WorkflowEdge[]>();

    for (const edge of workflow.edges) {
        const list = outgoing.get(edge.from) ?? [];
        list.push(edge);
        outgoing.set(edge.from, list);
    }

    const layerOf = new Map<string, number>();
    const queue: string[] = [];

    if (byKey.has(workflow.entryKey)) {
        layerOf.set(workflow.entryKey, 0);
        queue.push(workflow.entryKey);
    }

    /*
     * Longest-path layering by BFS: a step sits after every step that can
     * reach it, so a route never overlaps the handler it dispatches to.
     */
    let guard = 0;

    while (queue.length > 0 && guard < 20000) {

        guard += 1;

        const key = queue.shift() as string;
        const depth = layerOf.get(key) ?? 0;

        for (const edge of outgoing.get(key) ?? []) {

            if (!byKey.has(edge.to)) {
                continue;
            }

            const nextDepth = depth + 1;
            const known = layerOf.get(edge.to);

            if (known === undefined || nextDepth > known) {
                layerOf.set(edge.to, nextDepth);
                queue.push(edge.to);
            }
        }
    }

    /* Any step unreachable from the entry (e.g. a route shown on its own). */
    for (const step of workflow.steps) {
        if (!layerOf.has(step.key)) {
            layerOf.set(step.key, 1);
        }
    }

    const rowsByLayer = new Map<number, number>();
    const positions = new Map<string, NodePosition>();

    const ordered = [...workflow.steps].sort((a, b) => {
        const layerA = layerOf.get(a.key) ?? 0;
        const layerB = layerOf.get(b.key) ?? 0;

        if (layerA !== layerB) {
            return layerA - layerB;
        }

        if (a.line !== b.line) {
            return a.line - b.line;
        }

        return a.key.localeCompare(b.key);
    });

    for (const step of ordered) {

        const layer = layerOf.get(step.key) ?? 0;
        const row = rowsByLayer.get(layer) ?? 0;

        rowsByLayer.set(layer, row + 1);

        positions.set(step.key, {
            key: step.key,
            layer,
            x: MARGIN_X + layer * LAYER_GAP,
            y: MARGIN_Y + row * ROW_GAP,
            width: NODE_WIDTH,
            height: NODE_HEIGHT
        });
    }

    return positions;
}

export function canvasSize(positions: Map<string, NodePosition>): {
    width: number;
    height: number;
} {

    let maxLayer = 0;
    let maxRow = 0;

    for (const position of positions.values()) {
        maxLayer = Math.max(maxLayer, position.layer);
        maxRow = Math.max(maxRow, (position.y - MARGIN_Y) / ROW_GAP);
    }

    return {
        width: MARGIN_X * 2 + (maxLayer + 1) * LAYER_GAP,
        height: MARGIN_Y * 2 + (maxRow + 1) * ROW_GAP
    };
}

/** Centre point of a step, used for edge anchors and the marker. */
export function centerOf(
    positions: Map<string, NodePosition>,
    key: string
): { x: number; y: number } | null {

    const position = positions.get(key);

    if (!position) {
        return null;
    }

    return {
        x: position.x + position.width / 2,
        y: position.y + position.height / 2
    };
}

export function edgePath(
    positions: Map<string, NodePosition>,
    edge: WorkflowEdge
): string | null {

    const from = positions.get(edge.from);
    const to = positions.get(edge.to);

    if (!from || !to) {
        return null;
    }

    const startX = from.x + from.width;
    const startY = from.y + from.height / 2;
    const endX = to.x;
    const endY = to.y + to.height / 2;

    const middle = Math.max(24, (endX - startX) / 2);

    return [
        `M ${startX} ${startY}`,
        `C ${startX + middle} ${startY}`,
        `${endX - middle} ${endY}`,
        `${endX} ${endY}`
    ].join(" ");
}

/**
 * Steps that belong to the currently selected path, in traversal order.
 * Mutually exclusive branches are never combined: only the selected path
 * animates.
 */
export function pathStepKeys(path: WorkflowPath | undefined): string[] {
    return path ? path.stepKeys : [];
}

/**
 * Advances playback by `elapsedMs`. Pure: the view owns the timer and calls
 * this, so animation never touches the network.
 */
export function advance(
    state: PlaybackState,
    stepCount: number,
    elapsedMs: number
): PlaybackState {

    if (!state.playing || stepCount === 0) {
        return state;
    }

    const perStep = STEP_DURATION_MS / state.speed;

    let progress = state.progress + elapsedMs / perStep;
    let index = state.index;

    while (progress >= 1 && index < stepCount - 1) {
        progress -= 1;
        index += 1;
    }

    if (index >= stepCount - 1 && progress >= 1) {
        return {
            ...state,
            index: stepCount - 1,
            progress: 1,
            playing: false,
            finished: true
        };
    }

    return { ...state, index, progress: Math.min(progress, 1) };
}

/** Position of the moving marker between the active step and the next one. */
export function markerPosition(
    positions: Map<string, NodePosition>,
    stepKeys: string[],
    state: PlaybackState
): { x: number; y: number } | null {

    const current = centerOf(positions, stepKeys[state.index] ?? "");
    const next = centerOf(positions, stepKeys[state.index + 1] ?? "");

    if (!current) {
        return null;
    }

    if (!next || state.finished) {
        return current;
    }

    return {
        x: current.x + (next.x - current.x) * state.progress,
        y: current.y + (next.y - current.y) * state.progress
    };
}

export interface StepPresentation {
    label: string;
    /** True when the displayed label is AI wording rather than source text. */
    refined: boolean;
    badge: string;
    dashed: boolean;
}

const BADGES: Record<WorkflowStepKind, string> = {
    entry: "ENTRY",
    function: "CALL",
    route: "ROUTE",
    terminal: "END",
    error: "ERROR",
    boundary: "BOUNDARY"
};

/**
 * How one step should be drawn. Unresolved and ambiguous evidence always
 * keeps a visible marker, so a guessed connection can never look like a
 * verified fact.
 */
export function presentStep(
    step: WorkflowStep,
    refinement?: Workflow["refinement"]
): StepPresentation {

    const aiLabel = refinement?.stepLabels?.[step.key];
    const refined = Boolean(aiLabel);

    return {
        label: step.evidence === "ambiguous"
            ? `${aiLabel ?? step.label} (ambiguous)`
            : aiLabel ?? step.label,
        refined,
        badge: BADGES[step.kind],
        dashed: step.evidence !== "resolved"
    };
}

export function edgeIsUncertain(edge: WorkflowEdge): boolean {
    return edge.evidence !== "resolved";
}

/**
 * The path a reader should start on: the error path if the source shows one,
 * otherwise the main path, otherwise whatever exists.
 */
export function preferredPath(workflow: Workflow): WorkflowPath | undefined {

    return (
        workflow.paths.find((path) => path.kind === "main") ??
        workflow.paths.find((path) => path.kind === "error") ??
        workflow.paths[0]
    );
}

export const prefersReducedMotion = (
    matchMedia?: ((query: string) => { matches: boolean }) | undefined
): boolean => {

    if (typeof matchMedia !== "function") {
        return false;
    }

    try {
        return matchMedia("(prefers-reduced-motion: reduce)").matches === true;
    } catch {
        return false;
    }
};

/** Text a screen reader or fallback UI can show instead of the diagram. */
export function describeWorkflowTextually(
    workflow: Workflow,
    path: WorkflowPath | undefined
): string {

    const labels = (path?.stepKeys ?? [])
        .map((key) => workflow.steps.find((step) => step.key === key))
        .filter((step): step is WorkflowStep => Boolean(step))
        .map((step) => {
            const presentation = presentStep(step, workflow.refinement);
            return `${presentation.badge} ${step.label} (${step.filePath}:${step.line})`;
        });

    return [
        workflow.title,
        `Path: ${path?.label ?? "main"}`,
        ...labels.map((line, index) => `${index + 1}. ${line}`)
    ].join("\n");
}
