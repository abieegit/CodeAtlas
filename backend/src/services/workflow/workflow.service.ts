import {
    CallOccurrence,
    FileWorkflowEvidence,
    GraphData,
    GraphNode,
    RouteEvidence,
    RouteMountEvidence
} from "../../models/graph.types";

import {
    matchRequest,
    withMounts
} from "./route-matching";

import {
    EvidenceState,
    Workflow,
    WorkflowEdge,
    WorkflowPath,
    WorkflowStep,
    WorkflowSummary
} from "./workflow.types";

/*
 * Hard limits: a large repository must not be able to make this service
 * explode in time, memory or payload size.
 */
const MAX_WORKFLOWS = 12;
const MAX_STEPS_PER_WORKFLOW = 24;
const MAX_DEPTH = 10;
const MAX_PATHS_PER_WORKFLOW = 8;
const MAX_EDGES_PER_WORKFLOW = 40;

const EVIDENCE_VERSION = "v1" as const;

interface RouteStepInfo {
    route: RouteEvidence;
    key: string;
    step: WorkflowStep;
}

/** Mount prefixes discovered for the routes declared in one file. */
type MountsByTargetFile = Map<string, RouteMountEvidence[]>;

function entityLabel(node: GraphNode | undefined, fallback: string): string {
    return node ? `${node.name}` : fallback;
}

/**
 * Fingerprint of the graph this workflow was derived from. Includes the
 * number of files carrying workflow evidence so a re-analysis that adds
 * evidence is never confused with the graph before it.
 */
export function workflowFingerprint(graph: GraphData): string {

    const relationshipCounts: Record<string, number> = {};

    for (const relationship of graph.relationships) {
        relationshipCounts[relationship.type] =
            (relationshipCounts[relationship.type] ?? 0) + 1;
    }

    const relationshipPart = Object.entries(relationshipCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, count]) => `${type}=${count}`)
        .join(",");

    const evidenceFiles = graph.nodes.filter(
        (node) => node.type === "File" && node.workflowEvidence
    ).length;

    return `${graph.nodes.length}:${relationshipPart || "none"}:ev=${evidenceFiles}`;
}

function collectRouteSteps(
    graph: GraphData
): { routes: RouteStepInfo[]; hasEvidence: boolean } {

    const mountsByFile: MountsByTargetFile = new Map();
    const routes: RouteStepInfo[] = [];
    let hasEvidence = false;

    for (const node of graph.nodes) {

        if (node.type !== "File" || !node.workflowEvidence) {
            continue;
        }

        hasEvidence = true;

        const evidence = node.workflowEvidence;

        for (const mount of evidence.mounts) {
            const list = mountsByFile.get(mount.targetFile ?? "") ?? [];
            list.push(mount);
            mountsByFile.set(mount.targetFile ?? "", list);
        }
    }

    for (const node of graph.nodes) {

        if (node.type !== "File" || !node.workflowEvidence) {
            continue;
        }

        const mounted = withMounts(
            node.workflowEvidence.routes,
            node.filePath,
            mountsByFile.get(node.filePath) ?? []
        );

        for (const route of mounted) {

            const handlerName = route.handler || "handler";

            const key = `route:${route.method}:${route.fullPath}:${route.line}`;

            routes.push({
                route,
                key,
                step: {
                    key,
                    label: `${route.method} ${route.fullPath}`,
                    kind: "route",
                    entityId: route.handlerId,
                    filePath: node.filePath,
                    line: route.line,
                    column: route.column,
                    evidence: route.handlerId ? "resolved" : "unresolved"
                }
            });
        }
    }

    return { routes, hasEvidence };
}

function collectHttpLinks(
    graph: GraphData,
    routes: RouteStepInfo[]
): Map<string, { targetKey: string; evidence: EvidenceState; label: string }[]> {

    const links = new Map<
        string,
        { targetKey: string; evidence: EvidenceState; label: string }[]
    >();

    if (routes.length === 0) {
        return links;
    }

    for (const node of graph.nodes) {

        if (node.type !== "File" || !node.workflowEvidence) {
            continue;
        }

        for (const request of node.workflowEvidence.requests) {

            if (!request.callerId) {
                continue;
            }

            const match = matchRequest(request, routes.map((entry) => entry.route));

            if (match.status === "unresolved" && match.candidates.length === 0) {
                continue;
            }

            const targets =
                match.status === "resolved" && match.route
                    ? [match.route]
                    : match.candidates;

            const resolved = routes.filter((entry) =>
                targets.some((target) => target === entry.route)
            );

            if (resolved.length === 0) {
                continue;
            }

            const list = links.get(request.callerId) ?? [];

            for (const entry of resolved) {
                list.push({
                    targetKey: entry.key,
                    evidence: match.status,
                    label: `${request.method} ${request.url || "(dynamic url)"}`
                });
            }

            links.set(request.callerId, list);
        }
    }

    return links;
}

function adjacencyOf(
    graph: GraphData
): Map<string, { target: string; occurrence: CallOccurrence }[]> {

    const adjacency = new Map<
        string,
        { target: string; occurrence: CallOccurrence }[]
    >();

    for (const relationship of graph.relationships) {

        if (relationship.type !== "CALLS") {
            continue;
        }

        const occurrences = relationship.occurrences ?? [
            {
                callId: `${relationship.evidence?.filePath ?? ""}:${relationship.evidence?.line ?? 0}:0`,
                line: relationship.evidence?.line ?? 0,
                branch: "unconditional" as const,
                awaited: false,
                sequence: 1
            }
        ];

        const list = adjacency.get(relationship.source) ?? [];

        for (const occurrence of occurrences) {
            list.push({ target: relationship.target, occurrence });
        }

        adjacency.set(relationship.source, list);
    }

    for (const [, list] of adjacency) {
        list.sort((a, b) => a.occurrence.sequence - b.occurrence.sequence);
    }

    return adjacency;
}

function unresolvedCountFor(graph: GraphData): number {

    let total = 0;

    for (const node of graph.nodes) {
        if (node.type === "File" && node.workflowEvidence) {
            total += node.workflowEvidence.unresolved.length;
        }
    }

    return total;
}

function selfCallCountFor(graph: GraphData): number {

    let total = 0;

    for (const node of graph.nodes) {
        if (node.type === "File" && node.workflowEvidence) {
            total += node.workflowEvidence.selfCalls?.length ?? 0;
        }
    }

    return total;
}

function fileEvidenceOf(
    graph: GraphData,
    filePath: string
): FileWorkflowEvidence | undefined {

    return graph.nodes.find(
        (node) => node.type === "File" && node.filePath === filePath
    )?.workflowEvidence;
}

/**
 * Reconstructs candidate workflows from validated graph and evidence data
 * only. Every step is either a real entity, a statically extracted route, or
 * a statically extracted request; nothing here asks a model anything, and
 * nothing is added that the source does not show.
 */
export function buildWorkflows(
    repository: string,
    graph: GraphData
): Workflow[] {

    const nodesById = new Map(
        graph.nodes.map((node) => [node.id, node])
    );

    const adjacency = adjacencyOf(graph);
    const { routes, hasEvidence } = collectRouteSteps(graph);
    const httpLinks = collectHttpLinks(graph, routes);
    const routeByKey = new Map(routes.map((entry) => [entry.key, entry]));
    const selfCallsTotal = selfCallCountFor(graph);

    const inbound = new Set<string>();

    for (const relationship of graph.relationships) {
        if (relationship.type === "CALLS") {
            inbound.add(relationship.target);
        }
    }

    const scopeOk = (node: GraphNode | undefined): boolean =>
        !node || node.inDefaultScope === undefined || node.inDefaultScope === true;

    /* ---------------- entry candidates ---------------- */

    interface EntryCandidate {
        entityId: string;
        viaRouteKey?: string;
        heuristic: boolean;
    }

    const entries: EntryCandidate[] = [];
    const seenEntries = new Set<string>();

    for (const entry of routes) {
        if (entry.step.entityId && scopeOk(nodesById.get(entry.step.entityId))) {
            const key = `${entry.step.entityId}|${entry.key}`;
            if (!seenEntries.has(key)) {
                seenEntries.add(key);
                entries.push({
                    entityId: entry.step.entityId,
                    viaRouteKey: entry.key,
                    heuristic: false
                });
            }
        }
    }

    for (const node of graph.nodes) {

        if (node.type !== "Function" && node.type !== "Method") {
            continue;
        }

        if (!scopeOk(node) || !node.exported) {
            continue;
        }

        if (inbound.has(node.id)) {
            continue;
        }

        /*
         * An entry candidate is a callable that starts something: it makes a
         * resolved call, or the source shows it issuing an HTTP request.
         * Marked as heuristic — reachability is not proof of execution.
         */
        if (!adjacency.has(node.id) && !httpLinks.has(node.id)) {
            continue;
        }

        if (seenEntries.has(`${node.id}|`)) {
            continue;
        }

        seenEntries.add(`${node.id}|`);
        entries.push({ entityId: node.id, heuristic: true });
    }

    /* ---------------- build one workflow per entry ---------------- */

    const workflows: Workflow[] = [];
    const unresolvedTotal = unresolvedCountFor(graph);

    for (const candidate of entries) {

        if (workflows.length >= MAX_WORKFLOWS) {
            break;
        }

        const startNode = nodesById.get(candidate.entityId);

        if (!startNode) {
            continue;
        }

        const steps = new Map<string, WorkflowStep>();
        const edges: WorkflowEdge[] = [];
        const paths: WorkflowPath[] = [];

        const entryKey = `step:${candidate.entityId}`;

        steps.set(entryKey, {
            key: entryKey,
            label:
                candidate.viaRouteKey && routeByKey.has(candidate.viaRouteKey)
                    ? `${routeByKey.get(candidate.viaRouteKey)!.step.label}`
                    : entityLabel(startNode, candidate.entityId),
            kind: "entry",
            entityId: candidate.entityId,
            filePath: startNode.filePath,
            line: startNode.startLine,
            evidence: "resolved",
            sequence: 0
        });

        if (candidate.viaRouteKey) {

            const routeEntry = routeByKey.get(candidate.viaRouteKey);

            if (routeEntry && !steps.has(routeEntry.key)) {
                steps.set(routeEntry.key, routeEntry.step);
                edges.push({
                    from: routeEntry.key,
                    to: entryKey,
                    kind: "http",
                    evidence: "resolved"
                });
            }
        }

        interface WalkFrame {
            id: string;
            stepKey: string;
            depth: number;
            path: string[];
            visited: Set<string>;
        }

        const queue: WalkFrame[] = [
            {
                id: candidate.entityId,
                stepKey: entryKey,
                depth: 0,
                path: [entryKey],
                visited: new Set([candidate.entityId])
            }
        ];

        const mainKeys: string[] = [entryKey];
        const branchKeys = new Map<string, string[]>();
        const errorKeys: string[] = [];
        let branchPoints = 0;
        let resolvedCalls = 0;
        let httpBoundaries = candidate.viaRouteKey ? 1 : 0;
        let truncated = false;

        while (queue.length > 0) {

            const frame = queue.shift() as WalkFrame;

            /*
             * HTTP boundaries discovered at this callable: client function →
             * route → (continue into) the route's handler, so a workflow can
             * span the frontend and the backend in one chain.
             */
            for (const link of httpLinks.get(frame.id) ?? []) {

                const routeEntry = routeByKey.get(link.targetKey);

                if (!routeEntry) {
                    continue;
                }

                if (!steps.has(routeEntry.key)) {

                    if (steps.size >= MAX_STEPS_PER_WORKFLOW) {
                        truncated = true;
                        continue;
                    }

                    steps.set(routeEntry.key, routeEntry.step);
                }

                if (edges.length < MAX_EDGES_PER_WORKFLOW) {
                    edges.push({
                        from: frame.stepKey,
                        to: routeEntry.key,
                        kind: "http",
                        evidence: link.evidence,
                        condition: link.label
                    });
                }

                httpBoundaries += 1;

                if (frame.depth === 0 && !mainKeys.includes(routeEntry.key)) {
                    mainKeys.push(routeEntry.key);
                }

                const handlerId = routeEntry.route.handlerId;

                if (
                    handlerId &&
                    frame.depth + 1 < MAX_DEPTH &&
                    !frame.visited.has(handlerId) &&
                    scopeOk(nodesById.get(handlerId))
                ) {

                    if (!steps.has(`step:${handlerId}`)) {

                        const handlerNode = nodesById.get(handlerId);

                        steps.set(`step:${handlerId}`, {
                            key: `step:${handlerId}`,
                            label: entityLabel(handlerNode, handlerId),
                            kind: "function",
                            entityId: handlerId,
                            filePath: handlerNode?.filePath ?? "",
                            line: handlerNode?.startLine ?? 0,
                            evidence: "resolved"
                        });

                        edges.push({
                            from: routeEntry.key,
                            to: `step:${handlerId}`,
                            kind: "call",
                            evidence: "resolved"
                        });

                        const visited = new Set(frame.visited);
                        visited.add(handlerId);

                        queue.push({
                            id: handlerId,
                            stepKey: `step:${handlerId}`,
                            depth: frame.depth + 1,
                            path: [...frame.path, routeEntry.key, `step:${handlerId}`],
                            visited
                        });
                    }
                }
            }

            const outgoing = adjacency.get(frame.id) ?? [];

            for (const link of outgoing) {

                const { occurrence, target } = link;

                const stepKey = `step:${frame.id}->${target}:${occurrence.sequence}`;
                const targetNode = nodesById.get(target);

                if (steps.has(stepKey)) {
                    if (occurrence.branch === "unconditional") {
                        if (!mainKeys.includes(stepKey)) {
                            mainKeys.push(stepKey);
                        }
                    }
                    continue;
                }

                if (steps.size >= MAX_STEPS_PER_WORKFLOW) {
                    truncated = true;
                    break;
                }

                const isGuarded = occurrence.branch !== "unconditional";

                steps.set(stepKey, {
                    key: stepKey,
                    label: `${entityLabel(targetNode, target.split(":").pop() ?? target)}${
                        occurrence.awaited ? " (await)" : ""
                    }`,
                    kind: "function",
                    entityId: target,
                    filePath: targetNode?.filePath ?? occurrence.callId.split(":")[0] ?? "",
                    line: occurrence.line,
                    column: occurrence.column,
                    branch: occurrence.branch,
                    condition: occurrence.condition,
                    awaited: occurrence.awaited,
                    sequence: occurrence.sequence,
                    evidence: "resolved"
                });

                edges.push({
                    from: `step:${frame.id}`,
                    to: stepKey,
                    kind: isGuarded ? "branch" : "call",
                    condition: occurrence.condition,
                    evidence: "resolved"
                });

                resolvedCalls += 1;
                branchPoints += isGuarded ? 1 : 0;

                if (isGuarded) {

                    const conditionKey = `${occurrence.branch}:${occurrence.condition ?? ""}`;
                    const branchPath = branchKeys.get(conditionKey) ?? [...frame.path];

                    branchPath.push(stepKey);
                    branchKeys.set(conditionKey, branchPath);
                } else if (frame.depth === 0) {
                    mainKeys.push(stepKey);
                }

                /* HTTP boundary from this callable is handled when the
                 * target is dequeued, so it is never added twice. */

                /* error path evidence: does the target throw? */
                const targetEvidence = targetNode
                    ? fileEvidenceOf(graph, targetNode.filePath)
                    : undefined;

                const unit = targetEvidence?.units.find(
                    (entry) => entry.id === target
                );

                if (unit && unit.throws.length > 0 && errorKeys.length < MAX_PATHS_PER_WORKFLOW) {
                    const errorKey = `error:${target}:${unit.throws[0]}`;

                    if (!steps.has(errorKey) && steps.size < MAX_STEPS_PER_WORKFLOW) {
                        steps.set(errorKey, {
                            key: errorKey,
                            label: `throw at line ${unit.throws[0]}`,
                            kind: "error",
                            entityId: target,
                            filePath: targetNode?.filePath ?? "",
                            line: unit.throws[0],
                            evidence: "resolved"
                        });

                        edges.push({
                            from: stepKey,
                            to: errorKey,
                            kind: "throw",
                            evidence: "resolved"
                        });

                        errorKeys.push(errorKey);
                    }
                }

                if (
                    frame.depth + 1 < MAX_DEPTH &&
                    !frame.visited.has(target) &&
                    scopeOk(targetNode)
                ) {

                    const visited = new Set(frame.visited);
                    visited.add(target);

                    queue.push({
                        id: target,
                        stepKey,
                        depth: frame.depth + 1,
                        path: [...frame.path, stepKey],
                        visited
                    });
                }
            }
        }

        /* ---------------- paths ---------------- */

        const hasTerminal = [...steps.values()].some(
            (step) => step.kind === "error"
        );

        paths.push({
            id: "path:main",
            label: "Main path",
            kind: "main",
            stepKeys: mainKeys.filter((key) => steps.has(key))
        });

        for (const [conditionKey, keys] of branchKeys) {

            if (paths.length >= MAX_PATHS_PER_WORKFLOW) {
                truncated = true;
                break;
            }

            const [, condition] = conditionKey.split(":");

            const [, kind] = conditionKey.split(":");

            paths.push({
                id: `path:branch:${paths.length}`,
                label:
                    condition && condition !== ""
                        ? `When ${condition}`
                        : `Guarded call (${kind ?? "branch"})`,
                kind: "branch",
                condition: condition && condition !== "" ? condition : undefined,
                stepKeys: keys.filter((key) => steps.has(key))
            });
        }

        if (errorKeys.length > 0 && paths.length < MAX_PATHS_PER_WORKFLOW) {
            paths.push({
                id: "path:error",
                label: "Error path (source shows a throw)",
                kind: "error",
                stepKeys: [entryKey, ...errorKeys]
            });
        }

        /*
         * Many real handlers guard almost every call (`if (!file) return 400`,
         * try/catch around the pipeline), so the unconditional-only main path
         * can be a single step. A full-reach traversal is offered alongside it,
         * labelled so no reader mistakes it for a guaranteed sequence.
         */
        const allKeys = [...steps.keys()];

        if (allKeys.length > 2 && paths.length < MAX_PATHS_PER_WORKFLOW) {
            paths.push({
                id: "path:all",
                label: "All reachable steps (guard conditions ignored)",
                kind: "main",
                stepKeys: allKeys
            });
        }

        /* Skip single-step entries: they are not a workflow. */
        if (steps.size < 2) {
            continue;
        }

        const routeLabel = candidate.viaRouteKey
            ? routeByKey.get(candidate.viaRouteKey)?.step.label ?? ""
            : "";

        const id = `wf:${candidate.entityId.replace(/[^a-zA-Z0-9._-]/g, "-")}${
            candidate.viaRouteKey ? `:${candidate.viaRouteKey}` : ""
        }`;

        workflows.push({
            id,
            repository,
            title:
                routeLabel !== ""
                    ? `${routeLabel} → ${entityLabel(startNode, startNode.name)}`
                    : `${entityLabel(startNode, startNode.name)} — call path`,
            description:
                `Statically reconstructed candidate path through ` +
                `${resolvedCalls} resolved call${resolvedCalls === 1 ? "" : "s"}` +
                `${branchPoints > 0 ? `, ${branchPoints} guarded call${branchPoints === 1 ? "" : "s"}` : ""}` +
                `${httpBoundaries > 0 ? `, ${httpBoundaries} HTTP boundary${httpBoundaries === 1 ? "" : "ies"}` : ""}` +
                `${hasTerminal ? ", error path evidence" : ""}.`,
            entryKey,
            steps: [...steps.values()],
            edges,
            paths,
            provenance: {
                graphFingerprint: workflowFingerprint(graph),
                evidenceVersion: hasEvidence ? EVIDENCE_VERSION : "none",
                resolvedCalls,
                unresolvedCalls: unresolvedTotal,
                selfCalls: selfCallsTotal,
                httpBoundaries,
                branchPoints,
                truncated,
                maxDepth: MAX_DEPTH,
                maxSteps: MAX_STEPS_PER_WORKFLOW
            },
            refinement: {
                state: "not-requested",
                note: "Titles and labels below are taken from source identifiers."
            }
        });
    }

    return workflows
        .sort((a, b) => b.steps.length - a.steps.length)
        .slice(0, MAX_WORKFLOWS);
}

export function summarizeWorkflow(workflow: Workflow): WorkflowSummary {

    return {
        id: workflow.id,
        title: workflow.title,
        entryLabel:
            workflow.steps.find((step) => step.key === workflow.entryKey)
                ?.label ?? workflow.title,
        stepCount: workflow.steps.length,
        pathCount: workflow.paths.length,
        hasHttpBoundary:
            workflow.provenance.httpBoundaries > 0,
        branchCount: workflow.provenance.branchPoints,
        unresolvedCount: workflow.provenance.unresolvedCalls,
        evidenceVersion: workflow.provenance.evidenceVersion
    };
}

export const WORKFLOW_LIMITS = {
    MAX_WORKFLOWS,
    MAX_STEPS_PER_WORKFLOW,
    MAX_DEPTH,
    MAX_PATHS_PER_WORKFLOW,
    MAX_EDGES_PER_WORKFLOW
};

export type { EvidenceState };
