import { describe, it, expect, vi } from "vitest";

import { render, screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import DetailsPanel from "./DetailsPanel";

import type { GraphData, GraphNode } from "../types";

const graph: GraphData = {
    nodes: [
        {
            id: "file:src/app.ts",
            type: "File",
            name: "app.ts",
            filePath: "src/app.ts",
            startLine: 1,
            endLine: 9,
            category: "source",
            inDefaultScope: true
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
            type: "CONTAINS",
            evidence: {
                filePath: "src/app.ts",
                line: 2,
                resolution: "derived"
            }
        }
    ]
};

const node: GraphNode = graph.nodes[1];

describe("DetailsPanel", () => {

    it("shows node details and relationship evidence", () => {
        render(<DetailsPanel graph={graph} node={node} onSelect={() => {}} />);

        expect(screen.getByText("run")).toBeInTheDocument();
        expect(screen.getByText("Function")).toBeInTheDocument();
        expect(screen.getByText(/derived/)).toBeInTheDocument();
    });

    it("selects the related node when a relationship is clicked", async () => {
        const onSelect = vi.fn();
        render(<DetailsPanel graph={graph} node={node} onSelect={onSelect} />);

        await userEvent.click(
            screen.getByRole("button", { name: /app\.ts/ })
        );

        expect(onSelect).toHaveBeenCalledWith(graph.nodes[0]);
    });
});
