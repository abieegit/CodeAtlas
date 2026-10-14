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
}

export interface GraphData {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
}