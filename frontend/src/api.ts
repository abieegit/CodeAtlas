import type { GraphData } from "./types";
import type { Workflow, WorkflowListResponse } from "./workflow";
import { supabase } from "./lib/supabase";

const BASE = "/api";

/**
 * Builds the Authorization header from the current Supabase session (Build 06).
 * The backend verifies this token; the frontend never decides authorization.
 */
async function authorizationHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface AnalyzeResponse {
    repository: string;
    repositoryId?: string;
    status?: string;
    persisted: boolean;
    nodeCount: number;
    relationshipCount: number;
    graph: GraphData;
}

export async function analyzeArchive(
    file: File
): Promise<AnalyzeResponse> {

    const form = new FormData();
    form.append("file", file);

    const response = await fetch(
        `${BASE}/repositories/analyze`,
        {
            method: "POST",
            headers: await authorizationHeaders(),
            body: form
        }
    );

    if (!response.ok) {
        const message = await response
            .json()
            .then((body) => body.error)
            .catch(() => response.statusText);

        throw new Error(message ?? "Analysis failed");
    }

    const result = await response.json();

    /*
     * The stored graph changed — cached core-purpose summaries for the
     * session are now stale, so they are dropped on every analysis.
     */
    summaryCache.clear();
    workflowCache.clear();
    refinementCache.clear();

    return result;
}

export async function loadGraph(
    repository?: string
): Promise<GraphData> {

    const query = repository
        ? `?repository=${encodeURIComponent(repository)}`
        : "";

    const response = await fetch(`${BASE}/graph${query}`, {
        headers: await authorizationHeaders()
    });

    if (!response.ok) {
        throw new Error("Failed to load graph");
    }

    return response.json();
}

export async function listRepositories(): Promise<string[]> {

    const response = await fetch(`${BASE}/repositories`, {
        headers: await authorizationHeaders()
    });

    if (!response.ok) {
        throw new Error("Failed to load repositories");
    }

    const body = await response.json();

    return body.repositories ?? [];
}

export interface AnalysisFactor {
    title: string;
    detail: string;
    severity: "low" | "medium" | "high";
}

export interface AnalysisReport {
    repository: string;
    summary: string;
    scalability: {
        score: number;
        verdict: string;
        factors: AnalysisFactor[];
    };
    sustainability: {
        score: number;
        verdict: string;
        factors: AnalysisFactor[];
    };
    strengths: string[];
    risks: AnalysisFactor[];
    recommendations: string[];
    limitations: string[];
    model: string;
    generatedAt: string;
}

/**
 * Scalability & sustainability report for one stored repository,
 * generated server-side through the configured OpenAI-compatible
 * LLM API.
 */
export async function fetchAnalysisReport(
    repository: string
): Promise<AnalysisReport> {

    const response = await fetch(
        `${BASE}/analysis?repository=${encodeURIComponent(repository)}`,
        { headers: await authorizationHeaders() }
    );

    if (!response.ok) {
        const message = await response
            .json()
            .then((body) => body.error)
            .catch(() => response.statusText);

        throw new Error(message ?? "Failed to generate the analysis report");
    }

    return response.json();
}

const summaryCache = new Map<string, string>();

/**
 * One-line core-purpose summary for a Function node. Results are cached
 * per repository+node so re-selecting a node never re-bills the API.
 */
export async function fetchFunctionSummary(
    repository: string,
    nodeId: string
): Promise<string> {

    const cacheKey = `${repository}:${nodeId}`;

    const cached = summaryCache.get(cacheKey);

    if (cached !== undefined) {
        return cached;
    }

    const response = await fetch(
        `${BASE}/analysis/function?repository=` +
            `${encodeURIComponent(repository)}&nodeId=` +
            `${encodeURIComponent(nodeId)}`,
        { headers: await authorizationHeaders() }
    );

    if (!response.ok) {
        const message = await response
            .json()
            .then((body) => body.error)
            .catch(() => response.statusText);

        throw new Error(message ?? "Failed to summarise the function");
    }

    const body = await response.json();

    const summary: string = body.summary ?? "";

    summaryCache.set(cacheKey, summary);

    return summary;
}

/* ---------------------------------------------------------------------
 * Coremation (Build 05) — workflows are derived deterministically by the
 * backend; refinement is an explicit, separate user action.
 * ------------------------------------------------------------------ */

const workflowCache = new Map<string, WorkflowListResponse>();
const refinementCache = new Map<string, Workflow>();

async function readError(
    response: Response,
    fallback: string
): Promise<string> {
    return response
        .json()
        .then((body) => body.error ?? fallback)
        .catch(() => response.statusText || fallback);
}

export async function fetchWorkflows(
    repository: string
): Promise<WorkflowListResponse> {

    const cacheKey = `${repository}:list`;

    const cached = workflowCache.get(cacheKey);

    if (cached) {
        return cached;
    }

    const response = await fetch(
        `${BASE}/workflows?repository=${encodeURIComponent(repository)}`,
        { headers: await authorizationHeaders() }
    );

    if (!response.ok) {
        throw new Error(await readError(response, "Could not load workflows"));
    }

    const body = (await response.json()) as WorkflowListResponse;

    workflowCache.set(cacheKey, body);

    return body;
}

export async function fetchWorkflow(
    repository: string,
    workflowId: string
): Promise<Workflow> {

    const response = await fetch(
        `${BASE}/workflows/${encodeURIComponent(workflowId)}` +
            `?repository=${encodeURIComponent(repository)}`,
        { headers: await authorizationHeaders() }
    );

    if (!response.ok) {
        throw new Error(await readError(response, "Could not load this workflow"));
    }

    return (await response.json()) as Workflow;
}

/**
 * Requests AI wording for one workflow. Cached per repository + workflow +
 * fingerprint so switching tabs never re-bills the provider.
 */
export async function refineWorkflow(
    repository: string,
    workflow: Workflow
): Promise<Workflow> {

    const cacheKey = [
        repository,
        workflow.id,
        workflow.provenance.graphFingerprint
    ].join("|");

    const cached = refinementCache.get(cacheKey);

    if (cached) {
        return cached;
    }

    const response = await fetch(
        `${BASE}/workflows/${encodeURIComponent(workflow.id)}/refine` +
            `?repository=${encodeURIComponent(repository)}`,
        {
            method: "POST",
            headers: await authorizationHeaders()
        }
    );

    if (!response.ok) {
        throw new Error(await readError(response, "Refinement failed"));
    }

    const refined = (await response.json()) as Workflow;

    refinementCache.set(cacheKey, refined);

    return refined;
}

/** Clears cached workflow lists and refinements (after a new analysis). */
export function clearWorkflowCaches(): void {
    workflowCache.clear();
    refinementCache.clear();
}
