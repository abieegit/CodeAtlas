import { describe, it, expect } from "vitest";

import { buildGraph } from "../parser/graph.builder";

import {
    GraphNode,
    GraphRelationship
} from "../models/graph.types";

const fileNode: GraphNode = {
    id: "file:src/a.ts",
    type: "File",
    name: "a.ts",
    filePath: "src/a.ts",
    startLine: 1,
    endLine: 10
};

const functionNode: GraphNode = {
    id: "function:src/a.ts:run",
    type: "Function",
    name: "run",
    filePath: "src/a.ts",
    startLine: 2,
    endLine: 5
};

describe("buildGraph — assembly", () => {

    it("adds the Repository and derived Directory nodes", () => {
        const graph = buildGraph([fileNode, functionNode], [], "demo");

        const ids = graph.nodes.map((node) => node.id);

        expect(ids).toContain("repository:demo");
        expect(ids).toContain("directory:src");
        expect(ids).toContain("file:src/a.ts");
    });

    it("links repository -> directory -> file with derived CONTAINS edges", () => {
        const graph = buildGraph([fileNode, functionNode], [], "demo");

        const repoToDir = graph.relationships.find(
            (relationship) =>
                relationship.source === "repository:demo" &&
                relationship.target === "directory:src" &&
                relationship.type === "CONTAINS"
        );

        const dirToFile = graph.relationships.find(
            (relationship) =>
                relationship.source === "directory:src" &&
                relationship.target === "file:src/a.ts" &&
                relationship.type === "CONTAINS"
        );

        expect(repoToDir?.evidence?.resolution).toBe("derived");
        expect(dirToFile?.evidence?.resolution).toBe("derived");
    });
});

describe("buildGraph — validation and de-duplication", () => {

    it("keeps only the first node for a repeated id", () => {
        const duplicate: GraphNode = {
            ...fileNode,
            name: "duplicate.ts"
        };

        const graph = buildGraph(
            [fileNode, duplicate],
            [],
            "demo"
        );

        const files = graph.nodes.filter(
            (node) => node.id === "file:src/a.ts"
        );

        expect(files).toHaveLength(1);
        expect(files[0].name).toBe("a.ts");
    });

    it("drops dangling, self-looping and duplicate relationships", () => {
        const relationships: GraphRelationship[] = [
            {
                source: "file:src/a.ts",
                target: "function:src/a.ts:run",
                type: "CONTAINS"
            },
            {
                source: "file:src/a.ts",
                target: "function:src/a.ts:run",
                type: "CONTAINS"
            },
            {
                source: "file:src/a.ts",
                target: "function:src/a.ts:missing",
                type: "CALLS"
            },
            {
                source: "file:src/a.ts",
                target: "file:src/a.ts",
                type: "CONTAINS"
            }
        ];

        const graph = buildGraph(
            [fileNode, functionNode],
            relationships,
            "demo"
        );

        const fileToFunction = graph.relationships.filter(
            (relationship) =>
                relationship.source === "file:src/a.ts" &&
                relationship.target === "function:src/a.ts:run"
        );

        expect(fileToFunction).toHaveLength(1);

        const dangling = graph.relationships.find(
            (relationship) => relationship.target === "function:src/a.ts:missing"
        );

        expect(dangling).toBeUndefined();

        const selfLoop = graph.relationships.find(
            (relationship) => relationship.source === relationship.target
        );

        expect(selfLoop).toBeUndefined();
    });
});

describe("buildGraph — provenance", () => {

    it("preserves evidence carried on incoming relationships", () => {
        const relationships: GraphRelationship[] = [
            {
                source: "file:src/a.ts",
                target: "function:src/a.ts:run",
                type: "CALLS",
                evidence: {
                    filePath: "src/a.ts",
                    line: 3,
                    resolution: "resolved"
                }
            }
        ];

        const graph = buildGraph(
            [fileNode, functionNode],
            relationships,
            "demo"
        );

        const call = graph.relationships.find(
            (relationship) => relationship.type === "CALLS"
        );

        expect(call?.evidence).toEqual({
            filePath: "src/a.ts",
            line: 3,
            resolution: "resolved"
        });
    });
});
