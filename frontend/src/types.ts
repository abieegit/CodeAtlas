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

export type ResolutionMethod =
    | "derived"
    | "resolved"
    | "name-match";

/** Where a call site sits in its function's control flow (Build 05). */
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

export interface CallOccurrence {
    callId: string;
    line: number;
    column?: number;
    branch: BranchKind;
    condition?: string;
    awaited: boolean;
    sequence: number;
}

export interface RelationshipEvidence {
    filePath?: string;
    line?: number;
    resolution: ResolutionMethod;
}

export interface GraphNode {
    id: string;
    type: EntityType;
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    category?: FileCategory;
    inDefaultScope?: boolean;
    sourceSnippet?: string;
    /** Build 05: declared `async`. */
    async?: boolean;
    /** Build 05: reachable through an `export`. */
    exported?: boolean;
}

export interface GraphRelationship {
    source: string;
    target: string;
    type: RelationshipType;
    evidence?: RelationshipEvidence;
    /** Build 05: every concrete call site behind this edge. */
    occurrences?: CallOccurrence[];
}

export interface GraphData {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
}
