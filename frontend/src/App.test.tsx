import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { AnalyzeResponse } from "./api";
import type { GraphData } from "./types";

vi.mock("./api", () => ({
    analyzeArchive: vi.fn(),
    loadGraph: vi.fn(),
    listRepositories: vi.fn()
}));

const { analyzeArchive } = vi.mocked(await import("./api"));

function makeGraph(options: { outOfScopeDb?: boolean } = {}): GraphData {
    return {
        nodes: [
            {
                id: "file:src/db/connection.ts",
                type: "File",
                name: "connection.ts",
                filePath: "src/db/connection.ts",
                startLine: 1,
                endLine: 10,
                inDefaultScope: options.outOfScopeDb ? false : true
            },
            {
                id: "file:src/utils/helpers.ts",
                type: "File",
                name: "helpers.ts",
                filePath: "src/utils/helpers.ts",
                startLine: 1,
                endLine: 20,
                inDefaultScope: true
            },
            {
                id: "function:src/db/connection.ts:connect",
                type: "Function",
                name: "connect",
                filePath: "src/db/connection.ts",
                startLine: 2,
                endLine: 8,
                inDefaultScope: options.outOfScopeDb ? false : true
            }
        ],
        relationships: [
            {
                source: "file:src/db/connection.ts",
                target: "function:src/db/connection.ts:connect",
                type: "CONTAINS"
            }
        ]
    };
}

function makeResponse(graph: GraphData): AnalyzeResponse {
    return {
        repository: "demo",
        persisted: true,
        nodeCount: graph.nodes.length,
        relationshipCount: graph.relationships.length,
        graph
    };
}

async function analyze(graph: GraphData) {
    analyzeArchive.mockResolvedValue(makeResponse(graph));

    const { container } = render(<App />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
        target: { files: [new File(["zip"], "demo.zip")] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze repository" }));

    // The status line confirms the analysis finished.
    await screen.findByText(/demo: 3 nodes/);

    return container;
}

afterEach(async () => {
    cleanup();
    vi.clearAllMocks();
    /*
     * The mounted GraphView leaves a final d3-timer wake scheduled by its
     * unmount cleanup; a short real delay lets it fire (jsdom runs real
     * requestAnimationFrame) so later tests in this file tick normally.
     */
    await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("App search integration", () => {

    it("navigates a search result to the details panel", async () => {
        await analyze(makeGraph());

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "connection" } }
        );

        // Both the file and the function inside it match; pick the file.
        const fileResult = screen
            .getAllByRole("button", { name: /connection/ })
            .find((button) => button.textContent?.includes("File"));

        expect(fileResult).toBeDefined();
        fireEvent.click(fileResult!);

        const heading = await screen.findByRole("heading", {
            name: "connection.ts"
        });

        expect(heading).toBeInTheDocument();
        expect(screen.getByText("src/db/connection.ts")).toBeInTheDocument();
    });

    it("reveals an out-of-scope search result on demand", async () => {
        await analyze(makeGraph({ outOfScopeDb: true }));

        fireEvent.change(
            screen.getByLabelText("Search graph nodes"),
            { target: { value: "connection" } }
        );

        const hiddenNotes = screen.getAllByText(/Hidden:/);
        expect(hiddenNotes.length).toBeGreaterThan(0);
        expect(hiddenNotes[0]).toHaveTextContent(
            "outside the Application scope"
        );

        fireEvent.click(
            screen.getAllByRole("button", { name: /Reveal & select/i })[0]
        );

        expect(
            await screen.findByRole("heading", { name: "connection.ts" })
        ).toBeInTheDocument();
    });
});
