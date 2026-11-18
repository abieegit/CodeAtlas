import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * graph.service is mocked so summarizeFunction can be exercised without
 * Neo4j; the LLM boundary is exercised through a stubbed global fetch.
 */
vi.mock("../services/graph.service", () => ({
    fetchFunctionContext: vi.fn(async (_repository: string, nodeId: string) => {
        if (nodeId === "function:src/app.ts:missing") {
            return null;
        }
        if (nodeId === "file:src/app.ts") {
            return {
                node: {
                    id: nodeId,
                    type: "File",
                    name: "app.ts",
                    filePath: "src/app.ts",
                    startLine: 1,
                    endLine: 9
                },
                callers: [],
                callees: []
            };
        }
        return {
            node: {
                id: nodeId,
                type: "Function",
                name: "runAnalysis",
                filePath: "src/app.ts",
                startLine: 2,
                endLine: 8,
                sourceSnippet: "function runAnalysis(g) { return buildReport(g); }"
            },
            callers: ["main"],
            callees: ["buildReport"]
        };
    })
}));

import { env } from "../config/env";
import { LlmError } from "../services/analysis/llm.client";
import {
    clearReportCache,
    generateRepositoryReport,
    invalidateReports
} from "../services/analysis/report.service";
import {
    clearSummaryCache,
    invalidateSummaries,
    summarizeFunction
} from "../services/analysis/function-summary.service";
import { buildRepoDigest } from "../services/analysis/repo-digest";

import type { GraphData } from "../models/graph.types";

type FetchMock = ReturnType<typeof vi.fn>;

function stubFetch(payload: unknown, status = 200): FetchMock {
    const fetchMock = vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: "status",
        json: async () => payload
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function completion(content: string) {
    return { choices: [{ message: { content } }] };
}

const graph: GraphData = {
    nodes: [
        { id: "file:src/a.ts", type: "File", name: "a.ts", filePath: "src/a.ts", startLine: 1, endLine: 9, category: "source" },
        { id: "function:src/a.ts:run", type: "Function", name: "run", filePath: "src/a.ts", startLine: 2, endLine: 8 }
    ],
    relationships: []
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearReportCache();
    clearSummaryCache();
    env.llm.key = process.env.LLM_API_KEY ?? "test-key";
});

describe("generateRepositoryReport", () => {

    it("sends the digest and returns a normalized report", async () => {
        const fetchMock = stubFetch(
            completion(
                '```json\n{"summary":"Small repo.","scalability":{"score":7.5,' +
                '"verdict":"Reasonable","factors":[{"title":"Low coupling",' +
                '"detail":"Few imports.","severity":"low"},{"title":"bad",' +
                '"detail":""}]},"sustainability":{"score":99,"verdict":"x",' +
                '"factors":[{"title":"No tests","detail":"test ratio is 0.",' +
                '"severity":"high"}]},"strengths":["Clear modules","","' +
                "Consistent naming\"],\"risks\":[{\"title\":\"Wide fan-out\"," +
                '"detail":"Hub functions.","severity":"medium"},' +
                '{"title":"bad","detail":""}],"recommendations":' +
                '["Add tests."],"limitations":["Static graph only","' +
                "No runtime evidence\"]}\n```"
            )
        );

        const report = await generateRepositoryReport("demo", graph, "demo");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/chat/completions");
        expect((init as RequestInit).headers).toMatchObject({
            Authorization: expect.stringContaining("Bearer ")
        });
        const body = JSON.parse(String((init as RequestInit).body));
        expect(body.model).toBe(env.llm.model);
        expect(body.messages[1].content).toContain('"functionCount":1');

        expect(report.summary).toBe("Small repo.");
        expect(report.scalability.score).toBe(7.5);
        // Invalid factors are dropped, scores are clamped to 0-10.
        expect(report.scalability.factors).toHaveLength(1);
        expect(report.sustainability.score).toBe(10);
        expect(report.strengths).toEqual([
            "Clear modules",
            "Consistent naming"
        ]);
        expect(report.risks).toHaveLength(1);
        expect(report.risks[0].severity).toBe("medium");
        expect(report.recommendations).toEqual(["Add tests."]);
        expect(report.limitations).toEqual([
            "Static graph only",
            "No runtime evidence"
        ]);
        expect(report.model).toBe(env.llm.model);
    });

    it("serves a cached report without a second API call", async () => {
        const fetchMock = stubFetch(
            completion('{"summary":"S","scalability":{"score":5,"factors":[]},' +
                '"sustainability":{"score":5,"factors":[]},"recommendations":[]}')
        );

        await generateRepositoryReport("demo", graph, "demo");
        await generateRepositoryReport("demo", graph, "demo");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("maps a 403 access error to a helpful message", async () => {
        stubFetch(
            { error: { message: "api_key_permission_denied" } },
            403
        );

        await expect(generateRepositoryReport("demo", graph, "demo")).rejects.toThrow(
            /denied access/
        );
    });

    it("maps a 429 rate limit to a retriable 503", async () => {
        stubFetch(
            { error: { message: "Rate limit reached" } },
            429
        );

        await expect(generateRepositoryReport("demo", graph, "demo")).rejects.toThrow(
            /rate limit/i
        );
    });

    it("regenerates after an explicit invalidation for the repository", async () => {
        const fetchMock = stubFetch(
            completion('{"summary":"S","scalability":{"score":5,"factors":[]},' +
                '"sustainability":{"score":5,"factors":[]},"recommendations":[]}')
        );

        await generateRepositoryReport("demo", graph, "demo");
        invalidateReports("demo");
        await generateRepositoryReport("demo", graph, "demo");

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("shares one pending request for concurrent duplicate calls", async () => {

        const fetchMock = vi.fn(async () => await new Promise((resolve) =>
            setTimeout(() =>
                resolve({
                    ok: true,
                    status: 200,
                    statusText: "status",
                    json: async () =>
                        completion('{"summary":"S","scalability":{"score":5,' +
                            '"factors":[]},"sustainability":{"score":5,' +
                            '"factors":[]},"recommendations":[]}')
                })
            )
        ) as unknown as Response);
        vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

        const [first, second] = await Promise.all([
            generateRepositoryReport("demo", graph, "demo"),
            generateRepositoryReport("demo", graph, "demo")
        ]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });

    it("fails clearly when the model output is not JSON", async () => {
        stubFetch(completion("I cannot answer that."));

        await expect(generateRepositoryReport("demo", graph, "demo")).rejects.toThrow(
            LlmError
        );
    });

    it("fails fast when no key is configured", async () => {
        env.llm.key = "";

        await expect(generateRepositoryReport("demo", graph, "demo")).rejects.toThrow(
            /LLM_API_KEY/
        );
    });
});

describe("summarizeFunction", () => {

    it("returns a one-line summary from the source snippet", async () => {
        stubFetch(
            completion("Runs the analysis pipeline and returns the report.")
        );

        const summary = await summarizeFunction(
            "demo",
            "function:src/app.ts:run"
        );

        expect(summary.cached).toBe(false);
        expect(summary.summary).toBe(
            "Runs the analysis pipeline and returns the report."
        );
    });

    it("serves repeat lookups from the cache", async () => {
        const fetchMock = stubFetch(completion("Builds the report."));

        await summarizeFunction("demo", "function:src/app.ts:run");
        const second = await summarizeFunction(
            "demo",
            "function:src/app.ts:run"
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.cached).toBe(true);
    });

    it("regenerates after an explicit invalidation for the repository", async () => {
        const fetchMock = stubFetch(completion("Rebuilt the report."));

        await summarizeFunction("demo", "function:src/app.ts:run");
        invalidateSummaries("demo");
        await summarizeFunction("demo", "function:src/app.ts:run");

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("rejects non-function nodes", async () => {
        stubFetch(completion("nope"));

        await expect(
            summarizeFunction("demo", "file:src/app.ts")
        ).rejects.toThrow(/not a Function/);
    });

    it("404s for unknown nodes", async () => {
        stubFetch(completion("nope"));

        await expect(
            summarizeFunction("demo", "function:src/app.ts:missing")
        ).rejects.toThrow(/not found/i);
    });
});

describe("buildRepoDigest", () => {
    it("exposes the digest used by the report prompt", () => {
        const digest = buildRepoDigest("demo", graph);
        expect(digest.fileCount).toBe(1);
        expect(digest.functionCount).toBe(1);
    });
});
