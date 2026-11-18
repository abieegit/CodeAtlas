import { GraphData } from "../models/graph.types";

/**
 * In-memory fallback store for analysed graphs.
 *
 * Neo4j persistence is best-effort: when the database is unreachable the
 * pipeline still returns the graph. This store keeps that graph in the
 * running process so the features that read the graph back (analysis
 * report, function summaries, workflows) keep working without a database.
 */
const MAX_REPOSITORIES = 8;

const graphs = new Map<string, GraphData>();

/** Record the graph produced by the latest analysis of a repository. */
export function rememberGraph(repository: string, graph: GraphData): void {

    graphs.delete(repository);
    graphs.set(repository, graph);

    while (graphs.size > MAX_REPOSITORIES) {
        const oldest = graphs.keys().next().value as string | undefined;
        if (oldest === undefined) {
            break;
        }
        graphs.delete(oldest);
    }
}

/** The remembered graph for a repository, or the merge of all of them. */
export function recallGraph(repository?: string): GraphData | null {

    if (repository) {
        return graphs.get(repository) ?? null;
    }

    if (graphs.size === 0) {
        return null;
    }

    const nodes: GraphData["nodes"] = [];
    const relationships: GraphData["relationships"] = [];

    for (const graph of graphs.values()) {
        nodes.push(...graph.nodes);
        relationships.push(...graph.relationships);
    }

    return { nodes, relationships };
}

/** Names of repositories currently held in memory. */
export function rememberedRepositories(): string[] {
    return [...graphs.keys()].sort();
}

/** Test helper. */
export function clearGraphStore(): void {
    graphs.clear();
}
