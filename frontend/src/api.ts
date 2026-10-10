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

export async function loadGraph(): Promise<GraphData> {

    const response = await fetch(`${BASE}/graph`);

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
