import { describe, it, expect } from "vitest";

import * as path from "path";

import { analyzeRepository } from "../services/analysis.service";

import {
    GraphData,
    GraphRelationship
} from "../models/graph.types";

/*
 * Fixture-driven integration tests for the analysis pipeline.
 *
 * Each fixture under src/test-fixtures is a tiny, focused repository
 * exercising one behaviour of the scan -> parse -> extract -> assemble
 * flow. Running the real pipeline (no mocks) keeps these tests locked to
 * the actual output the API returns.
 */

const fixturesRoot = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures"
);

function analyze(fixture: string): GraphData {
    return analyzeRepository(
        path.join(fixturesRoot, fixture)
    );
}

function hasNode(graph: GraphData, id: string): boolean {
    return graph.nodes.some((node) => node.id === id);
}

function findRelationship(
    graph: GraphData,
    source: string,
    type: string,
    target: string
): GraphRelationship | undefined {
    return graph.relationships.find(
        (relationship) =>
            relationship.source === source &&
            relationship.type === type &&
            relationship.target === target
    );
}

describe("analysis pipeline — imports", () => {

    const graph = analyze("imports");

    it("creates the repository, file and function nodes", () => {
        expect(hasNode(graph, "repository:imports")).toBe(true);
        expect(hasNode(graph, "file:a.ts")).toBe(true);
        expect(hasNode(graph, "file:b.ts")).toBe(true);
        expect(hasNode(graph, "function:a.ts:run")).toBe(true);
        expect(hasNode(graph, "function:b.ts:helper")).toBe(true);
    });

    it("records a resolved IMPORTS edge between the files", () => {
        const imports = findRelationship(
            graph,
            "file:a.ts",
            "IMPORTS",
            "file:b.ts"
        );

        expect(imports).toBeDefined();
        expect(imports?.evidence?.resolution).toBe("resolved");
        expect(imports?.evidence?.filePath).toBe("a.ts");
        expect(imports?.evidence?.line).toBe(1);
    });

    it("resolves a cross-file call through the import", () => {
        const calls = findRelationship(
            graph,
            "function:a.ts:run",
            "CALLS",
            "function:b.ts:helper"
        );

        expect(calls).toBeDefined();
        expect(calls?.evidence?.resolution).toBe("resolved");
    });

    it("links the repository to each root-level file with derived CONTAINS", () => {
        const contains = findRelationship(
            graph,
            "repository:imports",
            "CONTAINS",
            "file:a.ts"
        );

        expect(contains).toBeDefined();
        expect(contains?.evidence?.resolution).toBe("derived");
    });
});

describe("analysis pipeline — calls", () => {

    const graph = analyze("calls");

    it("resolves calls within a file and across a local import", () => {
        expect(
            findRelationship(
                graph,
                "function:main.ts:compute",
                "CALLS",
                "function:math.ts:double"
            )
        ).toBeDefined();

        expect(
            findRelationship(
                graph,
                "function:math.ts:double",
                "CALLS",
                "function:math.ts:add"
            )
        ).toBeDefined();
    });

    it("emits the IMPORTS edge for the local dependency", () => {
        expect(
            findRelationship(
                graph,
                "file:main.ts",
                "IMPORTS",
                "file:math.ts"
            )
        ).toBeDefined();
    });
});

describe("analysis pipeline — inheritance", () => {

    const graph = analyze("inheritance");

    it("emits a name-match EXTENDS edge to the superclass", () => {
        const extendsEdge = findRelationship(
            graph,
            "class:dog.ts:Dog",
            "EXTENDS",
            "class:base.ts:Animal"
        );

        expect(extendsEdge).toBeDefined();
        expect(extendsEdge?.evidence?.resolution).toBe("name-match");
    });

    it("qualifies method ids with their class and contains them", () => {
        expect(hasNode(graph, "method:base.ts:Animal:speak")).toBe(true);
        expect(hasNode(graph, "method:dog.ts:Dog:bark")).toBe(true);

        expect(
            findRelationship(
                graph,
                "class:base.ts:Animal",
                "CONTAINS",
                "method:base.ts:Animal:speak"
            )
        ).toBeDefined();
    });
});

describe("analysis pipeline — arrow functions", () => {

    const graph = analyze("arrow-functions");

    it("treats arrow and function-expression consts as Function entities", () => {
        expect(hasNode(graph, "function:util.ts:greet")).toBe(true);
        expect(hasNode(graph, "function:util.ts:shout")).toBe(true);
    });

    it("contains the arrow functions in their file", () => {
        expect(
            findRelationship(
                graph,
                "file:util.ts",
                "CONTAINS",
                "function:util.ts:greet"
            )
        ).toBeDefined();

        const contains = findRelationship(
            graph,
            "file:util.ts",
            "CONTAINS",
            "function:util.ts:shout"
        );

        expect(contains?.evidence?.resolution).toBe("derived");
    });

    it("resolves a call from a function expression into an arrow target", () => {
        const calls = findRelationship(
            graph,
            "function:util.ts:shout",
            "CALLS",
            "function:util.ts:greet"
        );

        expect(calls).toBeDefined();
        expect(calls?.evidence?.resolution).toBe("resolved");
    });
});

describe("analysis pipeline — duplicate names", () => {

    const graph = analyze("duplicate-names");

    it("keeps same-named functions in different files as distinct nodes", () => {
        expect(hasNode(graph, "function:one.ts:foo")).toBe(true);
        expect(hasNode(graph, "function:two.ts:foo")).toBe(true);
    });

    it("qualifies same-named methods with their class", () => {
        expect(hasNode(graph, "method:one.ts:A:run")).toBe(true);
        expect(hasNode(graph, "method:two.ts:B:run")).toBe(true);
    });

    it("attributes each call to the same-file function, not the namesake", () => {
        expect(
            findRelationship(
                graph,
                "method:one.ts:A:run",
                "CALLS",
                "function:one.ts:foo"
            )
        ).toBeDefined();

        expect(
            findRelationship(
                graph,
                "method:two.ts:B:run",
                "CALLS",
                "function:two.ts:foo"
            )
        ).toBeDefined();
    });
});

describe("analysis pipeline — unresolved references", () => {

    const graph = analyze("unresolved");

    it("keeps the file and function even when imports/calls cannot resolve", () => {
        expect(hasNode(graph, "file:index.ts")).toBe(true);
        expect(hasNode(graph, "function:index.ts:load")).toBe(true);
    });

    it("omits unresolvable IMPORTS and CALLS edges", () => {
        const nonContains = graph.relationships.filter(
            (relationship) => relationship.type !== "CONTAINS"
        );

        expect(nonContains).toEqual([]);
    });
});

describe("analysis pipeline — fault tolerance", () => {

    it("skips an unparsable file without aborting the analysis", () => {
        const graph = analyze("unsupported");

        expect(graph.nodes).toHaveLength(1);
        expect(graph.nodes[0].type).toBe("Repository");
        expect(graph.relationships).toEqual([]);
    });

    it("returns a repository-only graph for an empty directory", () => {
        const graph = analyze("empty");

        expect(graph.nodes).toHaveLength(1);
        expect(graph.nodes[0].id).toBe("repository:empty");
    });
});

describe("analysis pipeline — relevance scope", () => {

    const graph = analyze("relevance");

    it("classifies files by category", () => {
        const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));

        expect(byId.get("file:src/app.ts")?.category).toBe("source");
        expect(byId.get("file:src/app.test.ts")?.category).toBe("test");
        expect(byId.get("file:src/__fixtures__/sample.ts")?.category).toBe("fixture");
        expect(byId.get("file:src/generated/api.ts")?.category).toBe("generated");
        expect(byId.get("file:vite.config.ts")?.category).toBe("config");
    });

    it("keeps every file in the graph but flags default scope", () => {
        expect(graph.nodes.filter((entry) => entry.type === "File")).toHaveLength(7);

        const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));

        expect(byId.get("file:src/app.test.ts")?.inDefaultScope).toBe(false);
        expect(byId.get("file:src/generated/api.ts")?.inDefaultScope).toBe(true);
        expect(byId.get("file:shared/util.ts")?.inDefaultScope).toBe(true);
    });
});
