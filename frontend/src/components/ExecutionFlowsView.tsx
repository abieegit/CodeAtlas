import { useEffect, useMemo, useState } from "react";

import { deriveExecutionFlows } from "../executionFlows";

import type { GraphData } from "../types";

interface Props {
    graph: GraphData;
}

export default function ExecutionFlowsView({ graph }: Props) {

    const flows = useMemo(
        () => deriveExecutionFlows(graph),
        [graph]
    );

    const [selected, setSelected] = useState(0);
    const [playing, setPlaying] = useState(true);

    useEffect(() => {
        setSelected(0);
    }, [graph]);

    if (flows.length === 0) {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                No call-based execution flows were found in this repository.
            </div>
        );
    }

    const index = Math.min(selected, flows.length - 1);
    const flow = flows[index];

    return (
        <div className="flex h-full min-h-0">

            <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Detected flows ({flows.length})
                </h2>
                <ul className="space-y-1">
                    {flows.map((entry, position) => (
                        <li key={entry.id}>
                            <button
                                className={
                                    "w-full rounded px-2 py-1 text-left " +
                                    (position === index
                                        ? "bg-white/10 text-white"
                                        : "text-neutral-400 hover:bg-white/5 hover:text-white")
                                }
                                onClick={() => setSelected(position)}
                            >
                                <span className="block truncate text-sm">
                                    {entry.entryName}
                                </span>
                                <span className="text-[10px] text-neutral-500">
                                    {entry.steps.length} steps
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>

            <section className="relative min-h-0 flex-1 overflow-auto p-6">
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-white">
                        {flow.entryName}
                    </h2>
                    <span className="text-xs text-neutral-500">
                        {flow.steps.length} steps &middot; execution flow
                    </span>
                    <button
                        className="ml-auto rounded border border-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:border-white hover:text-white"
                        onClick={() => setPlaying((value) => !value)}
                    >
                        {playing ? "Pause" : "Play"}
                    </button>
                </div>

                <ol
                    className={
                        "flex flex-wrap items-center gap-2 " +
                        (playing ? "" : "flow-paused")
                    }
                >
                    {flow.steps.map((step, position) => (
                        <li
                            key={`${step.id}-${position}`}
                            className="flex items-center gap-2"
                        >
                            {position > 0 && (
                                <span
                                    className="flow-connector"
                                    aria-hidden="true"
                                />
                            )}

                            <div
                                className="flow-step rounded border border-neutral-800 bg-neutral-950 px-3 py-2"
                                style={{
                                    animationDelay: `${position * 0.4}s`
                                }}
                            >
                                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                                    {step.type}
                                </div>
                                <div className="text-xs font-medium text-white">
                                    {step.name}
                                </div>
                                <div className="max-w-[180px] truncate text-[10px] text-neutral-500">
                                    {step.filePath}
                                    {step.line !== undefined
                                        ? `:${step.line}`
                                        : ""}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>

                <p className="mt-6 text-[11px] text-neutral-600">
                    Each step is a function or method; connectors follow CALLS
                    edges (resolved by the TypeScript symbol resolver).
                </p>
            </section>
        </div>
    );
}
