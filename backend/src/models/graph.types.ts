export type EntityType =
    | "Repository"
    | "Directory"
    | "File"
    | "Class"
    | "Function"
    | "Method"
    | "Variable";

export type RelationshipType =
    | "CONTAINS"
    | "IMPORTS"
    | "CALLS"
    | "EXTENDS";

export type FileCategory =
    | "source"
    | "test"
    | "config"
    | "fixture"
    | "generated"
    | "declaration";

export interface GraphNode {
    id: string;
    type: EntityType;
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    category?: FileCategory;
    inDefaultScope?: boolean;
    /**
     * Compact source text of a Function entity (whitespace-collapsed,
     * truncated). Captured at extraction time so analysis features can
     * reason about the actual implementation without the original ZIP.
     */
    sourceSnippet?: string;
    /** True when the callable is declared `async`. */
    async?: boolean;
    /** True when the callable is reachable through an `export`. */
    exported?: boolean;
    /** File-level workflow evidence (File nodes only). */
    workflowEvidence?: FileWorkflowEvidence;
}

/**
 * How a relationship was discovered, recorded as provenance so the graph
 * can explain where an edge came from rather than presenting it as fact.
 *
 *  - "derived"    structural ownership computed from paths/file contents
 *                 (e.g. Repository/Directory containment).
 *  - "resolved"   a concrete target was resolved (relative import path, or
 *                 a call resolved via the TypeScript symbol resolver).
 *  - "name-match" matched by symbol name only (currently EXTENDS).
 */
export type ResolutionMethod =
    | "derived"
    | "resolved"
    | "name-match";

/**
 * How a call site is nested inside its enclosing callable's control flow.
 * Evidence only: it says where a call is WRITTEN, not that it executes.
 * `unconditional` means directly in the function body with no enclosing
 * branch or loop.
 */
export type BranchKind =
    | "unconditional"
    | "if.then"
    | "else-if"
    | "if.else"
    | "case"
    | "default"
    | "ternary.consequent"
    | "ternary.alternate"
    | "try"
    | "catch"
    | "finally"
    | "loop";

/**
 * One concrete call site. A caller may invoke the same target repeatedly;
 * every occurrence is preserved so workflow reconstruction can order and
 * locate them. `sequence` is SOURCE order within the caller, not proven
 * runtime order.
 */
export interface CallOccurrence {
    callId: string;
    line: number;
    column?: number;
    branch: BranchKind;
    condition?: string;
    awaited: boolean;
    sequence: number;
}

/** A call that could not be resolved to an internal entity. */
export interface UnresolvedCall {
    callerId: string | null;
    callee: string;
    line: number;
    column?: number;
    reason: "not-resolved" | "target-not-in-graph";
}

/** An Express-style route registration found statically. */
export interface RouteEvidence {
    method: string;
    path: string;
    mountPath: string;
    fullPath: string;
    handler: string;
    handlerId: string | null;
    line: number;
    column?: number;
    middleware: string[];
}

/** An outbound HTTP request found statically in a client file. */
export interface RequestEvidence {
    method: string;
    url: string;
    urlStatic: boolean;
    client: "fetch" | "axios" | "unknown";
    callerId: string | null;
    line: number;
    column?: number;
}

/** An `app.use("/prefix", router)` style mount, found statically. */
export interface RouteMountEvidence {
    prefix: string;
    targetName: string;
    targetFile: string | null;
    line: number;
}

/** Control-flow evidence for one callable unit within a file. */
export interface ControlFlowUnit {
    id: string;
    name: string;
    branches: Array<{ kind: BranchKind; condition?: string; line: number }>;
    returns: number[];
    throws: number[];
    awaits: number[];
    loops: number[];
}

/**
 * Bounded, file-level workflow evidence, persisted as a JSON property on
 * File nodes so the existing node and relationship types — and therefore
 * the D3 graph, filters, search, reports and function summaries — stay
 * exactly as they are.
 */
export interface FileWorkflowEvidence {
    routes: RouteEvidence[];
    requests: RequestEvidence[];
    mounts: RouteMountEvidence[];
    units: ControlFlowUnit[];
    unresolved: UnresolvedCall[];
    /**
     * Lines where a callable calls itself. Kept as evidence rather than as a
     * graph edge because the existing self-loop rule (and its test) removes
     * `source === target` relationships from the architectural graph.
     */
    selfCalls: number[];
    external: string[];
    truncated: boolean;
}

export interface RelationshipEvidence {
    filePath?: string;
    line?: number;
    resolution: ResolutionMethod;
}

export interface GraphRelationship {
    source: string;
    target: string;
    type: RelationshipType;
    evidence?: RelationshipEvidence;
    /**
     * Every concrete call site behind this edge (CALLS edges only).
     * Absent when there is no occurrence data, so existing consumers
     * see exactly the shape they do today.
     */
    occurrences?: CallOccurrence[];
}

export interface GraphData {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
}