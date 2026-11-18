import { describe, it, expect } from "vitest";

import * as path from "path";

import { analyzeRepository } from "../services/analysis.service";
import {
    buildWorkflows,
    summarizeWorkflow
} from "../services/workflow/workflow.service";

import { GraphData } from "../models/graph.types";

/*
 * Build 05 regression tests for Coremation's deterministic half: callback
 * extraction, caller attribution, call occurrences, control-flow evidence,
 * route/request extraction, request-to-route matching and workflow
 * reconstruction. Everything here is offline and deterministic — no LLM.
 */

const fixturesRoot = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures"
);

function analyze(fixture: string): GraphData {
    return analyzeRepository(path.join(fixturesRoot, fixture));
}

function edge(
    graph: GraphData,
    source: string,
    type: string,
    target: string
) {
    return graph.relationships.find(
        (relationship) =>
            relationship.source === source &&
            relationship.type === type &&
            relationship.target === target
    );
}

function fileEvidence(graph: GraphData, filePath: string) {
    return graph.nodes.find(
        (node) => node.type === "File" && node.filePath === filePath
    )?.workflowEvidence;
}

describe("Build 05 — callbacks and attribution", () => {

    const graph = analyze("callbacks");

    it("creates an entity for a useCallback-wrapped handler", () => {
        expect(
            graph.nodes.some(
                (node) => node.id === "function:panel.ts:handlePick"
            )
        ).toBe(true);
    });

    it("contains the wrapped handler in its file", () => {
        expect(
            edge(
                graph,
                "file:panel.ts",
                "CONTAINS",
                "function:panel.ts:handlePick"
            )
        ).toBeDefined();
    });

    it("attributes calls to the callback, not to the enclosing component", () => {

        const calls = edge(
            graph,
            "function:panel.ts:handlePick",
            "CALLS",
            "function:panel.ts:helper"
        );

        expect(calls).toBeDefined();

        /*
         * Pre-Build-05 behaviour produced this false edge instead: calls made
         * inside an anonymous callback were blamed on the nearest named
         * function.
         */
        expect(
            edge(
                graph,
                "function:panel.ts:Panel",
                "CALLS",
                "function:panel.ts:helper"
            )
        ).toBeUndefined();
    });

    it("keeps both call sites of the same target as occurrences", () => {

        const calls = edge(
            graph,
            "function:panel.ts:handlePick",
            "CALLS",
            "function:panel.ts:helper"
        );

        const occurrences = calls?.occurrences ?? [];

        expect(occurrences).toHaveLength(2);

        /*
         * `sequence` is caller-global source order (every call site in the
         * callable consumes the next number, including unresolved ones), so
         * the two occurrences must simply be increasing and carry distinct
         * lines.
         */
        expect(occurrences[1].sequence).toBeGreaterThan(occurrences[0].sequence);
        expect(occurrences[1].line).toBeGreaterThan(occurrences[0].line);
        expect(occurrences[0].branch).toBe("unconditional");
        expect(occurrences[0].awaited).toBe(false);
        expect(occurrences[0].callId).toContain("panel.ts");
    });

    it("does not attribute calls to an ownerless anonymous callback", () => {

        /*
         * `[1, 2].map((value) => helper(value))` has no addressable callable
         * for the map callback, so the call stays unattributed instead of
         * being blamed on `Panel`.
         */
        expect(
            edge(
                graph,
                "function:panel.ts:Panel",
                "CALLS",
                "function:panel.ts:helper"
            )
        ).toBeUndefined();
    });

    it("records async declarations", () => {

        const branches = analyze("branches");

        const loadRemote = branches.nodes.find(
            (node) => node.id === "function:flow.ts:loadRemote"
        );

        expect(loadRemote?.async).toBe(true);
        expect(
            branches.nodes.find((node) => node.id === "function:flow.ts:ok")
                ?.async
        ).toBeFalsy();
    });

    it("records exports", () => {
        const branches = analyze("branches");

        expect(
            branches.nodes.find((node) => node.id === "function:flow.ts:classify")
                ?.exported
        ).toBe(true);
    });
});

describe("Build 05 — control-flow evidence", () => {

    const evidence = fileEvidence(analyze("branches"), "flow.ts");

    it("records if / else-if / else branches with their conditions", () => {

        const classify = evidence?.units.find(
            (unit) => unit.id === "function:flow.ts:classify"
        );

        const kinds = (classify?.branches ?? []).map((branch) => branch.kind);

        expect(kinds).toContain("if.then");
        expect(kinds).toContain("else-if");
        expect(kinds).toContain("if.else");

        const condition = classify?.branches.find(
            (branch) => branch.kind === "if.then"
        )?.condition;

        expect(condition).toBe("score > 90");
    });

    it("records switch cases and the default branch", () => {

        const classify = evidence?.units.find(
            (unit) => unit.id === "function:flow.ts:classify"
        );

        const kinds = (classify?.branches ?? []).map((branch) => branch.kind);

        expect(kinds).toContain("case");
        expect(kinds).toContain("default");
    });

    it("records try / catch and ternary branches", () => {

        const classify = evidence?.units.find(
            (unit) => unit.id === "function:flow.ts:classify"
        );

        const kinds = (classify?.branches ?? []).map((branch) => branch.kind);

        expect(kinds).toContain("try");
        expect(kinds).toContain("catch");
        expect(kinds).toContain("ternary.consequent");
        expect(kinds).toContain("ternary.alternate");
    });

    it("records returns, throws, awaits and loops separately", () => {

        const units = evidence?.units ?? [];

        const classify = units.find(
            (unit) => unit.id === "function:flow.ts:classify"
        );
        const getOrder = units.find(
            (unit) => unit.id === "function:flow.ts:loadRemote"
        );

        expect(classify?.returns.length).toBeGreaterThan(0);
        expect(classify?.loops.length).toBeGreaterThan(0);
        expect(getOrder?.awaits.length).toBeGreaterThan(0);

        const fail = units.find(
            (unit) => unit.id === "function:flow.ts:unresolvable"
        );

        expect(fail).toBeDefined();
    });

    it("marks unresolved calls instead of inventing targets", () => {

        const unresolved = evidence?.unresolved ?? [];
        const names = unresolved.map((entry) => entry.callee);

        expect(names).toContain("missingThing");
        expect(names).toContain("somethingElse");

        for (const entry of unresolved) {
            expect(["not-resolved", "target-not-in-graph"]).toContain(
                entry.reason
            );
        }
    });

    it("never turns an unresolved call into a CALLS edge", () => {

        const graph = analyze("branches");

        for (const relationship of graph.relationships) {
            if (relationship.type === "CALLS") {
                expect(relationship.target).toMatch(/^function:/);
            }
        }
    });

    it("keeps recursion as evidence without adding a self-loop edge", () => {

        const graph = analyze("branches");
        const evidence = fileEvidence(graph, "flow.ts");

        /* `recursive(value - 1)` calls itself once. */
        expect(evidence?.selfCalls ?? []).toHaveLength(1);

        /* The architectural graph still contains no self-loops. */
        for (const relationship of graph.relationships) {
            expect(relationship.source).not.toBe(relationship.target);
        }

        /* And it is reported, not hidden, in workflow provenance. */
        const workflows = buildWorkflows("branches", graph);

        expect(workflows[0].provenance.selfCalls).toBe(1);
    });

    it("labels branch context on occurrences", () => {

        const graph = analyze("branches");

        const classifyToFail = graph.relationships.find(
            (relationship) =>
                relationship.source === "function:flow.ts:classify" &&
                relationship.target === "function:flow.ts:fail"
        );

        const branches = (classifyToFail?.occurrences ?? []).map(
            (occurrence) => occurrence.branch
        );

        expect(branches.some((branch) => branch !== "unconditional")).toBe(true);
        expect(branches).toContain("if.else");
        expect(branches).toContain("default");
    });
});

describe("Build 05 — HTTP boundaries", () => {

    const graph = analyze("boundaries");

    it("extracts routes with method, path and resolved handler", () => {

        const evidence = fileEvidence(graph, "routes/orders.routes.ts");

        const paths = (evidence?.routes ?? []).map(
            (route) => `${route.method} ${route.path}`
        );

        expect(paths).toContain("GET /orders/:id");
        expect(paths).toContain("POST /orders");

        const getRoute = evidence?.routes.find(
            (route) => route.method === "GET"
        );

        expect(getRoute?.handler).toBe("getOrder");
        expect(getRoute?.handlerId).toBe(
            "function:controllers/orders.controller.ts:getOrder"
        );
    });

    it("applies the /api mount prefix from server.ts", () => {

        const workflows = buildWorkflows("boundaries", graph);

        const routeStep = workflows
            .flatMap((workflow) => workflow.steps)
            .find((step) => step.kind === "route");

        expect(routeStep?.label).toBe("GET /api/orders/:id");
    });

    it("extracts client requests, static and dynamic", () => {

        const evidence = fileEvidence(graph, "client/api.ts");

        const urls = (evidence?.requests ?? []).map(
            (request) => `${request.method} ${request.url}`
        );

        expect(urls).toContain("GET /api/orders/*");
        expect(urls).toContain("POST /api/orders");
        expect(urls).toContain("GET ");

        const dynamic = evidence?.requests.find(
            (request) => request.url === ""
        );

        expect(dynamic?.urlStatic).toBe(false);
    });

    it("links a client request through the route into its handler", () => {

        const workflows = buildWorkflows("boundaries", graph);

        const client = workflows.find((workflow) =>
            workflow.steps.some(
                (step) => step.entityId === "function:client/api.ts:loadOrder"
            )
        );

        expect(client).toBeDefined();

        const ids = (client?.steps ?? []).map((step) => step.entityId);

        expect(ids).toContain("function:client/api.ts:loadOrder");
        expect(ids).toContain("function:controllers/orders.controller.ts:getOrder");
        expect(ids).toContain("function:services/order.service.ts:readOrder");

        const kinds = (client?.edges ?? []).map((edgeItem) => edgeItem.kind);

        expect(kinds).toContain("http");
        expect(kinds).toContain("call");
    });

    it("reports ambiguous matches as ambiguous, never as one guess", () => {

        const ambiguous = analyze("boundaries-ambiguous");
        const evidence = fileEvidence(ambiguous, "routes/list.routes.ts");

        expect((evidence?.routes ?? []).length).toBe(2);

        const workflows = buildWorkflows("boundaries-ambiguous", ambiguous);

        const httpEdges = workflows
            .flatMap((workflow) => workflow.edges)
            .filter((item) => item.kind === "http");

        expect(httpEdges.some((item) => item.evidence === "ambiguous")).toBe(
            true
        );
    });

    it("produces no workflow for a repository with nothing to trace", () => {

        const graphEmpty = analyze("no-workflow");

        expect(buildWorkflows("no-workflow", graphEmpty)).toEqual([]);
    });

    it("never reads an ordinary map lookup as an HTTP route", () => {

        const decoys = analyze("route-decoys");
        const evidence = fileEvidence(decoys, "store.ts");

        /*
         * `byId.get("/settings")` and `anything.get("/health")` look like
         * registrations to a naive method-name check; only a router-shaped
         * receiver counts.
         */
        expect(evidence?.routes ?? []).toEqual([]);
    });
});

describe("Build 05 — workflow shape", () => {

    const graph = analyze("boundaries");
    const workflows = buildWorkflows("boundaries", graph);

    it("carries source provenance on every step", () => {

        for (const workflow of workflows) {
            for (const step of workflow.steps) {
                expect(step.filePath).toBeTruthy();
                expect(step.line).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it("starts unrelied-upon refinement as not-requested", () => {

        for (const workflow of workflows) {
            expect(workflow.refinement.state).toBe("not-requested");
            expect(workflow.provenance.evidenceVersion).toBe("v1");
        }
    });

    it("keeps workflows inside the declared limits", () => {

        expect(workflows.length).toBeLessThanOrEqual(12);

        for (const workflow of workflows) {
            expect(workflow.steps.length).toBeLessThanOrEqual(24);
            expect(workflow.paths.length).toBeLessThanOrEqual(8);

            for (const p of workflow.paths) {
                expect(p.stepKeys.length).toBeGreaterThan(0);
            }
        }
    });

    it("keeps the path list inside its budget even with many guards", () => {

        const branches = analyze("branches");
        const reconstructed = buildWorkflows("branches", branches);

        expect(reconstructed.length).toBeGreaterThan(0);

        for (const workflow of reconstructed) {
            expect(workflow.paths.length).toBeLessThanOrEqual(8);

            /* Every advertised path must be traversable. */
            for (const path of workflow.paths) {
                expect(path.stepKeys.length).toBeGreaterThan(0);
            }
        }
    });

    it("summarises for a selector list", () => {

        const summaries = workflows.map(summarizeWorkflow);

        expect(summaries.length).toBe(workflows.length);
        expect(summaries[0].title.length).toBeGreaterThan(0);
        expect(summaries[0].entryLabel.length).toBeGreaterThan(0);
    });

    it("derives a fingerprint that changes with evidence", () => {

        const withEvidence = workflows[0].provenance.graphFingerprint;

        /* Stored graphs from before Build 05 have no evidence at all. */
        const legacy = {
            ...graph,
            nodes: graph.nodes.map((node) => ({ ...node, workflowEvidence: undefined }))
        };

        const legacyWorkflows = buildWorkflows("boundaries", legacy as GraphData);

        expect(legacyWorkflows[0]?.provenance.evidenceVersion).toBe("none");
        expect(legacyWorkflows[0]?.provenance.graphFingerprint).not.toBe(
            withEvidence
        );
    });
});
