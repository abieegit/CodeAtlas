import {
    analyzeRepository
} from "./analysis.service";

import {
    saveGraph
} from "./graph.service";

import {
    rememberGraph
} from "./graph.store";

import { invalidateReports } from "./analysis/report.service";
import { invalidateSummaries } from "./analysis/function-summary.service";
import { invalidateRefinements } from "./workflow/refine.service";

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
 *
 * Build 06: `repositoryId` is the stable, globally unique key used to scope
 * the Neo4j write, the in-memory fallback and the AI caches. `repositoryName`
 * is display only (it labels the graph's Repository node).
 */
export async function analyzeAndStore(
    repositoryPath: string,
    repositoryName: string,
    repositoryId: string
): Promise<AnalysisResult> {

    const graph =
        analyzeRepository(repositoryPath, repositoryName);

    /*
     * Keep the freshly analysed graph in memory so the report, summary and
     * workflow features (which read the graph back) work even when Neo4j
     * is unreachable and persistence is skipped.
     */
    rememberGraph(repositoryId, graph);

    let persisted = true;

    try {

        await saveGraph(graph, repositoryId);

        /*
         * The stored graph changed — cached reports and function
         * summaries for this repository are now stale, so they are
         * dropped rather than served by identity alone.
         */
        invalidateReports(repositoryId);
        invalidateSummaries(repositoryId);
        invalidateRefinements(repositoryId);

    } catch (error) {

        persisted = false;

        console.warn(
            `[analysis] Neo4j persistence skipped: ${(error as Error).message}`
        );
    }

    return { graph, persisted };
}
