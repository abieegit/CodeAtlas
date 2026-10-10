import { useCallback, useState } from "react";

import { analyzeArchive, loadGraph } from "./api";
import DetailsPanel from "./components/DetailsPanel";
import GraphView from "./components/GraphView";
import Legend from "./components/Legend";
import UploadPanel from "./components/UploadPanel";
import type { GraphData, GraphNode } from "./types";

export default function App() {

    const [graph, setGraph] = useState<GraphData | null>(null);
    const [selected, setSelected] = useState<GraphNode | null>(null);
    const [repository, setRepository] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);

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

            const stored = await loadGraph();

            setGraph(stored);
            setStatus(`Loaded ${stored.nodes.length} nodes from Neo4j`);

        } catch (error) {

            setStatus(`Error: ${(error as Error).message}`);

        } finally {

            setBusy(false);
        }

    }, []);

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                <div>
                    <h1 className="text-lg font-semibold">CodeAtlas</h1>
                    <p className="text-xs text-slate-500">
                        AST-based interactive knowledge graph (F1)
                    </p>
                </div>
                <Legend />
            </header>

            <div className="flex min-h-0 flex-1">
                <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-4">
                    <UploadPanel
                        busy={busy}
                        onAnalyze={handleAnalyze}
                        onLoad={handleLoad}
                    />

                    {repository && (
                        <p className="text-xs text-slate-500">
                            Repository: {repository}
                        </p>
                    )}

                    <p className="text-xs text-slate-600">{status}</p>
                </aside>

                <main className="relative min-h-0 flex-1">
                    {graph ? (
                        <GraphView
                            graph={graph}
                            selectedId={selected?.id ?? null}
                            onSelect={handleSelect}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-400">
                            Upload a repository ZIP to build its
                            knowledge graph.
                        </div>
                    )}
                </main>

                <aside className="w-80 overflow-y-auto border-l border-slate-200 bg-white p-4">
                    <DetailsPanel
                        graph={graph}
                        node={selected}
                        onSelect={handleSelect}
                    />
                </aside>
            </div>
        </div>
    );
}
