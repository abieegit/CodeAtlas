import type { BranchKind } from "./types";

/* Mirrors backend/src/services/workflow/workflow.types.ts. */

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
    key: string;
    label: string;
    kind: WorkflowStepKind;
    entityId: string | null;
    filePath: string;
    line: number;
    column?: number;
    branch?: BranchKind;
    condition?: string;
    awaited?: boolean;
    sequence?: number;
    evidence: EvidenceState;
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
    evidenceVersion: "v1" | "none";
    resolvedCalls: number;
    unresolvedCalls: number;
    /** Recursive call sites recorded as evidence (not graph edges). */
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
    note?: string;
    title?: string;
    description?: string;
    stepLabels?: Record<string, string>;
    pathLabels?: Record<string, string>;
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

export interface WorkflowListResponse {
    repository: string;
    evidenceVersion: "v1" | "none";
    count: number;
    workflows: WorkflowSummary[];
    note?: string;
}
