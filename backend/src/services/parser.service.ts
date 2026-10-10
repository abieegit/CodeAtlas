import {
    analyzeRepository
} from "./analysis.service";

import {
    saveGraph
} from "./graph.service";

import {
    GraphData
} from "../models/graph.types";

export interface AnalysisResult {
    graph: GraphData;
    persisted: boolean;
}

/**
 * Runs the analysis pipeline for a repository and persists the result
 * to Neo4j.
 *
 * Persistence is best-effort: if Neo4j is unreachable the graph is
 * still returned (with `persisted: false`) so the pipeline can be
 * demonstrated. The error is logged clearly.
 */
export async function analyzeAndStore(
    repositoryPath: string,
    repositoryName: string
): Promise<AnalysisResult> {

    const graph =
        analyzeRepository(repositoryPath, repositoryName);

    let persisted = true;

    try {

        await saveGraph(graph, repositoryName);

    } catch (error) {

        persisted = false;

        console.warn(
            `[analysis] Neo4j persistence skipped: ${(error as Error).message}`
        );
    }

    return { graph, persisted };
}
