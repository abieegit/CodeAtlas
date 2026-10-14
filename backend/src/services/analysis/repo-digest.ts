import { GraphData } from "../../models/graph.types";

/**
 * A compact, token-bounded digest of a repository graph. It is computed
 * from real graph metrics so the analysis model reasons about measured
 * facts (fan-in, cycles, size distribution) instead of inventing them.
 */
export interface RepoDigest {
    repository: string;
    nodeCounts: Record<string, number>;
    filesByCategory: Record<string, number>;
    functionCount: number;
    classCount: number;
    fileCount: number;
    relationshipCounts: Record<string, number>;
    importCycleCount: number;
    topFanIn: Array<{ name: string; filePath: string; inbound: number }>;
    topFanOut: Array<{ name: string; filePath: string; outbound: number }>;
    largestFiles: Array<{ filePath: string; entities: number; lines: number }>;
    busiestDirectories: Array<{ directory: string; files: number }>;
}

const TOP_ENTRIES = 8;

function incrementCount(
    counts: Record<string, number>,
    key: string
): void {
    counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * Counts simple import cycles between files (DFS back-edges found from
 * each unvisited file). Cap protects large graphs; the count is an
 * indicator, not an exhaustive enumeration.
 */
function countImportCycles(graph: GraphData): number {

    const fileImports = new Map<string, Set<string>>();

    for (const relationship of graph.relationships) {
        if (relationship.type !== "IMPORTS") {
            continue;
        }
        const set = fileImports.get(relationship.source) ?? new Set<string>();
        set.add(relationship.target);
        fileImports.set(relationship.source, set);
    }

    const state = new Map<string, "visiting" | "done">();
    let cycles = 0;

    const visit = (nodeId: string): void => {

        if (cycles >= 50) {
            return;
        }

        state.set(nodeId, "visiting");

        for (const target of fileImports.get(nodeId) ?? []) {
            const targetState = state.get(target);
            if (targetState === "visiting") {
                cycles += 1;
            } else if (!targetState) {
                visit(target);
            }
        }

        state.set(nodeId, "done");
    };

    for (const nodeId of fileImports.keys()) {
        if (!state.get(nodeId) && cycles < 50) {
            visit(nodeId);
        }
    }

    return cycles;
}

/**
 * Builds the digest from a stored graph. Pure — it never mutates the
 * input and never calls the network.
 */
export function buildRepoDigest(
    repository: string,
    graph: GraphData
): RepoDigest {

    const nodeCounts: Record<string, number> = {};
    const filesByCategory: Record<string, number> = {};
    const relationshipCounts: Record<string, number> = {};
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    const entitiesPerFile = new Map<string, number>();
    const filesPerDirectory = new Map<string, number>();

    const nodesById = new Map(
        graph.nodes.map((node) => [node.id, node])
    );

    let functionCount = 0;
    let classCount = 0;
    let fileCount = 0;

    for (const node of graph.nodes) {

        incrementCount(nodeCounts, node.type);

        if (node.type === "Function") {
            functionCount += 1;
        }

        if (node.type === "Class") {
            classCount += 1;
        }

        if (node.type === "File") {
            fileCount += 1;

            if (node.category) {
                incrementCount(filesByCategory, node.category);
            }

            const directory =
                node.filePath.includes("/")
                    ? node.filePath.slice(0, node.filePath.lastIndexOf("/"))
                    : "(root)";

            incrementCountObj(filesPerDirectory, directory);
        }

        if (node.type === "File" || node.type === "Class") {
            incrementCountObj(entitiesPerFile, node.id);
        }
    }

    for (const relationship of graph.relationships) {

        incrementCount(relationshipCounts, relationship.type);

        if (relationship.type === "IMPORTS" || relationship.type === "CALLS") {
            outbound.set(
                relationship.source,
                (outbound.get(relationship.source) ?? 0) + 1
            );
            inbound.set(
                relationship.target,
                (inbound.get(relationship.target) ?? 0) + 1
            );
        }
    }

    const describe = (nodeId: string) => {
        const node = nodesById.get(nodeId);
        return {
            name: node?.name ?? nodeId,
            filePath: node?.filePath ?? ""
        };
    };

    const topFanIn = [...inbound.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_ENTRIES)
        .map(([nodeId, count]) => ({ ...describe(nodeId), inbound: count }));

    const topFanOut = [...outbound.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_ENTRIES)
        .map(([nodeId, count]) => ({ ...describe(nodeId), outbound: count }));

    const largestFiles = [...entitiesPerFile.entries()]
        .map(([nodeId, entities]) => {
            const node = nodesById.get(nodeId);
            return {
                filePath: node?.filePath ?? nodeId,
                entities,
                lines: node?.endLine ?? 0
            };
        })
        .sort((a, b) => b.entities - a.entities)
        .slice(0, TOP_ENTRIES);

    const busiestDirectories = [...filesPerDirectory.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_ENTRIES)
        .map(([directory, files]) => ({ directory, files }));

    return {
        repository,
        nodeCounts,
        filesByCategory,
        functionCount,
        classCount,
        fileCount,
        relationshipCounts,
        importCycleCount: countImportCycles(graph),
        topFanIn,
        topFanOut,
        largestFiles,
        busiestDirectories
    };
}

function incrementCountObj(
    map: Map<string, number>,
    key: string
): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}
