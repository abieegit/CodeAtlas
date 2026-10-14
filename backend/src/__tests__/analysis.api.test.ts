import { afterEach, describe, expect, it, vi } from "vitest";

import request from "supertest";

/*
 * The Neo4j layer is mocked with a small stored graph so the analysis
 * routes are exercised end-to-end without a database; the Provider API
 * boundary is stubbed through global fetch.
 */
vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async (repository?: string) => ({
        nodes:
            repository === "demo"
                ? [
                      {
                          id: "file:src/app.ts",
                          type: "File",
                          name: "app.ts",
                          filePath: "src/app.ts",
                          startLine: 1,
                          endLine: 9,
                          category: "source"
                      },
                      {
                          id: "function:src/app.ts:run",
                          type: "Function",
                          name: "run",
                          filePath: "src/app.ts",
                          startLine: 2,
                          endLine: 8,
                          sourceSnippet: "function run(g) { return g; }"
                      }
                  ]
                : [],
        relationships: []
    })),
    fetchFunctionContext: vi.fn(async () => ({
        node: {
            id: "function:src/app.ts:run",
            type: "Function",
            name: "run",
            filePath: "src/app.ts",
            startLine: 2,
            endLine: 8,
            sourceSnippet: "function run(g) { return g; }"
        },
        callers: ["main"],
        callees: []
    })),
    listRepositories: vi.fn(async () => ["demo"]),
    saveGraph: vi.fn(async () => undefined)
}));

import { app } from "../server";

import { clearReportCache } from "../services/analysis/report.service";
import { clearSummaryCache } from "../services/analysis/function-summary.service";

function stubCompletion(content: string): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
                choices: [{ message: { content } }]
            })
        }))
    );
}

const reportJson =
    '{"summary":"Tiny graph.","scalability":{"score":6,"verdict":"ok",' +
    '"factors":[{"title":"Size","detail":"Two nodes.","severity":"low"}]},' +
    '"sustainability":{"score":4,"verdict":"needs tests","factors":[]},' +
    '"recommendations":["Add tests."]}';

afterEach(() => {
    vi.unstubAllGlobals();
    clearReportCache();
    clearSummaryCache();
});

describe("GET /api/analysis", () => {

    it("returns a generated report for a stored repository", async () => {
        stubCompletion("```json\n" + reportJson + "\n```");

        const response = await request(app).get(
            "/api/analysis?repository=demo"
        );

        expect(response.status).toBe(200);
        expect(response.body.repository).toBe("demo");
        expect(response.body.summary).toBe("Tiny graph.");
        expect(response.body.scalability.score).toBe(6);
        expect(response.body.sustainability.verdict).toBe("needs tests");
        expect(response.body.model).toBeDefined();
    });

    it("400s without a repository parameter", async () => {
        const response = await request(app).get("/api/analysis");

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/repository/i);
    });

    it("404s for a repository with no stored graph", async () => {
        stubCompletion(reportJson);

        const response = await request(app).get(
            "/api/analysis?repository=unknown"
        );

        expect(response.status).toBe(404);
        expect(response.body.error).toMatch(/no stored graph/i);
    });
});

describe("GET /api/analysis/function", () => {

    it("returns the core-purpose summary for a function node", async () => {
        stubCompletion("Returns the graph unchanged.");

        const response = await request(app).get(
            "/api/analysis/function?repository=demo&nodeId=function:src/app.ts:run"
        );

        expect(response.status).toBe(200);
        expect(response.body.summary).toBe("Returns the graph unchanged.");
        expect(response.body.nodeId).toBe("function:src/app.ts:run");
    });

    it("400s when parameters are missing", async () => {
        const response = await request(app).get("/api/analysis/function");

        expect(response.status).toBe(400);
    });
});
