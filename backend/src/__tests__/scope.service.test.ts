import { describe, it, expect } from "vitest";

import { annotateScope } from "../services/scope.service";

import { GraphData, GraphNode } from "../models/graph.types";

function node(
    id: string,
    type: GraphNode["type"],
    filePath: string
): GraphNode {
    return {
        id,
        type,
        name: id.split(":").pop() ?? id,
        filePath,
        startLine: 0,
        endLine: 0
    };
}

function buildGraph(): GraphData {
    return {
        nodes: [
            node("repository:demo", "Repository", ""),
            node("directory:src", "Directory", "src"),
            node("directory:src/generated", "Directory", "src/generated"),
            node("file:src/app.ts", "File", "src/app.ts"),
            node("file:src/generated/api.ts", "File", "src/generated/api.ts"),
            node("file:src/app.test.ts", "File", "src/app.test.ts")
        ],
        relationships: [
            {
                source: "file:src/app.ts",
                target: "file:src/generated/api.ts",
                type: "IMPORTS"
            }
        ]
    };
}

describe("annotateScope", () => {

    it("classifies files and seeds source files into scope", () => {
        const graph = annotateScope(buildGraph());
        const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));

        expect(byId.get("file:src/app.ts")?.category).toBe("source");
        expect(byId.get("file:src/app.ts")?.inDefaultScope).toBe(true);
        expect(byId.get("file:src/app.test.ts")?.category).toBe("test");
        expect(byId.get("file:src/app.test.ts")?.inDefaultScope).toBe(false);
    });

    it("promotes a non-source file reachable from a source file", () => {
        const graph = annotateScope(buildGraph());
        const api = graph.nodes.find(
            (entry) => entry.id === "file:src/generated/api.ts"
        );

        expect(api?.category).toBe("generated");
        expect(api?.inDefaultScope).toBe(true);
    });

    it("never deletes nodes or relationships (hidden is not removed)", () => {
        const before = buildGraph();
        const graph = annotateScope(before);

        expect(graph.nodes).toHaveLength(before.nodes.length);
        expect(graph.relationships).toHaveLength(before.relationships.length);
    });

    it("marks a directory in scope when it contains an in-scope file", () => {
        const graph = annotateScope(buildGraph());
        const directory = graph.nodes.find(
            (entry) => entry.id === "directory:src"
        );

        expect(directory?.inDefaultScope).toBe(true);
    });
});
