import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    fetchWorkflow,
    fetchWorkflows,
    refineWorkflow
} from "../api";
import {
    advance,
    canvasSize,
    describeWorkflowTextually,
    edgeIsUncertain,
    edgePath,
    initialPlayback,
    layoutWorkflow,
    markerPosition,
    pathStepKeys,
    preferredPath,
    presentStep,
    SPEEDS,
    prefersReducedMotion,
    type PlaybackState
} from "../coremation";
import type {
    Workflow,
    WorkflowListResponse,
    WorkflowPath
} from "../workflow";

type Status = "loading" | "ready" | "empty" | "error";

const buttonClass =
    "rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300 " +
    "hover:border-white hover:text-white disabled:opacity-40";

const activeButtonClass =
    "rounded border border-white bg-white px-2 py-1 text-xs font-medium text-black";

/**
 * Coremation — animated, evidence-backed workflow view.
 *
 * The workflow itself is reconstructed by the backend from static analysis;
 * this component renders it and animates a simulated traversal of the
 * selected candidate path. Animation never calls the backend or the model.
 */
export default function CoremationView({ repository }: { repository: string }) {

    const [list, setList] = useState<WorkflowListResponse | null>(null);
    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [workflowId, setWorkflowId] = useState("");
    const [pathId, setPathId] = useState("");
    const [selectedKey, setSelectedKey] = useState("");
    const [playback, setPlayback] = useState<PlaybackState>(initialPlayback(""));
    const [status, setStatus] = useState<Status>("loading");
    const [message, setMessage] = useState("");
    const [refining, setRefining] = useState(false);

    const frameRef = useRef<number | null>(null);
    const lastTickRef = useRef(0);

    const reducedMotion = useMemo(
        () =>
            prefersReducedMotion(
                typeof window !== "undefined" ? window.matchMedia : undefined
            ),
        []
    );

    /* ---------------- load the candidate list ---------------- */

    const loadList = useCallback(async () => {

        setStatus("loading");
        setMessage("");

        try {

            const response = await fetchWorkflows(repository);

            setList(response);

            if (response.count === 0) {
                setWorkflow(null);
                setStatus("empty");
                return;
            }

            setWorkflowId(response.workflows[0].id);

        } catch (error) {
            setStatus("error");
            setMessage((error as Error).message);
        }

    }, [repository]);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    /* ---------------- load one workflow ---------------- */

    useEffect(() => {

        if (workflowId === "") {
            return;
        }

        let cancelled = false;

        setStatus("loading");
        setMessage("");

        fetchWorkflow(repository, workflowId)
            .then((loaded) => {

                if (cancelled) {
                    return;
                }

                setWorkflow(loaded);

                const path = preferredPath(loaded);

                setPathId(path?.id ?? "");
                setPlayback(initialPlayback(path?.id ?? "", 1));
                setSelectedKey(path?.stepKeys[0] ?? loaded.entryKey);
                setStatus("ready");
            })
            .catch((error) => {

                if (cancelled) {
                    return;
                }

                setStatus("error");
                setMessage((error as Error).message);
            });

        return () => {
            cancelled = true;
        };

    }, [repository, workflowId]);

    const currentPath: WorkflowPath | undefined = useMemo(
        () => workflow?.paths.find((path) => path.id === pathId),
        [workflow, pathId]
    );

    const stepKeys = useMemo(() => pathStepKeys(currentPath), [currentPath]);

    /* ---------------- playback clock ---------------- */

    useEffect(() => {

        if (!playback.playing || reducedMotion || stepKeys.length === 0) {
            return;
        }

        lastTickRef.current = performance.now();

        const tick = (now: number) => {

            const elapsed = now - lastTickRef.current;
            lastTickRef.current = now;

            setPlayback((state) => advance(state, stepKeys.length, elapsed));
            frameRef.current = requestAnimationFrame(tick);
        };

        frameRef.current = requestAnimationFrame(tick);

        return () => {

            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };

    }, [playback.playing, reducedMotion, stepKeys.length]);

    /* keep the highlighted step in sync with the marker */
    useEffect(() => {

        const key = stepKeys[playback.index];

        if (key) {
            setSelectedKey(key);
        }

    }, [playback.index, stepKeys]);

    /* ---------------- handlers ---------------- */

    const play = useCallback(() => {

        setPlayback((state) =>
            state.finished
                ? { ...initialPlayback(state.pathId, state.speed), playing: true }
                : { ...state, playing: true }
        );

    }, []);

    const pause = useCallback(() => {
        setPlayback((state) => ({ ...state, playing: false }));
    }, []);

    const replay = useCallback(() => {
        setPlayback((state) => ({ ...initialPlayback(state.pathId, state.speed), playing: true }));
    }, []);

    const reset = useCallback(() => {
        setPlayback((state) => initialPlayback(state.pathId, state.speed));
        setSelectedKey(stepKeys[0] ?? "");
    }, [stepKeys]);

    const stepBy = useCallback((delta: number) => {

        setPlayback((state) => {

            const index = Math.min(
                Math.max(state.index + delta, 0),
                Math.max(stepKeys.length - 1, 0)
            );

            return { ...state, index, progress: 0, playing: false, finished: index >= stepKeys.length - 1 && delta > 0 };
        });

    }, [stepKeys.length]);

    const changeSpeed = useCallback(() => {

        setPlayback((state) => {
            const index = SPEEDS.indexOf(state.speed as typeof SPEEDS[number]);
            const next = SPEEDS[(index + 1 + SPEEDS.length) % SPEEDS.length];
            return { ...state, speed: next };
        });

    }, []);

    const refine = useCallback(async () => {

        if (!workflow) {
            return;
        }

        setRefining(true);

        try {
            setWorkflow(await refineWorkflow(repository, workflow));
        } catch (error) {
            setMessage((error as Error).message);
        } finally {
            setRefining(false);
        }

    }, [repository, workflow]);

    /* ---------------- derived render data ---------------- */

    const positions = useMemo(
        () => (workflow ? layoutWorkflow(workflow) : new Map()),
        [workflow]
    );

    const size = useMemo(() => canvasSize(positions), [positions]);

    const marker = useMemo(
        () => markerPosition(positions, stepKeys, playback),
        [positions, stepKeys, playback]
    );

    const activeKeys = new Set(stepKeys.slice(0, playback.index + 1));

    const selected = workflow?.steps.find((step) => step.key === selectedKey);

    /* ---------------- states ---------------- */

    if (status === "loading") {
        return (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500" role="status">
                Reconstructing candidate workflows from the stored graph…
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-red-400" role="alert">{message}</p>
                <button className={buttonClass} onClick={() => void loadList()}>
                    Retry
                </button>
            </div>
        );
    }

    if (status === "empty" || !workflow) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-neutral-300">
                    No workflow could be reconstructed from this repository.
                </p>
                <p className="max-w-md text-xs text-neutral-500">
                    {list?.evidenceVersion === "none"
                        ? "This stored graph predates Build 05 workflow evidence, so routes, branches and call order are unavailable. Re-analyze the repository to enable them."
                        : "Coremation only shows paths the source actually supports, and none were found: no entry point with at least one resolved call or HTTP request."}
                </p>
            </div>
        );
    }

    const refinementNote =
        workflow.refinement.state === "applied"
            ? `AI wording applied for ${Object.keys(workflow.refinement.stepLabels ?? {}).length} step(s). Structure unchanged.`
            : workflow.refinement.state === "unavailable"
              ? `Refinement unavailable — showing deterministic labels. ${workflow.refinement.note ?? ""}`
              : workflow.refinement.state === "rejected"
                ? "The model response did not pass validation — showing deterministic labels."
                : "Showing deterministic labels from source identifiers.";

    return (
        <div className="flex h-full min-h-0">
            {/* selector */}
            <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-800 bg-black p-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
                    Candidate workflows
                </p>

                <ul className="space-y-1">
                    {(list?.workflows ?? []).map((entry) => (
                        <li key={entry.id}>
                            <button
                                className={
                                    (entry.id === workflowId
                                        ? "w-full rounded border border-white bg-neutral-950 px-2 py-1 text-left text-xs text-white"
                                        : "w-full rounded border border-neutral-900 px-2 py-1 text-left text-xs text-neutral-400 hover:border-neutral-700 hover:text-white") +
                                    " block"
                                }
                                onClick={() => setWorkflowId(entry.id)}
                            >
                                <span className="block truncate">{entry.title}</span>
                                <span className="block text-[10px] text-neutral-500">
                                    {entry.stepCount} steps · {entry.pathCount} paths
                                    {entry.hasHttpBoundary ? " · HTTP" : ""}
                                    {entry.branchCount > 0 ? ` · ${entry.branchCount} branches` : ""}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>

                <p className="mt-3 text-[10px] leading-snug text-neutral-600">
                    Statically reconstructed candidates. A moving marker is a
                    simulated traversal of a candidate path — not a captured
                    runtime request.
                </p>
            </aside>

            {/* diagram + controls */}
            <section className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
                    <label className="text-[10px] uppercase tracking-wide text-neutral-500" htmlFor="coremation-path">
                        Path
                    </label>
                    <select
                        id="coremation-path"
                        className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white"
                        value={pathId}
                        onChange={(event) => {
                            setPathId(event.target.value);
                            setPlayback(initialPlayback(event.target.value, playback.speed));
                        }}
                    >
                        {workflow.paths.map((path) => (
                            <option key={path.id} value={path.id}>
                                {path.label}
                            </option>
                        ))}
                    </select>

                    <button className={buttonClass} onClick={play} disabled={reducedMotion}>
                        {playback.finished ? "Replay" : "Play"}
                    </button>
                    <button className={buttonClass} onClick={pause} disabled={!playback.playing}>
                        Pause
                    </button>
                    <button className={buttonClass} onClick={replay}>
                        Replay
                    </button>
                    <button className={buttonClass} onClick={reset}>
                        Reset
                    </button>
                    <button className={buttonClass} onClick={() => stepBy(-1)}>
                        Prev step
                    </button>
                    <button className={buttonClass} onClick={() => stepBy(1)}>
                        Next step
                    </button>
                    <button className={buttonClass} onClick={changeSpeed}>
                        Speed {playback.speed}x
                    </button>
                    <button
                        className={buttonClass}
                        onClick={() => void refine()}
                        disabled={refining}
                    >
                        {refining ? "Refining…" : "Improve labels (AI)"}
                    </button>
                </div>

                {reducedMotion && (
                    <p className="border-b border-neutral-800 px-3 py-1 text-[10px] text-neutral-500">
                        Reduced motion is on: the marker does not animate. Use
                        Prev/Next step to walk the path.
                    </p>
                )}

                <div className="min-h-0 flex-1 overflow-auto bg-black">
                    <svg
                        width={size.width}
                        height={size.height}
                        viewBox={`0 0 ${size.width} ${size.height}`}
                        role="img"
                        aria-label={`Workflow ${workflow.title}`}
                    >
                        <defs>
                            <marker
                                id="coremation-arrow"
                                markerWidth="8"
                                markerHeight="8"
                                refX="7"
                                refY="4"
                                orient="auto"
                            >
                                <path d="M0,0 L8,4 L0,8 z" fill="#525252" />
                            </marker>
                        </defs>

                        {workflow.edges.map((edge, index) => {

                            const d = edgePath(positions, edge);

                            if (!d) {
                                return null;
                            }

                            const onPath =
                                activeKeys.has(edge.from) && activeKeys.has(edge.to);

                            return (
                                <path
                                    key={`${edge.from}->${edge.to}:${index}`}
                                    d={d}
                                    fill="none"
                                    stroke={onPath ? "#ffffff" : "#525252"}
                                    strokeWidth={onPath ? 1.6 : 1}
                                    strokeDasharray={edgeIsUncertain(edge) ? "5 4" : undefined}
                                    markerEnd="url(#coremation-arrow)"
                                />
                            );
                        })}

                        {workflow.steps.map((step) => {

                            const position = positions.get(step.key);

                            if (!position) {
                                return null;
                            }

                            const presentation = presentStep(step, workflow.refinement);
                            const isSelected = step.key === selectedKey;
                            const isActive = activeKeys.has(step.key);

                            return (
                                <g
                                    key={step.key}
                                    transform={`translate(${position.x}, ${position.y})`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`${presentation.badge} ${step.label} — ${step.filePath}:${step.line}`}
                                    aria-pressed={isSelected}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => setSelectedKey(step.key)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setSelectedKey(step.key);
                                        }
                                    }}
                                >
                                    <title>{`${presentation.label} — ${step.filePath}:${step.line}`}</title>
                                    <rect
                                        width={position.width}
                                        height={position.height}
                                        rx={step.kind === "route" ? 14 : 4}
                                        fill={isSelected ? "#f5f5f5" : "#0a0a0a"}
                                        stroke={
                                            presentation.dashed
                                                ? "#a3a3a3"
                                                : isActive || isSelected
                                                  ? "#ffffff"
                                                  : "#404040"
                                        }
                                        strokeWidth={isSelected ? 2 : 1}
                                        strokeDasharray={presentation.dashed ? "4 3" : undefined}
                                    />
                                    <text
                                        x={6}
                                        y={14}
                                        fontSize={9}
                                        fill={isSelected ? "#404040" : "#737373"}
                                    >
                                        {presentation.badge}
                                        {step.awaited ? " · ASYNC" : ""}
                                        {presentation.refined ? " · AI" : ""}
                                    </text>
                                    <text
                                        x={6}
                                        y={30}
                                        fontSize={11}
                                        fill={isSelected ? "#000000" : "#e5e5e5"}
                                    >
                                        {presentation.label.slice(0, 24)}
                                    </text>
                                    <text
                                        x={6}
                                        y={45}
                                        fontSize={9}
                                        fill={isSelected ? "#525252" : "#737373"}
                                    >
                                        {`${step.filePath.split("/").pop() ?? ""}:${step.line}`}
                                    </text>
                                </g>
                            );
                        })}

                        {marker && (
                            <g aria-hidden="true">
                                <circle cx={marker.x} cy={marker.y} r={7} fill="#ffffff" />
                                <circle cx={marker.x} cy={marker.y} r={12} fill="none" stroke="#ffffff" strokeOpacity={0.35} />
                            </g>
                        )}
                    </svg>

                    <details className="px-3 pb-2">
                        <summary className="cursor-pointer text-[10px] text-neutral-500">
                            Text alternative of this path
                        </summary>
                        <pre className="whitespace-pre-wrap text-[10px] text-neutral-400">
                            {describeWorkflowTextually(workflow, currentPath)}
                        </pre>
                    </details>
                </div>

                <p className="border-t border-neutral-800 px-3 py-1 text-[10px] text-neutral-500">
                    {refinementNote}
                </p>
            </section>

            {/* details */}
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 bg-black p-4">
                {selected ? (
                    <div className="space-y-2 text-xs">
                        <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                            Step detail
                        </p>
                        <p className="text-sm text-white">{selected.label}</p>
                        {workflow.refinement.stepLabels?.[selected.key] && (
                            <p className="text-[11px] text-neutral-400">
                                AI wording: {workflow.refinement.stepLabels[selected.key]}
                            </p>
                        )}
                        <dl className="space-y-1 text-neutral-400">
                            <div className="flex justify-between gap-2">
                                <dt className="text-neutral-600">Kind</dt>
                                <dd>{selected.kind}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-neutral-600">Evidence</dt>
                                <dd>{selected.evidence}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-neutral-600">Branch</dt>
                                <dd>{selected.branch ?? "unconditional"}</dd>
                            </div>
                            {selected.condition && (
                                <div>
                                    <dt className="text-neutral-600">Condition</dt>
                                    <dd className="break-all text-neutral-300">{selected.condition}</dd>
                                </div>
                            )}
                            <div className="flex justify-between gap-2">
                                <dt className="text-neutral-600">Source</dt>
                                <dd className="break-all text-neutral-300">
                                    {selected.filePath}:{selected.line}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-neutral-600">Awaited</dt>
                                <dd>{selected.awaited ? "yes" : "no"}</dd>
                            </div>
                        </dl>

                        <p className="text-[10px] leading-snug text-neutral-600">
                            The uploaded archive is not retained after analysis,
                            so the file itself cannot be opened here. The
                            reference above is where the source was when it was
                            analysed.
                        </p>
                    </div>
                ) : (
                    <p className="text-xs text-neutral-500">
                        Select a step to inspect its evidence.
                    </p>
                )}

                <div className="mt-4 space-y-1 border-t border-neutral-800 pt-3 text-[10px] text-neutral-500">
                    <p>Repository: {workflow.repository}</p>
                    <p>
                        {workflow.provenance.resolvedCalls} resolved calls ·{" "}
                        {workflow.provenance.branchPoints} guarded calls ·{" "}
                        {workflow.provenance.httpBoundaries} HTTP boundaries
                    </p>
                    <p>
                        Unresolved calls in graph: {workflow.provenance.unresolvedCalls}
                        {" · "}recursive call sites: {workflow.provenance.selfCalls}
                    </p>
                    <p>Evidence: {workflow.provenance.evidenceVersion}</p>
                    <p>
                        Limits: depth {workflow.provenance.maxDepth}, steps{" "}
                        {workflow.provenance.maxSteps}
                        {workflow.provenance.truncated ? " · truncated" : ""}
                    </p>
                </div>
            </aside>
        </div>
    );
}
