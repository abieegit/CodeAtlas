import { describe, expect, it } from "vitest";

import {
    allNodesExist,
    boundsOf,
    computeFitTransform,
    recordPositions,
    seedPositions
} from "./graphLayout";

import type { GraphData } from "./types";

describe("recordPositions / seedPositions", () => {

    it("records only nodes that have coordinates", () => {
        const map = new Map();

        recordPositions(
            [
                { id: "a", x: 10, y: 20 },
                { id: "b" }
            ],
            map
        );

        expect(map.size).toBe(1);
        expect(map.get("a")).toEqual({ x: 10, y: 20 });
    });

    it("replaces previous content", () => {
        const map = new Map();
        map.set("old", { x: 1, y: 1 });

        recordPositions([{ id: "a", x: 5, y: 6 }], map);

        expect(map.size).toBe(1);
        expect(map.has("old")).toBe(false);
    });

    it("seeds matching nodes and reports how many", () => {
        const map = new Map([
            ["a", { x: 10, y: 20 }]
        ]);

        const nodes: Array<{ id: string; x?: number; y?: number }> = [
            { id: "a" },
            { id: "b" }
        ];

        const seeded = seedPositions(nodes, map);

        expect(seeded).toBe(1);
        expect(nodes[0]).toEqual({ id: "a", x: 10, y: 20 });
        expect(nodes[1]).toEqual({ id: "b" });
    });
});

describe("computeFitTransform", () => {

    it("fits a small graph by scaling up to the cap", () => {
        const fit = computeFitTransform(
            { minX: 0, minY: 0, maxX: 100, maxY: 100 },
            900,
            640
        );

        // 0.9 * min(900/220, 640/220) is above the 1.5 cap.
        expect(fit.k).toBe(1.5);
    });

    it("centres the graph", () => {
        const fit = computeFitTransform(
            { minX: -100, minY: -50, maxX: 100, maxY: 50 },
            900,
            640
        );

        expect(fit.x).toBeCloseTo(900 / 2, 5);
        expect(fit.y).toBeCloseTo(640 / 2, 5);
    });

    it("scales down for a graph wider than the viewport", () => {
        const fit = computeFitTransform(
            { minX: 0, minY: 0, maxX: 2000, maxY: 200 },
            900,
            640
        );

        const expected = 0.9 * Math.min(
            900 / (2000 + 120),
            640 / (200 + 120)
        );

        expect(fit.k).toBeCloseTo(expected, 10);
    });
});

describe("boundsOf", () => {

    it("returns null for no nodes", () => {
        expect(boundsOf([])).toBeNull();
    });

    it("treats missing coordinates as the origin", () => {
        expect(boundsOf([{ x: -5, y: 7 }, { y: 3 }])).toEqual({
            minX: -5,
            minY: 3,
            maxX: 0,
            maxY: 7
        });
    });
});

describe("allNodesExist", () => {

    const graph: GraphData = {
        nodes: [
            { id: "a", type: "File", name: "a", filePath: "a.ts", startLine: 1, endLine: 2 },
            { id: "b", type: "File", name: "b", filePath: "b.ts", startLine: 1, endLine: 2 }
        ],
        relationships: []
    };

    it("is true when every id is present", () => {
        expect(allNodesExist(graph, ["a", "b"])).toBe(true);
    });

    it("is false when an id is missing", () => {
        expect(allNodesExist(graph, ["a", "zzz"])).toBe(false);
    });
});
