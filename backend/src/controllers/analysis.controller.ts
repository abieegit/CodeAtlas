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
 * GET /api/analysis?repository=<id>
 *
 * Generates (or returns the cached) scalability & sustainability report
 * for the stored graph of one repository, using the configured
 * OpenAI-compatible LLM API. The key never leaves the backend.
 *
 * Build 06: the repository must be owned by the caller — requireOwnedRepository
 * resolves it before any graph is read.
 */
export async function getAnalysisReport(
    request: Request,
    response: Response,
    _next: NextFunction
): Promise<void> {

    try {

        const repository = request.repository;

        if (!repository) {
            response.status(404).json({
                error: "No stored graph was found. Analyze it first."
            });
            return;
        }

        const graph = await fetchGraph(repository.id);

        if (graph.nodes.length === 0) {
            response.status(404).json({
                error: `No stored graph was found for repository "${repository.name}". Analyze it first.`
            });
            return;
        }

        const report = await generateRepositoryReport(
            repository.id,
            graph,
            repository.name
        );

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
 * GET /api/analysis/function?repository=<id>&nodeId=<id>
 *
 * One-line core-purpose summary for a Function node, grounded in its
 * captured source snippet and CALLS context.
 *
 * Build 06: ownership is resolved before the summary is generated.
 */
export async function getFunctionSummary(
    request: Request,
    response: Response,
    _next: NextFunction
): Promise<void> {

    try {

        const repository = request.repository;

        if (!repository) {
            response.status(404).json({
                error: "No stored graph was found. Analyze it first."
            });
            return;
        }

        const nodeId =
            typeof request.query.nodeId === "string"
                ? request.query.nodeId
                : "";

        if (nodeId === "") {
            response.status(400).json({
                error: "The &nodeId=<id> query parameter is required."
            });
            return;
        }

        const summary = await summarizeFunction(repository.id, nodeId);

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
