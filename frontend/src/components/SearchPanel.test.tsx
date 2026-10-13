import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SearchPanel from "./SearchPanel";

import { defaultFilters } from "../graphFilters";
import type { FilterState } from "../graphFilters";
import type { GraphData, GraphNode } from "../types";

function node(
    id: string,
    type: GraphNode["type"],
    name: string,
    filePath: string,
    inDefaultScope = true
): GraphNode {
    return {
        id,
        type,
        name,
        filePath,
        startLine: 1,
        endLine: 2,
        inDefaultScope
    };
}

const graph: GraphData = {
    nodes: [
        node("file:src/app.ts", "File", "app.ts", "src/app.ts"),
        node("file:src/legacy.test.ts", "File", "legacy.test.ts", "src/legacy.test.ts", false),
        node("function:src/app.ts:run", "Function", "run", "src/app.ts")
    ],
    relationships: []
};

const filters: FilterState = defaultFilters();

function renderPanel(overrides: Partial<Parameters<typeof SearchPanel>[0]> = {}) {
    const onSelectResult = vi.fn();
    const onRevealResult = vi.fn();

    const view = render(
        <SearchPanel
            graph={graph}
            filters={filters}
            onSelectResult={onSelectResult}
            onRevealResult={onRevealResult}
            {...overrides}
        />
    );

    return { onSelectResult, onRevealResult, ...view };
}

describe("SearchPanel", () => {

    it("shows matching nodes with name, type and file path", () => {
        renderPanel();

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "app" } }
        );

        const item = screen.getByText("app.ts").closest("li");

        expect(item).not.toBeNull();
        expect(item!.textContent).toContain("File");
        expect(item!.textContent).toContain("src/app.ts");
    });

    it("selecting a visible result calls onSelectResult with the node", () => {
        const { onSelectResult } = renderPanel();

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "run" } }
        );
        fireEvent.click(screen.getByText("run"));

        expect(onSelectResult).toHaveBeenCalledTimes(1);
        expect(onSelectResult.mock.calls[0][0].id).toBe("function:src/app.ts:run");
    });

    it("explains hidden results and reveals them on demand", () => {
        const { onRevealResult } = renderPanel();

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "legacy" } }
        );

        // The test file is outside the Application scope.
        expect(screen.getByText(/Hidden:/)).toHaveTextContent(
            "outside the Application scope"
        );

        fireEvent.click(screen.getByRole("button", { name: /Reveal & select/i }));

        expect(onRevealResult).toHaveBeenCalledTimes(1);
        const [nextFilters, revealedNode] = onRevealResult.mock.calls[0];
        expect(nextFilters.scope).toBe("full");
        expect(revealedNode.id).toBe("file:src/legacy.test.ts");
    });

    it("shows a no-results state", () => {
        renderPanel();

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "nothing-matches" } }
        );

        expect(screen.getByRole("status")).toHaveTextContent(
            /No nodes match/i
        );
    });

    it("clearing the search empties the results", () => {
        renderPanel();

        const input = screen.getByLabelText("Search graph nodes");

        fireEvent.change(input, { target: { value: "app" } });
        // "app" matches app.ts by name and run by file path.
        expect(screen.getAllByRole("listitem")).toHaveLength(2);

        fireEvent.click(screen.getByLabelText("Clear search"));

        expect(input).toHaveValue("");
        expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });
});
