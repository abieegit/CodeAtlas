import type {
    EntityType,
    GraphData,
    GraphNode,
    RelationshipType
} from "./types";

export interface FilterState {
    scope: "application" | "full";
    nodeTypes: EntityType[];
    relationshipTypes: RelationshipType[];
    directory: string | null;
    focusNodeId: string | null;
}

export const ALL_ENTITY_TYPES: EntityType[] = [
    "Repository",
    "Directory",
    "File",
    "Class",
    "Function",
    "Method",
    "Variable"
];

export const ALL_RELATIONSHIP_TYPES: RelationshipType[] = [
    "CONTAINS",
    "IMPORTS",
    "CALLS",
    "EXTENDS"
];

export function defaultFilters(): FilterState {
    return {
        scope: "application",
        nodeTypes: [...ALL_ENTITY_TYPES],
        relationshipTypes: [...ALL_RELATIONSHIP_TYPES],
        directory: null,
        focusNodeId: null
    };
}

/**
 * Pure, reversible visualisation filtering. It returns a NEW graph
 * containing only the nodes/relationships to draw - it never mutates the
 * source graph and never deletes anything from Neo4j.
 */
export function filterGraph(
    graph: GraphData,
    filters: FilterState
): GraphData {

    const enabledNodeTypes = new Set<EntityType>(filters.nodeTypes);
    const enabledRelationshipTypes =
        new Set<RelationshipType>(filters.relationshipTypes);

    let nodes = graph.nodes.filter((node) => {

        if (!enabledNodeTypes.has(node.type)) {
            return false;
        }

        if (
            filters.scope === "application" &&
            node.inDefaultScope === false
        ) {
            return false;
        }

        if (filters.directory) {
            const path = node.filePath;
            const inDirectory =
                path === filters.directory ||
                path.startsWith(`${filters.directory}/`);
            if (!inDirectory) {
                return false;
            }
        }

        return true;
    });

    if (filters.focusNodeId) {

        const keep = new Set<string>([filters.focusNodeId]);

        for (const relationship of graph.relationships) {
            if (relationship.source === filters.focusNodeId) {
                keep.add(relationship.target);
            }
            if (relationship.target === filters.focusNodeId) {
                keep.add(relationship.source);
            }
        }

        nodes = nodes.filter((node) => keep.has(node.id));
    }

    const nodeIds = new Set(nodes.map((node) => node.id));

    const relationships = graph.relationships.filter(
        (relationship) =>
            enabledRelationshipTypes.has(relationship.type) &&
            nodeIds.has(relationship.source) &&
            nodeIds.has(relationship.target)
    );

    return { nodes, relationships };
}

/**
 * Why a node is not currently drawn, one entry per active filter axis that
 * excludes it. Empty when the node is visible.
 */
export type HiddenReason = "node-type" | "scope" | "directory" | "focus";

function underDirectory(directory: string, filePath: string): boolean {
    return filePath === directory || filePath.startsWith(`${directory}/`);
}

function adjacentTo(
    graph: GraphData,
    focusNodeId: string,
    nodeId: string
): boolean {

    if (focusNodeId === nodeId) {
        return true;
    }

    return graph.relationships.some(
        (relationship) =>
            (relationship.source === focusNodeId &&
                relationship.target === nodeId) ||
            (relationship.target === focusNodeId &&
                relationship.source === nodeId)
    );
}

/**
 * True when the node is drawn under the current filters.
 */
export function isNodeVisible(
    graph: GraphData,
    filters: FilterState,
    nodeId: string
): boolean {
    return filterGraph(graph, filters).nodes.some(
        (node) => node.id === nodeId
    );
}

/**
 * List the filter axes that currently hide the given node.
 */
export function hiddenReasons(
    graph: GraphData,
    filters: FilterState,
    node: GraphNode
): HiddenReason[] {

    const reasons: HiddenReason[] = [];

    if (!filters.nodeTypes.includes(node.type)) {
        reasons.push("node-type");
    }

    if (filters.scope === "application" && node.inDefaultScope === false) {
        reasons.push("scope");
    }

    if (filters.directory && !underDirectory(filters.directory, node.filePath)) {
        reasons.push("directory");
    }

    if (
        filters.focusNodeId &&
        !adjacentTo(graph, filters.focusNodeId, node.id)
    ) {
        reasons.push("focus");
    }

    return reasons;
}

/**
 * Minimal filter changes that make the node visible: re-enable its node
 * type, widen the scope, or drop a directory/focus filter that excludes it.
 * Pure — returns a new FilterState and never touches the graph itself.
 */
export function revealNodeInFilters(
    graph: GraphData,
    filters: FilterState,
    node: GraphNode
): FilterState {

    const next: FilterState = { ...filters, nodeTypes: [...filters.nodeTypes] };

    if (!next.nodeTypes.includes(node.type)) {
        next.nodeTypes.push(node.type);
    }

    if (next.scope === "application" && node.inDefaultScope === false) {
        next.scope = "full";
    }

    if (next.directory && !underDirectory(next.directory, node.filePath)) {
        next.directory = null;
    }

    if (
        next.focusNodeId &&
        !adjacentTo(graph, next.focusNodeId, node.id)
    ) {
        next.focusNodeId = null;
    }

    return next;
}
