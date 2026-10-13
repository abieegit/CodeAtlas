import { describe, expect, it } from "vitest";

import { searchGraph } from "./search";

import type { GraphData, GraphNode } from "./types";

function node(
    id: string,
    type: GraphNode["type"],
    name: string,
    filePath: string
): GraphNode {
    return { id, type, name, filePath, startLine: 1, endLine: 2 };
}

const graph: GraphData = {
    nodes: [
        node("repository:demo", "Repository", "demo", ""),
        node("directory:src/services", "Directory", "services", "src/services"),
        node("file:src/userService.ts", "File", "userService.ts", "src/userService.ts"),
        node("class:src/userService.ts:UserService", "Class", "UserService", "src/userService.ts"),
        node("function:src/userService.ts:getUser", "Function", "getUser", "src/userService.ts"),
        node("method:src/userService.ts:UserService:load", "Method", "load", "src/userService.ts"),
        node("function:src/other.ts:SERVE", "Function", "SERVE", "src/other.ts"),
        // Variables are not searchable.
        node("variable:src/other.ts:x", "Variable", "x", "src/other.ts")
    ],
    relationships: []
};

describe("searchGraph", () => {

    it("finds each supported entity type by name", () => {
        const cases: Array<[string, string]> = [
            ["demo", "repository:demo"],
            ["services", "directory:src/services"],
            ["userService.ts", "file:src/userService.ts"],
            ["UserService", "class:src/userService.ts:UserService"],
            ["getUser", "function:src/userService.ts:getUser"],
            ["load", "method:src/userService.ts:UserService:load"]
        ];

        for (const [query, expectedId] of cases) {
            const ids = searchGraph(graph, query).map((entry) => entry.id);
            expect(ids).toContain(expectedId);
        }
    });

    it("matches case-insensitively and partially", () => {
        const ids = searchGraph(graph, "SERV").map((entry) => entry.id);

        expect(ids).toContain("file:src/userService.ts");
        expect(ids).toContain("class:src/userService.ts:UserService");
        expect(ids).toContain("directory:src/services");
    });

    it("matches by file path when the name does not match", () => {
        const ids = searchGraph(graph, "other.ts").map((entry) => entry.id);

        expect(ids).toEqual(["function:src/other.ts:SERVE"]);
    });

    it("ranks name prefixes above contains above path-only", () => {
        const ranked = searchGraph(graph, "user").map((entry) => entry.id);

        expect(ranked.indexOf("class:src/userService.ts:UserService")).toBeLessThan(
            ranked.indexOf("file:src/userService.ts")
        );
    });

    it("limits the number of results", () => {
        const big: GraphData = { nodes: [], relationships: [] };

        for (let index = 0; index < 30; index += 1) {
            big.nodes.push(
                node(
                    `function:src/f${index}.ts:f${index}`,
                    "Function",
                    `f${index}`,
                    `src/f${index}.ts`
                )
            );
        }

        expect(searchGraph(big, "f")).toHaveLength(20);
        expect(searchGraph(big, "f", { limit: 5 })).toHaveLength(5);
    });

    it("returns nothing for empty, whitespace or unmatched queries", () => {
        expect(searchGraph(graph, "")).toEqual([]);
        expect(searchGraph(graph, "   ")).toEqual([]);
        expect(searchGraph(graph, "not-in-the-graph")).toEqual([]);
    });

    it("never returns Variables or mutates the graph", () => {
        const before = JSON.stringify(graph);

        const results = searchGraph(graph, "x");

        expect(results.map((entry) => entry.type)).not.toContain("Variable");
        expect(JSON.stringify(graph)).toBe(before);
    });
});
