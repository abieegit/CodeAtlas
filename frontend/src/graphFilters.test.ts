import { describe, it, expect } from "vitest";

import { defaultFilters, filterGraph } from "./graphFilters";

import type { EntityType, GraphData } from "./types";

const graph: GraphData = {
    nodes: [
        {
            id: "repository:demo",
            type: "Repository",
            name: "demo",
            filePath: "",
            startLine: 0,
            endLine: 0,
            inDefaultScope: true
        },
        {
            id: "file:src/app.ts",
            type: "File",
            name: "app.ts",
            filePath: "src/app.ts",
            startLine: 1,
            endLine: 5,
            category: "source",
            inDefaultScope: true
        },
        {
            id: "file:src/app.test.ts",
            type: "File",
            name: "app.test.ts",
            filePath: "src/app.test.ts",
            startLine: 1,
            endLine: 5,
            category: "test",
            inDefaultScope: false
        },
        {
            id: "function:src/app.ts:run",
            type: "Function",
            name: "run",
            filePath: "src/app.ts",
            startLine: 2,
            endLine: 4,
            inDefaultScope: true
        }
    ],
    relationships: [
        {
            source: "file:src/app.ts",
            target: "function:src/app.ts:run",
            type: "CONTAINS"
        },
        {
            source: "file:src/app.ts",
            target: "file:src/app.test.ts",
            type: "IMPORTS"
        }
    ]
};

describe("filterGraph", () => {

    it("application scope hides out-of-scope nodes and their edges", () => {
        const result = filterGraph(graph, defaultFilters());
        const ids = result.nodes.map((node) => node.id);

        expect(ids).not.toContain("file:src/app.test.ts");
        expect(
            result.relationships.some(
                (relationship) => relationship.target === "file:src/app.test.ts"
            )
        ).toBe(false);
    });

    it("full scope shows every node", () => {
        const result = filterGraph(graph, {
            ...defaultFilters(),
            scope: "full"
        });

        expect(result.nodes).toHaveLength(graph.nodes.length);
    });

    it("node-type filter removes matching nodes and dangling edges", () => {
        const result = filterGraph(graph, {
            ...defaultFilters(),
            nodeTypes: ["File"] as EntityType[]
        });

        expect(result.nodes.every((node) => node.type === "File")).toBe(true);
        expect(result.relationships).toHaveLength(0);
    });

    it("relationship-type filter keeps only selected edge types", () => {
        const result = filterGraph(graph, {
            ...defaultFilters(),
            scope: "full",
            relationshipTypes: ["IMPORTS"]
        });

        expect(
            result.relationships.every(
                (relationship) => relationship.type === "IMPORTS"
            )
        ).toBe(true);
    });

    it("focus keeps the selected node and its direct neighbours", () => {
        const result = filterGraph(graph, {
            ...defaultFilters(),
            scope: "full",
            focusNodeId: "file:src/app.ts"
        });

        const ids = result.nodes.map((node) => node.id).sort();

        expect(ids).toEqual([
            "file:src/app.test.ts",
            "file:src/app.ts",
            "function:src/app.ts:run"
        ]);
    });

    it("directory filter keeps only nodes under that directory", () => {
        const result = filterGraph(graph, {
            ...defaultFilters(),
            scope: "full",
            directory: "src"
        });

        expect(
            result.nodes.every(
                (node) =>
                    node.filePath === "src" ||
                    node.filePath.startsWith("src/")
            )
        ).toBe(true);
    });

    it("filters a large graph correctly", () => {
        const big: GraphData = { nodes: [], relationships: [] };

        for (let index = 0; index < 5000; index++) {
            big.nodes.push({
                id: `function:src/f${index}.ts:f${index}`,
                type: "Function",
                name: `f${index}`,
                filePath: `src/f${index}.ts`,
                startLine: 1,
                endLine: 2,
                inDefaultScope: index % 2 === 0
            });
        }

        const result = filterGraph(big, defaultFilters());

        expect(result.nodes).toHaveLength(2500);
    });
});
