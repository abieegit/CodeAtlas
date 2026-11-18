import { useCallback, useMemo, useRef, useState } from "react";

import { analyzeArchive, loadGraph } from "./api";
import AnalysisReportView from "./components/AnalysisReportView";
import DetailsPanel from "./components/DetailsPanel";
import FilterPanel from "./components/FilterPanel";
import GraphView, { type GraphViewHandle } from "./components/GraphView";
import Legend from "./components/Legend";
import SearchPanel from "./components/SearchPanel";
import UploadPanel from "./components/UploadPanel";
import CoremationView from "./components/CoremationView";
import {
    defaultFilters,
    filterGraph,
    FilterState
} from "./graphFilters";
import type { GraphData, GraphNode } from "./types";
import { useAuth } from "./auth/AuthContext";

type View = "graph" | "report" | "coremation";

const VIEWS: Array<{ id: View; label: string }> = [
    { id: "graph", label: "Knowledge Graph" },
    { id: "report", label: "Analysis Report" },
    { id: "coremation", label: "Coremation" }
];

export default function App() {

    const [graph, setGraph] = useState<GraphData | null>(null);
    const [selected, setSelected] = useState<GraphNode | null>(null);
    const [repository, setRepository] = useState("");
    const [repositoryId, setRepositoryId] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState<View>("graph");
    const [filters, setFilters] = useState<FilterState>(defaultFilters);
    const [showIcons, setShowIcons] = useState(false);
    const graphViewRef = useRef<GraphViewHandle | null>(null);

    const { user, signOut } = useAuth();

    /*
     * Build 06: the repository id is the stable handle every backend call
     * uses; the name is only for display. Falls back to the name when an
     * older response omits the id.
     */
    const repositoryKey = repositoryId || repository;

    const handleSelect = useCallback((node: GraphNode | null) => {
        setSelected(node);
    }, []);

    const handleSearchSelect = useCallback((node: GraphNode) => {
        setSelected(node);
        graphViewRef.current?.revealNode(node.id);
    }, []);

    const handleSearchReveal = useCallback(
        (nextFilters: FilterState, node: GraphNode) => {
            setFilters(nextFilters);
            setSelected(node);
            graphViewRef.current?.revealNode(node.id);
        },
        []
    );

    const handleAnalyze = useCallback(async (file: File) => {

        setBusy(true);
        setSelected(null);
        setStatus("Extracting and analyzing repository...");

        try {

            const result = await analyzeArchive(file);

            setGraph(result.graph);
            setRepository(result.repository);
            setRepositoryId(result.repositoryId ?? result.repository);
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

            const stored = await loadGraph(repositoryKey || undefined);

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

    }, [repositoryKey, repository]);

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
                    
                </div>

                <nav className="flex overflow-hidden rounded border border-neutral-800">
                    {VIEWS.map((entry) => (
                        <button
                            key={entry.id}
                            className={
                                "px-3 py-1 text-xs font-medium " +
                                (view === entry.id
                                    ? "bg-white text-black"
                                    : "text-neutral-400 hover:text-white")
                            }
                            onClick={() => setView(entry.id)}
                        >
                            {entry.label}
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    {user?.email && (
                        <span className="hidden max-w-[16rem] truncate text-xs text-neutral-500 sm:inline">
                            {user.email}
                        </span>
                    )}

                    <button
                        className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-white hover:text-white"
                        onClick={() => void signOut()}
                    >
                        Sign out
                    </button>

                    <Legend />
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-r border-neutral-800 bg-black p-4">
                    <UploadPanel
                        busy={busy}
                        onAnalyze={handleAnalyze}
                        onLoad={handleLoad}
                    />

                    {graph && view === "graph" && (
                        <>
                            <SearchPanel
                                graph={graph}
                                filters={filters}
                                onSelectResult={handleSearchSelect}
                                onRevealResult={handleSearchReveal}
                            />

                            <div className="flex items-center gap-2">
                                <button
                                    className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-white hover:text-white"
                                    onClick={() =>
                                        graphViewRef.current?.fitToView()
                                    }
                                >
                                    Fit graph
                                </button>

                                <button
                                    aria-pressed={showIcons}
                                    title="Experimental overlay: heuristic architectural icons"
                                    className={
                                        "rounded border px-2 py-1 text-xs " +
                                        (showIcons
                                            ? "border-white text-white"
                                            : "border-neutral-800 text-neutral-300 hover:border-white hover:text-white")
                                    }
                                    onClick={() => setShowIcons((value) => !value)}
                                >
                                    Icons: {showIcons ? "On" : "Off"}
                                </button>
                            </div>

                            {showIcons && (
                                <p
                                    role="note"
                                    className="rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[10px] leading-snug text-red-400"
                                >
                                    Experimental: icons are heuristic guesses
                                    from names and paths — they may be wrong,
                                    and extra graphics can affect
                                    readability. Visualisation only: your ZIP
                                    and source files are never modified.
                                </p>
                            )}

                            <FilterPanel
                                filters={filters}
                                onChange={setFilters}
                                directories={directories}
                                selectedId={selected?.id ?? null}
                            />
                        </>
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
                    ) : (
                        <>
                            {/*
                             * The graph stays mounted when another tab is
                             * shown so zoom, pan and node positions survive
                             * tab switches.
                             */}
                            <div
                                className={
                                    "absolute inset-0 " +
                                    (view === "graph" ? "" : "hidden")
                                }
                            >
                                {visibleGraph &&
                                visibleGraph.nodes.length > 0 ? (
                                    <GraphView
                                        ref={graphViewRef}
                                        graph={visibleGraph}
                                        selectedId={selected?.id ?? null}
                                        onSelect={handleSelect}
                                        layoutKey={repositoryKey || "all"}
                                        showIcons={showIcons}
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                                        No nodes match the current filters.
                                    </div>
                                )}
                            </div>

                            {view === "report" &&
                                (repository !== "" ? (
                                    <AnalysisReportView
                                        repository={repositoryKey}
                                        repositoryName={repository}
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                                        Analyze a repository first — the
                                        report is generated per stored
                                        repository.
                                    </div>
                                ))}

                            {view === "coremation" &&
                                (repository !== "" ? (
                                    <CoremationView repository={repositoryKey} />
                                ) : (
                                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                                        Analyze a repository first — workflows
                                        are reconstructed per stored repository.
                                    </div>
                                ))}
                        </>
                    )}
                </main>

                {graph && view === "graph" && (
                    <aside className="w-80 overflow-y-auto border-l border-neutral-800 bg-black p-4">
                        <DetailsPanel
                            graph={visibleGraph}
                            node={selected}
                            onSelect={handleSelect}
                            repository={repositoryKey || undefined}
                        />
                    </aside>
                )}
            </div>
        </div>
    );
}
