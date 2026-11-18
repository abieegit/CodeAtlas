import { NextFunction, Request, Response } from "express";

import { GraphData } from "../models/graph.types";
import { fetchGraph } from "../services/graph.service";
import { LlmError } from "../services/analysis/llm.client";

import {
    buildWorkflows,
    summarizeWorkflow
} from "../services/workflow/workflow.service";
import { refineWorkflow } from "../services/workflow/refine.service";
import type { Workflow } from "../services/workflow/workflow.types";

function workflowIdOf(request: Request): string {
    return typeof request.params.workflowId === "string"
        ? request.params.workflowId
        : "";
}

function findWorkflow(
    repository: string,
    graph: GraphData,
    workflowId: string
): Workflow | undefined {

    return buildWorkflows(repository, graph).find(
        (workflow) => workflow.id === workflowId
    );
}

/**
 * GET /api/workflows?repository=<id>
 *
 * Lists the candidate workflows static analysis can support for the stored
 * repository. Never calls the model.
 *
 * Build 06: the repository must be owned by the caller (requireOwnedRepository).
 * The graph is scoped by the repository id; the name is used only for display.
 */
export async function listWorkflows(
    request: Request,
    response: Response,
    next: NextFunction
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

        const workflows = buildWorkflows(repository.name, graph);

        const evidenceVersion =
            workflows.length > 0
                ? workflows[0].provenance.evidenceVersion
                : graph.nodes.some((node) => node.workflowEvidence)
                  ? "v1"
                  : "none";

        response.json({
            repository: repository.name,
            evidenceVersion,
            count: workflows.length,
            workflows: workflows.map(summarizeWorkflow),
            note:
                evidenceVersion === "none"
                    ? "This stored graph predates workflow evidence (Build 05). " +
                      "Re-analyze the repository to enable routes, branches and call order."
                    : undefined
        });

    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/workflows/<workflowId>?repository=<id>
 *
 * Full workflow: steps, transitions, paths, branch conditions, source
 * references and provenance. Deterministic — no model call.
 */
export async function getWorkflow(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const repository = request.repository;

        if (!repository) {
            response.status(404).json({
                error: "No stored graph was found. Analyze it first."
            });
            return;
        }

        const workflowId = workflowIdOf(request);

        if (workflowId === "") {
            response.status(400).json({
                error: "A workflow id is required."
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

        const workflow = findWorkflow(repository.name, graph, workflowId);

        if (!workflow) {
            response.status(404).json({
                error: `No workflow "${workflowId}" exists for repository "${repository.name}".`
            });
            return;
        }

        response.json(workflow);

    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/workflows/<workflowId>/refine?repository=<id>
 *
 * Optional wording refinement through the configured LLM API. Answers 200
 * with a workflow either way: when refinement is not possible the
 * deterministic workflow is returned and `refinement.state` explains why.
 * Structure is never taken from the model.
 */
export async function postWorkflowRefinement(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const repository = request.repository;

        if (!repository) {
            response.status(404).json({
                error: "No stored graph was found. Analyze it first."
            });
            return;
        }

        const workflowId = workflowIdOf(request);

        if (workflowId === "") {
            response.status(400).json({
                error: "A workflow id is required."
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

        const workflow = findWorkflow(repository.name, graph, workflowId);

        if (!workflow) {
            response.status(404).json({
                error: `No workflow "${workflowId}" exists for repository "${repository.name}".`
            });
            return;
        }

        response.json(await refineWorkflow(repository.id, workflow));

    } catch (error) {

        if (error instanceof LlmError) {
            response.status(error.status).json({ error: error.message });
            return;
        }

        next(error);
    }
}
