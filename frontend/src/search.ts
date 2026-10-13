import type { EntityType, GraphData, GraphNode } from "./types";

/** Node types offered by graph search. */
export const SEARCHABLE_TYPES: EntityType[] = [
    "Repository",
    "Directory",
    "File",
    "Class",
    "Function",
    "Method"
];

export interface SearchOptions {
    /** Maximum number of results returned (default 20). */
    limit?: number;
}

const DEFAULT_LIMIT = 20;

/**
 * Ranking: name-prefix matches first, then name-contains, then path-only
 * matches. Ties break alphabetically by name, then by stable node id.
 */
function rank(node: GraphNode, query: string): number {

    const name = node.name.toLowerCase();

    if (name.startsWith(query)) {
        return 0;
    }

    if (name.includes(query)) {
        return 1;
    }

    return 2;
}

/**
 * Client-side search over the already-loaded graph: case-insensitive
 * partial matching on node name and file path across the searchable entity
 * types. Pure — it never mutates the graph and returns the original node
 * objects (with their stable ids).
 */
export function searchGraph(
    graph: GraphData,
    query: string,
    options: SearchOptions = {}
): GraphNode[] {

    const trimmed = query.trim().toLowerCase();

    if (trimmed === "") {
        return [];
    }

    const limit = options.limit ?? DEFAULT_LIMIT;

    const matches = graph.nodes.filter(
        (node) =>
            SEARCHABLE_TYPES.includes(node.type) &&
            (node.name.toLowerCase().includes(trimmed) ||
                (node.filePath ?? "").toLowerCase().includes(trimmed))
    );

    matches.sort(
        (a, b) =>
            rank(a, trimmed) - rank(b, trimmed) ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id)
    );

    return matches.slice(0, limit);
}
