import { GraphData } from "../../models/graph.types";

import { chatComplete, LlmError, parseJsonCompletion } from "./llm.client";
import { buildRepoDigest, RepoDigest } from "./repo-digest";
import { env } from "../../config/env";

export type FactorSeverity = "low" | "medium" | "high";

export interface AnalysisFactor {
    title: string;
    detail: string;
    severity: FactorSeverity;
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
    graphSignature: string;
}

const SEVERITIES: FactorSeverity[] = ["low", "medium", "high"];

function normalizeFactor(raw: unknown): AnalysisFactor | null {

    if (!raw || typeof raw !== "object") {
        return null;
    }

    const value = raw as Record<string, unknown>;

    const title = typeof value.title === "string" ? value.title.trim() : "";
    const detail = typeof value.detail === "string" ? value.detail.trim() : "";

    if (title === "" || detail === "") {
        return null;
    }

    const severity = SEVERITIES.includes(value.severity as FactorSeverity)
        ? (value.severity as FactorSeverity)
        : "medium";

    return { title, detail, severity };
}

function normalizeScore(raw: unknown): number {

    const score =
        typeof raw === "number" ? raw : Number(raw);

    if (!Number.isFinite(score)) {
        return 5;
    }

    return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

function normalizeReport(
    repository: string,
    graphSignature: string,
    raw: unknown
): AnalysisReport {

    const value = raw as Record<string, unknown>;

    if (!value || typeof value !== "object") {
        throw new LlmError(
            "The analysis model returned an unexpected report shape.",
            502
        );
    }

    const section = (name: string) =>
        (value[name] ?? {}) as Record<string, unknown>;

    const scalability = section("scalability");
    const sustainability = section("sustainability");

    const factors = (section: Record<string, unknown>): AnalysisFactor[] =>
        Array.isArray(section.factors)
            ? section.factors
                  .map(normalizeFactor)
                  .filter((factor): factor is AnalysisFactor => factor !== null)
                  .slice(0, 6)
            : [];

    const recommendations = Array.isArray(value.recommendations)
        ? value.recommendations
              .filter(
                  (entry): entry is string => typeof entry === "string"
              )
              .map((entry) => entry.trim())
              .filter((entry) => entry !== "")
              .slice(0, 6)
        : [];

    return {
        repository,
        summary:
            typeof value.summary === "string" && value.summary.trim() !== ""
                ? value.summary.trim()
                : "No summary was produced for this repository.",
        scalability: {
            score: normalizeScore(scalability.score),
            verdict:
                typeof scalability.verdict === "string"
                    ? scalability.verdict.trim()
                    : "",
            factors: factors(scalability)
        },
        sustainability: {
            score: normalizeScore(sustainability.score),
            verdict:
                typeof sustainability.verdict === "string"
                    ? sustainability.verdict.trim()
                    : "",
            factors: factors(sustainability)
        },
        recommendations,
        model: env.cmdApi.model,
        generatedAt: new Date().toISOString(),
        graphSignature
    };
}

const SYSTEM_PROMPT =
    "You are a senior software architecture analyst. You assess JavaScript/" +
    "TypeScript repositories for scalability and sustainability using only " +
    "the measured graph metrics you are given. Be specific, reference the " +
    "metrics, never invent files or numbers, and keep every string concise. " +
    'Respond with STRICT JSON only, no markdown, matching exactly: ' +
    '{"summary": string, "scalability": {"score": number 0-10, ' +
    '"verdict": string, "factors": [{"title": string, "detail": string, ' +
    '"severity": "low"|"medium"|"high"}]}, "sustainability": {"score": ' +
    "number 0-10, \"verdict\": string, \"factors\": [{\"title\": string, " +
    '"detail": string, "severity": "low"|"medium"|"high"}]}, ' +
    '"recommendations": string[]}. Include 3-5 factors per section and at ' +
    "most 5 recommendations.";

function reportPrompt(digest: RepoDigest): string {
    return [
        "Assess this repository for scalability (can it keep growing - more " +
        "code, more contributors, more load - without degrading) and " +
        "sustainability (can a team keep maintaining it - structure, " +
        "testing, coupling, hygiene).",
        "",
        "Measured graph metrics (JSON):",
        JSON.stringify(digest)
    ].join("\n");
}

/*
 * Reports are cached per repository + graph signature so re-opening the
 * tab (or re-rendering) never re-bills the API, while a re-analyzed
 * repository produces a fresh report.
 */
const reportCache = new Map<string, AnalysisReport>();

function signatureOf(graph: GraphData): string {
    return `${graph.nodes.length}:${graph.relationships.length}`;
}

/**
 * Generates (or returns the cached) scalability & sustainability report
 * for a stored repository graph.
 */
export async function generateRepositoryReport(
    repository: string,
    graph: GraphData
): Promise<AnalysisReport> {

    const graphSignature = signatureOf(graph);
    const cacheKey = `${repository}:${graphSignature}`;

    const cached = reportCache.get(cacheKey);

    if (cached) {
        return cached;
    }

    const digest = buildRepoDigest(repository, graph);

    const completion = await chatComplete(
        [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: reportPrompt(digest) }
        ],
        { maxTokens: 1400, temperature: 0.2 }
    );

    const report = normalizeReport(
        repository,
        graphSignature,
        parseJsonCompletion<unknown>(completion)
    );

    reportCache.set(cacheKey, report);

    return report;
}

/** Test helper: clears the report cache. */
export function clearReportCache(): void {
    reportCache.clear();
}
