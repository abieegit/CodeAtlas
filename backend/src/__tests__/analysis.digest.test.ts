import { describe, it, expect } from "vitest";

import { buildRepoDigest } from "../services/analysis/repo-digest";

import type { GraphData } from "../models/graph.types";

const graph: GraphData = {
    nodes: [
        { id: "repository:demo", type: "Repository", name: "demo", filePath: "", startLine: 0, endLine: 0 },
        { id: "file:src/a.ts", type: "File", name: "a.ts", filePath: "src/a.ts", startLine: 1, endLine: 40, category: "source" },
        { id: "file:src/b.ts", type: "File", name: "b.ts", filePath: "src/b.ts", startLine: 1, endLine: 20, category: "test" },
        { id: "file:src/c.ts", type: "File", name: "c.ts", filePath: "src/c.ts", startLine: 1, endLine: 10, category: "source" },
        { id: "function:src/a.ts:helper", type: "Function", name: "helper", filePath: "src/a.ts", startLine: 2, endLine: 8 },
        { id: "function:src/b.ts:run", type: "Function", name: "run", filePath: "src/b.ts", startLine: 2, endLine: 9 },
        { id: "class:src/a.ts:Thing", type: "Class", name: "Thing", filePath: "src/a.ts", startLine: 10, endLine: 30 }
    ],
    relationships: [
        { source: "repository:demo", target: "file:src/a.ts", type: "CONTAINS" },
        { source: "file:src/a.ts", target: "file:src/b.ts", type: "IMPORTS" },
        { source: "file:src/b.ts", target: "file:src/a.ts", type: "IMPORTS" },
        { source: "file:src/c.ts", target: "file:src/a.ts", type: "IMPORTS" },
        { source: "function:src/b.ts:run", target: "function:src/a.ts:helper", type: "CALLS" },
        { source: "function:src/b.ts:run", target: "function:src/a.ts:helper", type: "CALLS" }
    ]
};

describe("buildRepoDigest", () => {

    const digest = buildRepoDigest("demo", graph);

    it("counts nodes, files and categories", () => {
        expect(digest.repository).toBe("demo");
        expect(digest.nodeCounts.File).toBe(3);
        expect(digest.nodeCounts.Function).toBe(2);
        expect(digest.functionCount).toBe(2);
        expect(digest.classCount).toBe(1);
        expect(digest.fileCount).toBe(3);
        expect(digest.filesByCategory).toEqual({ source: 2, test: 1 });
    });

    it("counts relationships by type", () => {
        expect(digest.relationshipCounts).toEqual({
            CONTAINS: 1,
            IMPORTS: 3,
            CALLS: 2
        });
    });

    it("ranks fan-in from imports and calls", () => {
        // a.ts is imported by b.ts and c.ts.
        expect(digest.topFanIn[0]).toEqual({
            name: "a.ts",
            filePath: "src/a.ts",
            inbound: 2
        });
    });

    it("ranks fan-out", () => {
        // The run function makes two CALLS edges to helper.
        expect(digest.topFanOut[0]?.name).toBe("run");
        expect(digest.topFanOut[0]?.outbound).toBe(2);
    });

    it("counts import cycles once for a two-file cycle", () => {
        expect(digest.importCycleCount).toBe(1);
    });

    it("summarises the busiest directories", () => {
        expect(digest.busiestDirectories[0]).toEqual({
            directory: "src",
            files: 3
        });
    });
});
