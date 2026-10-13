import { useMemo, useState } from "react";

import {
    hiddenReasons,
    isNodeVisible,
    revealNodeInFilters,
    type FilterState,
    type HiddenReason
} from "../graphFilters";
import { SEARCHABLE_TYPES, searchGraph } from "../search";
import type { GraphData, GraphNode } from "../types";

interface Props {
    /** The full loaded graph (search is not limited by the view filters). */
    graph: GraphData;
    filters: FilterState;
    onSelectResult: (node: GraphNode) => void;
    onRevealResult: (nextFilters: FilterState, node: GraphNode) => void;
}

const REASON_TEXT: Record<HiddenReason, string> = {
    "node-type": "its node type is filtered out",
    scope: "it is outside the Application scope",
    directory: "a directory filter excludes it",
    focus: "a focus filter excludes it"
};

export default function SearchPanel({
    graph,
    filters,
    onSelectResult,
    onRevealResult
}: Props) {

    const [query, setQuery] = useState("");

    const results = useMemo(
        () => searchGraph(graph, query),
        [graph, query]
    );

    const visibility = useMemo(() => {

        const map = new Map<string, boolean>();

        for (const node of results) {
            map.set(node.id, isNodeVisible(graph, filters, node.id));
        }

        return map;

    }, [graph, filters, results]);

    const trimmed = query.trim();

    return (
        <div className="flex flex-col gap-2 text-xs">

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={query}
                    placeholder={`Search ${SEARCHABLE_TYPES.length} node types…`}
                    aria-label="Search graph nodes"
                    className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
                    onChange={(event) => setQuery(event.target.value)}
                />
                <button
                    className="rounded border border-neutral-800 px-2 py-1 text-neutral-400 hover:border-white hover:text-white disabled:opacity-40"
                    aria-label="Clear search"
                    disabled={query === ""}
                    onClick={() => setQuery("")}
                >
                    &times;
                </button>
            </div>

            {trimmed !== "" && results.length === 0 && (
                <p className="text-neutral-500" role="status">
                    No nodes match &ldquo;{trimmed}&rdquo;.
                </p>
            )}

            {results.length > 0 && (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {results.map((node) => {

                        const visible = visibility.get(node.id) ?? false;
                        const reasons = visible
                            ? []
                            : hiddenReasons(graph, filters, node);

                        return (
                            <li
                                key={node.id}
                                className="rounded border border-neutral-900 px-2 py-1"
                            >
                                {visible ? (
                                    <button
                                        className="w-full text-left hover:text-white"
                                        onClick={() => {
                                            setQuery("");
                                            onSelectResult(node);
                                        }}
                                    >
                                        <span className="mr-1 rounded bg-neutral-950 px-1 text-[10px] font-medium text-neutral-300">
                                            {node.type}
                                        </span>
                                        <span className="text-neutral-200">
                                            {node.name}
                                        </span>
                                        <span className="block truncate text-[10px] text-neutral-600">
                                            {node.filePath || "-"}
                                        </span>
                                    </button>
                                ) : (
                                    <div>
                                        <span className="mr-1 rounded bg-neutral-950 px-1 text-[10px] font-medium text-neutral-500">
                                            {node.type}
                                        </span>
                                        <span className="text-neutral-500">
                                            {node.name}
                                        </span>
                                        <span className="block text-[10px] text-neutral-600">
                                            Hidden:{" "}
                                            {reasons
                                                .map(
                                                    (reason) =>
                                                        REASON_TEXT[reason]
                                                )
                                                .join(", ") || "by the current filters"}
                                            .
                                        </span>
                                        <button
                                            className="mt-1 rounded border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-white hover:text-white"
                                            onClick={() => {
                                                setQuery("");
                                                onRevealResult(
                                                    revealNodeInFilters(
                                                        graph,
                                                        filters,
                                                        node
                                                    ),
                                                    node
                                                );
                                            }}
                                        >
                                            Reveal &amp; select
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
