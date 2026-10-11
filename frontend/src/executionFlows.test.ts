import { describe, it, expect } from "vitest";

import { deriveExecutionFlows } from "./executionFlows";

import type {
    EntityType,
    GraphData,
    GraphNode
} from "./types";

function node(
    id: string,
    type: EntityType,
    name: string
): GraphNode {
    return {
        id,
        type,
        name,
        filePath: `${name}.ts`,
        startLine: 1,
        endLine: 2
    };
}

function graph(
    nodes: GraphNode[],
    relationships: GraphData["relationships"]
): GraphData {
    return { nodes, relationships };
}

describe("deriveExecutionFlows", () => {

    it("follows a CALLS chain from an entry point", () => {
        const data = graph(
            [
                node("function:a.ts:main", "Function", "main"),
                node("function:a.ts:step", "Function", "step"),
                node("function:a.ts:leaf", "Function", "leaf")
            ],
            [
                {
                    source: "function:a.ts:main",
                    target: "function:a.ts:step",
                    type: "CALLS"
                },
                {
                    source: "function:a.ts:step",
                    target: "function:a.ts:leaf",
                    type: "CALLS"
                }
            ]
        );

        const flows = deriveExecutionFlows(data);

        expect(flows).toHaveLength(1);
        expect(flows[0].steps.map((step) => step.name)).toEqual([
            "main",
            "step",
            "leaf"
        ]);
    });

    it("creates a separate flow per branch", () => {
        const data = graph(
            [
                node("function:a.ts:main", "Function", "main"),
                node("function:a.ts:x", "Function", "x"),
                node("function:a.ts:y", "Function", "y")
            ],
            [
                {
                    source: "function:a.ts:main",
                    target: "function:a.ts:x",
                    type: "CALLS"
                },
                {
                    source: "function:a.ts:main",
                    target: "function:a.ts:y",
                    type: "CALLS"
                }
            ]
        );

        expect(deriveExecutionFlows(data)).toHaveLength(2);
    });

    it("terminates on a call cycle", () => {
        const data = graph(
            [
                node("function:a.ts:a", "Function", "a"),
                node("function:a.ts:b", "Function", "b")
            ],
            [
                {
                    source: "function:a.ts:a",
                    target: "function:a.ts:b",
                    type: "CALLS"
                },
                {
                    source: "function:a.ts:b",
                    target: "function:a.ts:a",
                    type: "CALLS"
                }
            ]
        );

        const flows = deriveExecutionFlows(data);

        expect(flows.length).toBeGreaterThan(0);
        for (const flow of flows) {
            expect(flow.steps.length).toBeLessThanOrEqual(3);
        }
    });

    it("returns no flows when nothing is called", () => {
        const data = graph(
            [node("function:a.ts:solo", "Function", "solo")],
            []
        );

        expect(deriveExecutionFlows(data)).toHaveLength(0);
    });
});
