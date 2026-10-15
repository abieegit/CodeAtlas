import {
    NextFunction,
    Request,
    Response
} from "express";

import { fetchGraph } from "../services/graph.service";
import { LlmError } from "../services/analysis/llm.client";
import { generateRepositoryReport } from "../services/analysis/report.service";
import { summarizeFunction } from "../services/analysis/function-summary.service";

/**
 * GET /api/analysis?repository=<name>
 *
 * Generates (or returns the cached) scalability & sustainability report
 * for the stored graph of one repository, using the configured
 * OpenAI-compatible LLM API. The key never leaves the backend.
 */
export async function getAnalysisReport(
    request: Request,
    response: Response,
    _next: NextFunction
): Promise<void> {

    try {

        const repository =
            typeof request.query.repository === "string"
                ? request.query.repository
                : "";

        if (repository === "") {
            response.status(400).json({
                error: "The ?repository=<name> query parameter is required."
            });
            return;
        }

        const graph = await fetchGraph(repository);

        if (graph.nodes.length === 0) {
            response.status(404).json({
                error: `No stored graph was found for repository "${repository}". Analyze it first.`
            });
            return;
        }

        const report = await generateRepositoryReport(repository, graph);

        response.json(report);

    } catch (error) {

        if (error instanceof LlmError) {
            response.status(error.status).json({
                error: error.message
            });
            return;
        }

        _next(error);
    }
}

/**
 * GET /api/analysis/function?repository=<name>&nodeId=<id>
 *
 * One-line core-purpose summary for a Function node, grounded in its
 * captured source snippet and CALLS context.
 */
export async function getFunctionSummary(
    request: Request,
    response: Response,
    _next: NextFunction
): Promise<void> {

    try {

        const repository =
            typeof request.query.repository === "string"
                ? request.query.repository
                : "";

        const nodeId =
            typeof request.query.nodeId === "string"
                ? request.query.nodeId
                : "";

        if (repository === "" || nodeId === "") {
            response.status(400).json({
                error: "The ?repository=<name> and &nodeId=<id> query parameters are required."
            });
            return;
        }

        const summary = await summarizeFunction(repository, nodeId);

        response.json(summary);

    } catch (error) {

        if (error instanceof LlmError) {
            response.status(error.status).json({
                error: error.message
            });
            return;
        }

        _next(error);
    }
}
