import type { GraphData } from "./types";

const BASE = "/api";

export interface AnalyzeResponse {
    repository: string;
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

    return response.json();
}

export async function loadGraph(
    repository?: string
): Promise<GraphData> {

    const query = repository
        ? `?repository=${encodeURIComponent(repository)}`
        : "";

    const response = await fetch(`${BASE}/graph${query}`);

    if (!response.ok) {
        throw new Error("Failed to load graph");
    }

    return response.json();
}

export async function listRepositories(): Promise<string[]> {

    const response = await fetch(`${BASE}/repositories`);

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
    recommendations: string[];
    model: string;
    generatedAt: string;
}

/**
 * Scalability & sustainability report for one stored repository,
 * generated server-side through the Command Code Provider API.
 */
export async function fetchAnalysisReport(
    repository: string
): Promise<AnalysisReport> {

    const response = await fetch(
        `${BASE}/analysis?repository=${encodeURIComponent(repository)}`
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
            `${encodeURIComponent(nodeId)}`
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
