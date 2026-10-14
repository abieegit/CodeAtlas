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
