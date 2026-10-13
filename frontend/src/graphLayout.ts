import type { GraphData } from "./types";

export interface NodePosition {
    x: number;
    y: number;
}

/**
 * Positions of simulation nodes keyed by stable node id. The renderer keeps
 * one map per loaded layout so a re-render of the SAME layout (e.g. after a
 * filter change) can re-seed coordinates instead of scattering nodes again.
 */
export type PositionMap = Map<string, NodePosition>;

/**
 * Record the current coordinates of simulation nodes into the map
 * (replacing any previous content).
 */
export function recordPositions(
    nodes: ReadonlyArray<{ id: string; x?: number; y?: number }>,
    map: PositionMap
): void {

    map.clear();

    for (const node of nodes) {
        if (node.x !== undefined && node.y !== undefined) {
            map.set(node.id, { x: node.x, y: node.y });
        }
    }
}

/**
 * Seed simulation node clones with previously recorded coordinates.
 * Returns the number of nodes that received a stored position.
 */
export function seedPositions(
    nodes: Array<{ id: string; x?: number; y?: number }>,
    map: PositionMap
): number {

    let seeded = 0;

    for (const node of nodes) {
        const position = map.get(node.id);
        if (position) {
            node.x = position.x;
            node.y = position.y;
            seeded += 1;
        }
    }

    return seeded;
}

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface FitTransform {
    x: number;
    y: number;
    k: number;
}

/**
 * Pure fit-to-view math: given node bounds and viewport size, return the
 * translate/scale that centres and fits the graph with padding.
 */
export function computeFitTransform(
    bounds: Bounds,
    width: number,
    height: number,
    padding = 60,
    maxScale = 1.5
): FitTransform {

    const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);

    const k = Math.min(
        maxScale,
        0.9 * Math.min(
            width / (graphWidth + padding * 2),
            height / (graphHeight + padding * 2)
        )
    );

    return {
        x: width / 2 - k * (bounds.minX + bounds.maxX) / 2,
        y: height / 2 - k * (bounds.minY + bounds.maxY) / 2,
        k
    };
}

/**
 * Bounds of the given nodes (missing coordinates count as the origin).
 */
export function boundsOf(
    nodes: ReadonlyArray<{ x?: number; y?: number }>
): Bounds | null {

    if (nodes.length === 0) {
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    return { minX, minY, maxX, maxY };
}

/**
 * Convenience used by the renderer: fit transform for a whole graph.
 */
export function fitTransformForGraph(
    nodes: ReadonlyArray<{ x?: number; y?: number }>,
    width: number,
    height: number
): FitTransform | null {

    const bounds = boundsOf(nodes);

    if (!bounds) {
        return null;
    }

    return computeFitTransform(bounds, width, height);
}

/**
 * True when every id in `ids` exists in the graph (used by search to decide
 * whether a result refers to an existing node).
 */
export function allNodesExist(graph: GraphData, ids: string[]): boolean {

    const present = new Set(graph.nodes.map((node) => node.id));

    return ids.every((id) => present.has(id));
}
