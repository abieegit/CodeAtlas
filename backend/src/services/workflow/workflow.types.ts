import { BranchKind } from "../../models/graph.types";

export type WorkflowStepKind =
    | "entry"
    | "function"
    | "route"
    | "terminal"
    | "error"
    | "boundary";

export type WorkflowEdgeKind =
    | "call"
    | "http"
    | "branch"
    | "return"
    | "throw"
    | "unresolved";

export type WorkflowPathKind = "main" | "branch" | "error";

export type EvidenceState = "resolved" | "ambiguous" | "unresolved";

export type RefinementState =
    | "not-requested"
    | "applied"
    | "unavailable"
    | "rejected";

export interface WorkflowStep {
    /** Unique inside one workflow. */
    key: string;
    label: string;
    kind: WorkflowStepKind;
    /** Graph node id when the step is backed by a real entity. */
    entityId: string | null;
    filePath: string;
    line: number;
    column?: number;
    branch?: BranchKind;
    condition?: string;
    awaited?: boolean;
    /** Source order within the caller. NOT proven runtime order. */
    sequence?: number;
    evidence: EvidenceState;
    /** Only ever set after validation of a model response. */
    aiLabel?: string;
}

export interface WorkflowEdge {
    from: string;
    to: string;
    kind: WorkflowEdgeKind;
    condition?: string;
    evidence: EvidenceState;
}

export interface WorkflowPath {
    id: string;
    label: string;
    kind: WorkflowPathKind;
    condition?: string;
    stepKeys: string[];
}

export interface WorkflowProvenance {
    graphFingerprint: string;
    /**
     * `v1` when the stored graph carries workflow evidence, `none` when it
     * predates Build 05 and therefore cannot support routes, branches or
     * call order (an explicit re-analysis is required).
     */
    evidenceVersion: "v1" | "none";
    resolvedCalls: number;
    unresolvedCalls: number;
    /** Recursive call sites in the repository (evidence only, not edges). */
    selfCalls: number;
    httpBoundaries: number;
    branchPoints: number;
    truncated: boolean;
    maxDepth: number;
    maxSteps: number;
}

export interface WorkflowRefinement {
    state: RefinementState;
    model?: string;
    generatedAt?: string;
    /** Always shown so a reader knows which parts are AI wording. */
    note?: string;

    /**
     * AI wording only. The deterministic `title`, `description` and step
     * `label` fields are never overwritten, so a reader can always compare
     * the source-derived text with the refined wording.
     */
    title?: string;
    description?: string;
    stepLabels?: Record<string, string>;
    pathLabels?: Record<string, string>;

    /** Counts that make rejected model output visible instead of silent. */
    rejected?: { stepKeys: number; pathIds: number; fields: number };
}

export interface Workflow {
    id: string;
    repository: string;
    title: string;
    description: string;
    entryKey: string;
    steps: WorkflowStep[];
    edges: WorkflowEdge[];
    paths: WorkflowPath[];
    provenance: WorkflowProvenance;
    refinement: WorkflowRefinement;
}

export interface WorkflowSummary {
    id: string;
    title: string;
    entryLabel: string;
    stepCount: number;
    pathCount: number;
    hasHttpBoundary: boolean;
    branchCount: number;
    unresolvedCount: number;
    evidenceVersion: "v1" | "none";
}
