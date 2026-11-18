import { afterEach, describe, expect, it, vi } from "vitest";

import request from "supertest";

import type { NextFunction, Request, Response } from "express";

/*
 * Build 05 API + refinement tests.
 *
 * The Neo4j layer is mocked with a graph that already carries Build 05
 * evidence (requests, routes, mounts, occurrences, control-flow units), so
 * the workflow routes are exercised without a database, and the LLM
 * boundary is stubbed through global fetch. No test touches a live API.
 */

const clientFile = {
    id: "file:client/api.ts",
    type: "File",
    name: "api.ts",
    filePath: "client/api.ts",
    startLine: 1,
    endLine: 6,
    category: "source",
    inDefaultScope: true,
    workflowEvidence: {
        routes: [],
        requests: [
            {
                method: "GET",
                url: "/api/orders/1",
                urlStatic: true,
                client: "fetch",
                callerId: "function:client/api.ts:loadOrder",
                line: 3
            }
        ],
        mounts: [
            {
                prefix: "/api",
                targetName: "orderRoutes",
                targetFile: "routes/orders.routes.ts",
                line: 5
            }
        ],
        units: [],
        unresolved: [],
        external: [],
        truncated: false
    }
};

const routesFile = {
    id: "file:routes/orders.routes.ts",
    type: "File",
    name: "orders.routes.ts",
    filePath: "routes/orders.routes.ts",
    startLine: 1,
    endLine: 8,
    category: "source",
    inDefaultScope: true,
    workflowEvidence: {
        routes: [
            {
                method: "GET",
                path: "/orders/:id",
                mountPath: "",
                fullPath: "/orders/:id",
                handler: "getOrder",
                handlerId: "function:controllers/orders.controller.ts:getOrder",
                line: 6,
                middleware: []
            }
        ],
        requests: [],
        mounts: [],
        units: [],
        unresolved: [],
        external: ["express"],
        truncated: false
    }
};

const controllerFile = {
    id: "file:controllers/orders.controller.ts",
    type: "File",
    name: "orders.controller.ts",
    filePath: "controllers/orders.controller.ts",
    startLine: 1,
    endLine: 12,
    category: "source",
    inDefaultScope: true,
    workflowEvidence: {
        routes: [],
        requests: [],
        mounts: [],
        units: [
            {
                id: "function:controllers/orders.controller.ts:getOrder",
                name: "getOrder",
                branches: [
                    { kind: "if.then", condition: "!request.params.id", line: 5 }
                ],
                returns: [8],
                throws: [6],
                awaits: [],
                loops: []
            }
        ],
        unresolved: [
            {
                callerId: "function:controllers/orders.controller.ts:getOrder",
                callee: "auditLog",
                line: 9,
                reason: "not-resolved"
            }
        ],
        external: [],
        truncated: false
    }
};

const nodes = [
    {
        id: "repository:demo",
        type: "Repository",
        name: "demo",
        filePath: "",
        startLine: 0,
        endLine: 0
    },
    clientFile,
    routesFile,
    controllerFile,
    {
        id: "file:services/order.service.ts",
        type: "File",
        name: "order.service.ts",
        filePath: "services/order.service.ts",
        startLine: 1,
        endLine: 4,
        category: "source",
        inDefaultScope: true
    },
    {
        id: "function:client/api.ts:loadOrder",
        type: "Function",
        name: "loadOrder",
        filePath: "client/api.ts",
        startLine: 2,
        endLine: 5,
        exported: true,
        async: true
    },
    {
        id: "function:controllers/orders.controller.ts:getOrder",
        type: "Function",
        name: "getOrder",
        filePath: "controllers/orders.controller.ts",
        startLine: 4,
        endLine: 9,
        exported: true,
        sourceSnippet: "function getOrder(req) { readOrder(req.id); }"
    },
    {
        id: "function:services/order.service.ts:readOrder",
        type: "Function",
        name: "readOrder",
        filePath: "services/order.service.ts",
        startLine: 2,
        endLine: 3,
        exported: true
    }
];

const relationships = [
    {
        source: "file:client/api.ts",
        target: "function:client/api.ts:loadOrder",
        type: "CONTAINS",
        evidence: { filePath: "client/api.ts", line: 2, resolution: "derived" }
    },
    {
        source: "function:controllers/orders.controller.ts:getOrder",
        target: "function:services/order.service.ts:readOrder",
        type: "CALLS",
        evidence: {
            filePath: "controllers/orders.controller.ts",
            line: 5,
            resolution: "resolved"
        },
        occurrences: [
            {
                callId: "controllers/orders.controller.ts:5:4",
                line: 5,
                column: 4,
                branch: "unconditional",
                awaited: false,
                sequence: 1
            }
        ]
    }
];

vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async (repository?: string) => {

        if (repository === "legacy") {
            /* A stored graph from before Build 05: no evidence at all. */
            return {
                nodes: nodes.map((node) => ({ ...node, workflowEvidence: undefined })),
                relationships
            };
        }

        return repository === "demo" ? { nodes, relationships } : { nodes: [], relationships: [] };
    }),
    fetchFunctionContext: vi.fn(async () => null),
    listRepositories: vi.fn(async () => ["demo"]),
    saveGraph: vi.fn(async () => undefined)
}));

/*
 * Build 06: authentication and ownership are mocked here so the existing
 * workflow assertions are unchanged. The real middleware is covered by the
 * dedicated auth/ownership tests.
 */
vi.mock("../middleware/auth.middleware", () => ({
    requireAuth: (request: Request, _response: Response, next: NextFunction) => {
        request.user = { id: "user-1", email: "user@example.com" };
        next();
    }
}));

vi.mock("../services/repositories.service", () => ({
    findRepositoryForUser: vi.fn(async (id: string, userId: string) => ({
        id,
        user_id: userId,
        name: id,
        source_type: "zip",
        status: "completed",
        graph_persisted: true,
        node_count: 0,
        relationship_count: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
    })),
    createRepository: vi.fn(),
    listRepositoriesForUser: vi.fn(async () => []),
    updateRepositoryOutcome: vi.fn(async () => undefined)
}));

import { app } from "../server";

import { clearRefinementCache, validateRefinement } from "../services/workflow/refine.service";
import { buildWorkflows } from "../services/workflow/workflow.service";

function stubCompletion(content: string): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ choices: [{ message: { content } }] })
        }))
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    clearRefinementCache();
});

describe("GET /api/workflows", () => {

    it("lists deterministic candidate workflows for a stored repository", async () => {

        const response = await request(app).get("/api/workflows?repository=demo");

        expect(response.status).toBe(200);
        expect(response.body.repository).toBe("demo");
        expect(response.body.evidenceVersion).toBe("v1");
        expect(response.body.count).toBeGreaterThan(0);

        const titles = response.body.workflows.map(
            (entry: { title: string }) => entry.title
        );

        expect(titles.join(" ")).toContain("loadOrder");
    });

    it("links the client request through the route into its handler", async () => {

        const list = await request(app).get("/api/workflows?repository=demo");

        const id = list.body.workflows[0].id as string;

        const response = await request(app).get(
            `/api/workflows/${encodeURIComponent(id)}?repository=demo`
        );

        expect(response.status).toBe(200);

        const entities = response.body.steps.map(
            (step: { entityId: string | null }) => step.entityId
        );

        expect(entities).toContain("function:client/api.ts:loadOrder");
        expect(entities).toContain("function:controllers/orders.controller.ts:getOrder");
        expect(entities).toContain("function:services/order.service.ts:readOrder");

        const labels = response.body.steps.map((step: { label: string }) => step.label);

        expect(labels).toContain("GET /api/orders/:id");

        const kinds = response.body.edges.map(
            (edgeItem: { kind: string }) => edgeItem.kind
        );

        expect(kinds).toContain("http");
        expect(kinds).toContain("call");

        expect(response.body.refinement.state).toBe("not-requested");
        expect(response.body.provenance.evidenceVersion).toBe("v1");
    });

    it("offers a guard-ignoring traversal when branches fill the path budget", async () => {

        const list = await request(app).get("/api/workflows?repository=demo");
        const id = list.body.workflows[0].id as string;

        const response = await request(app).get(
            `/api/workflows/${encodeURIComponent(id)}?repository=demo`
        );

        const all = response.body.paths.find(
            (path: { id: string }) => path.id === "path:all"
        );

        /* The extra path is labelled so it cannot be read as a fixed order. */
        expect(all.label).toMatch(/guard conditions ignored/i);
        expect(all.stepKeys.length).toBeGreaterThanOrEqual(
            response.body.paths[0].stepKeys.length
        );
    });

    it("400s without a repository parameter", async () => {

        const response = await request(app).get("/api/workflows");

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/repository/);
    });

    it("404s for a repository with no stored graph", async () => {

        const response = await request(app).get("/api/workflows?repository=nope");

        expect(response.status).toBe(404);
    });

    it("flags a stored graph that predates the evidence", async () => {

        const response = await request(app).get("/api/workflows?repository=legacy");

        expect(response.status).toBe(200);
        expect(response.body.evidenceVersion).toBe("none");
        expect(response.body.note).toMatch(/Re-analyze/);
    });

    it("404s for an unknown workflow id", async () => {

        const response = await request(app).get(
            "/api/workflows/does-not-exist?repository=demo"
        );

        expect(response.status).toBe(404);
    });
});

describe("POST /api/workflows/:id/refine", () => {

    it("applies validated wording and keeps the structure identical", async () => {

        const list = await request(app).get("/api/workflows?repository=demo");
        const id = list.body.workflows[0].id as string;

        const before = await request(app).get(
            `/api/workflows/${encodeURIComponent(id)}?repository=demo`
        );

        stubCompletion(
            JSON.stringify({
                title: "Load an order through the API",
                description: "Client request, route handler, service read.",
                steps: [
                    { key: before.body.steps[0].key, label: "Ask the API for one order" },
                    { key: "step:invented:target:99", label: "Fabricated step" }
                ],
                paths: [{ id: "path:main", label: "Happy path" }]
            })
        );

        const response = await request(app).post(
            `/api/workflows/${encodeURIComponent(id)}/refine?repository=demo`
        );

        expect(response.status).toBe(200);
        expect(response.body.refinement.state).toBe("applied");
        expect(response.body.refinement.title).toBe("Load an order through the API");
        expect(
            response.body.refinement.stepLabels[before.body.steps[0].key]
        ).toBe("Ask the API for one order");

        /* The invented key is counted, not used. */
        expect(response.body.refinement.rejected.stepKeys).toBe(1);
        expect(Object.keys(response.body.refinement.stepLabels)).toHaveLength(1);

        /* Structure is untouched. */
        expect(response.body.steps).toEqual(before.body.steps);
        expect(response.body.edges).toEqual(before.body.edges);
        expect(response.body.title).toBe(before.body.title);
    });

    it("serves a cached refinement without a second model call", async () => {

        const list = await request(app).get("/api/workflows?repository=demo");
        const id = list.body.workflows[0].id as string;

        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Cached wording",
                                description: "Still cached.",
                                steps: [],
                                paths: []
                            })
                        }
                    }
                ]
            })
        }));

        vi.stubGlobal("fetch", fetchMock);

        const path = `/api/workflows/${encodeURIComponent(id)}/refine?repository=demo`;

        await request(app).post(path);
        const second = await request(app).post(path);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.body.refinement.title).toBe("Cached wording");
    });

    it("keeps the deterministic workflow when the model output is unusable", async () => {

        const list = await request(app).get("/api/workflows?repository=demo");
        const id = list.body.workflows[0].id as string;

        stubCompletion("this is not json at all");

        const response = await request(app).post(
            `/api/workflows/${encodeURIComponent(id)}/refine?repository=demo`
        );

        expect(response.status).toBe(200);
        expect(response.body.refinement.state).toBe("unavailable");
        expect(response.body.steps.length).toBeGreaterThan(1);
        expect(response.body.title).toBeTruthy();
    });

    it("never exposes provider secrets or credentials in the response", async () => {

        const list = await request(app).get("/api/workflows?repository=demo");
        const id = list.body.workflows[0].id as string;

        stubCompletion("{}");

        const response = await request(app).post(
            `/api/workflows/${encodeURIComponent(id)}/refine?repository=demo`
        );

        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toMatch(/authorization|bearer|api[_-]?key/i);
    });
});

describe("refine validation (unit, no network)", () => {

    const workflow = buildWorkflows("demo", { nodes, relationships } as never)[0];

    it("drops unknown step keys, unknown paths and non-strings", () => {

        const { refined } = validateRefinement(workflow, {
            title: 42,
            description: "ok",
            steps: [
                { key: workflow.steps[0].key, label: "Valid label" },
                { key: workflow.steps[0].key },
                { key: "nope", label: "Invented" }
            ],
            paths: [{ id: "nope", label: "Invented path" }]
        });

        expect(refined.refinement.title).toBeUndefined();
        expect(refined.refinement.description).toBe("ok");
        expect(Object.keys(refined.refinement.stepLabels ?? {})).toHaveLength(1);
        expect(refined.refinement.rejected?.stepKeys).toBe(2);
        expect(refined.refinement.rejected?.pathIds).toBe(1);
        expect(refined.steps).toEqual(workflow.steps);
        expect(refined.edges).toEqual(workflow.edges);
    });

    it("clips over-long labels instead of trusting the model", () => {

        const long = "x".repeat(400);

        const { refined } = validateRefinement(workflow, {
            title: long,
            description: long,
            steps: [{ key: workflow.steps[0].key, label: long }],
            paths: []
        });

        expect((refined.refinement.title ?? "").length).toBeLessThanOrEqual(60);
        expect((refined.refinement.description ?? "").length).toBeLessThanOrEqual(200);
        expect(
            (refined.refinement.stepLabels?.[workflow.steps[0].key] ?? "").length
        ).toBeLessThanOrEqual(40);
    });

    it("reports rejected when nothing usable came back", () => {

        const { refined } = validateRefinement(workflow, { steps: [], paths: [] });

        expect(refined.refinement.state).toBe("rejected");
        expect(refined.refinement.title).toBeUndefined();
    });

    it("ignores any attempt to add structure or code", () => {

        const { refined } = validateRefinement(workflow, {
            title: "T",
            steps: [{ key: workflow.steps[0].key, label: "L" }],
            extraSteps: [{ key: "sneaky" }],
            edges: [{ from: "a", to: "b", kind: "call" }],
            code: "rm -rf /"
        } as never);

        expect(refined.steps).toEqual(workflow.steps);
        expect(refined.edges).toEqual(workflow.edges);
        expect(JSON.stringify(refined)).not.toContain("rm -rf");
    });
});
