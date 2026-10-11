import type {
    EntityType,
    GraphData,
    GraphNode,
    RelationshipType
} from "./types";

export interface FlowStep {
    id: string;
    name: string;
    type: EntityType;
    filePath: string;
    line?: number;
    via?: RelationshipType;
}

export interface ExecutionFlow {
    id: string;
    entryId: string;
    entryName: string;
    steps: FlowStep[];
}

interface Options {
    maxDepth?: number;
    maxFlows?: number;
}

const CALLABLE_TYPES: EntityType[] = ["Function", "Method"];

function stepOf(
    node: GraphNode,
    via: RelationshipType | undefined,
    line: number | undefined
): FlowStep {
    return {
        id: node.id,
        name: node.name,
        type: node.type,
        filePath: node.filePath,
        line: line ?? undefined,
        via
    };
}

/**
 * Derives the repository's execution flows from the graph: distinct paths
 * that start at an entry point (a function/method that is called by nothing)
 * and follow CALLS edges to a leaf (or the depth limit). Cycles are broken and
 * the result is capped so a large repository cannot explode the list.
 *
 * Pure function - it reads the graph and returns flows; it uses no backend.
 */
export function deriveExecutionFlows(
    graph: GraphData,
    options: Options = {}
): ExecutionFlow[] {

    const maxDepth = options.maxDepth ?? 8;
    const maxFlows = options.maxFlows ?? 80;

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));

    const calls = new Map<string, { target: string; line?: number }[]>();
    const called = new Set<string>();

    for (const relationship of graph.relationships) {

        if (relationship.type !== "CALLS") {
            continue;
        }

        if (!byId.has(relationship.target)) {
            continue;
        }

        const list = calls.get(relationship.source) ?? [];
        list.push({
            target: relationship.target,
            line: relationship.evidence?.line
        });
        calls.set(relationship.source, list);
        called.add(relationship.target);
    }

    const callables = graph.nodes.filter((node) =>
        CALLABLE_TYPES.includes(node.type)
    );

    let entries = callables.filter(
        (node) => (calls.get(node.id)?.length ?? 0) > 0 && !called.has(node.id)
    );

    if (entries.length === 0) {
        entries = callables.filter(
            (node) => (calls.get(node.id)?.length ?? 0) > 0
        );
    }

    const flows: ExecutionFlow[] = [];

    const walk = (
        nodeId: string,
        path: FlowStep[],
        visited: Set<string>
    ): void => {

        if (flows.length >= maxFlows) {
            return;
        }

        const edges = (calls.get(nodeId) ?? []).filter(
            (edge) => !visited.has(edge.target)
        );

        if (path.length >= maxDepth || edges.length === 0) {

            if (path.length >= 2) {
                const entry = path[0];
                flows.push({
                    id: `${entry.id}#${flows.length}`,
                    entryId: entry.id,
                    entryName: entry.name,
                    steps: [...path]
                });
            }

            return;
        }

        for (const edge of edges) {

            const target = byId.get(edge.target);

            if (!target) {
                continue;
            }

            visited.add(edge.target);
            path.push(stepOf(target, "CALLS", edge.line));
            walk(edge.target, path, visited);
            path.pop();
            visited.delete(edge.target);
        }
    };

    for (const entry of entries) {

        if (flows.length >= maxFlows) {
            break;
        }

        walk(entry.id, [stepOf(entry, undefined, undefined)], new Set([entry.id]));
    }

    return flows.sort((a, b) => b.steps.length - a.steps.length);
}
