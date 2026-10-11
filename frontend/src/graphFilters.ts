import type {
    EntityType,
    GraphData,
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
