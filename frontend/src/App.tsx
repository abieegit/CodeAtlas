import { useCallback, useMemo, useState } from "react";

import { analyzeArchive, loadGraph } from "./api";
import DetailsPanel from "./components/DetailsPanel";
import ExecutionFlowsView from "./components/ExecutionFlowsView";
import FilterPanel from "./components/FilterPanel";
import GraphView from "./components/GraphView";
import Legend from "./components/Legend";
import UploadPanel from "./components/UploadPanel";
import {
    defaultFilters,
    filterGraph,
    FilterState
} from "./graphFilters";
import type { GraphData, GraphNode } from "./types";

type View = "graph" | "flows";

export default function App() {

    const [graph, setGraph] = useState<GraphData | null>(null);
    const [selected, setSelected] = useState<GraphNode | null>(null);
    const [repository, setRepository] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState<View>("graph");
    const [filters, setFilters] = useState<FilterState>(defaultFilters);

    const handleSelect = useCallback((node: GraphNode | null) => {
        setSelected(node);
    }, []);

    const handleAnalyze = useCallback(async (file: File) => {

        setBusy(true);
        setSelected(null);
        setStatus("Extracting and analyzing repository...");

        try {

            const result = await analyzeArchive(file);

            setGraph(result.graph);
            setRepository(result.repository);
            setFilters(defaultFilters());
            setStatus(
                `${result.repository}: ${result.nodeCount} nodes, ` +
                    `${result.relationshipCount} relationships ` +
                    (result.persisted
                        ? "(stored in Neo4j)"
                        : "(Neo4j unavailable - not persisted)")
            );

        } catch (error) {

            setStatus(`Error: ${(error as Error).message}`);

        } finally {

            setBusy(false);
        }

    }, []);

    const handleLoad = useCallback(async () => {

        setBusy(true);
        setSelected(null);
        setStatus("Loading stored graph...");

        try {

            const stored = await loadGraph(repository || undefined);

            setGraph(stored);
            setFilters(defaultFilters());
            setStatus(
                `Loaded ${stored.nodes.length} nodes from Neo4j` +
                    (repository ? ` (${repository})` : "")
            );

        } catch (error) {

            setStatus(`Error: ${(error as Error).message}`);

        } finally {

            setBusy(false);
        }

    }, [repository]);

    const visibleGraph = useMemo(
        () => (graph ? filterGraph(graph, filters) : null),
        [graph, filters]
    );

    const directories = useMemo(() => {

        if (!graph) {
            return [];
        }

        const set = new Set<string>();

        for (const node of graph.nodes) {
            if (node.type === "Directory" && node.filePath) {
                set.add(node.filePath);
            }
        }

        return [...set].sort();

    }, [graph]);

    return (
        <div className="flex h-full flex-col bg-black text-white">
            <header className="flex items-center justify-between gap-4 border-b border-neutral-800 bg-black px-4 py-3">
                <div>
                    <h1 className="text-lg font-semibold text-white">CodeAtlas</h1>
                    <p className="text-xs text-neutral-500">
                        AST-based interactive knowledge graph (F1)
                    </p>
                </div>

                <nav className="flex overflow-hidden rounded border border-neutral-800">
                    {(["graph", "flows"] as const).map((entry) => (
                        <button
                            key={entry}
                            className={
                                "px-3 py-1 text-xs font-medium " +
                                (view === entry
                                    ? "bg-white text-black"
                                    : "text-neutral-400 hover:text-white")
                            }
                            onClick={() => setView(entry)}
                        >
                            {entry === "graph" ? "Knowledge Graph" : "Execution Flows"}
                        </button>
                    ))}
                </nav>

                <Legend />
            </header>

            <div className="flex min-h-0 flex-1">
                <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-r border-neutral-800 bg-black p-4">
                    <UploadPanel
                        busy={busy}
                        onAnalyze={handleAnalyze}
                        onLoad={handleLoad}
                    />

                    {graph && view === "graph" && (
                        <FilterPanel
                            filters={filters}
                            onChange={setFilters}
                            directories={directories}
                            selectedId={selected?.id ?? null}
                        />
                    )}

                    {repository && (
                        <p className="text-xs text-neutral-500">
                            Repository: {repository}
                        </p>
                    )}

                    <p className="text-xs text-neutral-400">{status}</p>
                </aside>

                <main className="relative min-h-0 flex-1 bg-black">
                    {!graph ? (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                            Upload a repository ZIP to build its knowledge graph.
                        </div>
                    ) : view === "graph" ? (
                        visibleGraph && visibleGraph.nodes.length > 0 ? (
                            <GraphView
                                graph={visibleGraph}
                                selectedId={selected?.id ?? null}
                                onSelect={handleSelect}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                                No nodes match the current filters.
                            </div>
                        )
                    ) : (
                        <ExecutionFlowsView graph={graph} />
                    )}
                </main>

                {graph && view === "graph" && (
                    <aside className="w-80 overflow-y-auto border-l border-neutral-800 bg-black p-4">
                        <DetailsPanel
                            graph={visibleGraph}
                            node={selected}
                            onSelect={handleSelect}
                        />
                    </aside>
                )}
            </div>
        </div>
    );
}
