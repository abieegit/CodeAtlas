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

export interface GraphNode {
    id: string;
    type: EntityType;
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
}

export interface GraphRelationship {
    source: string;
    target: string;
    type: RelationshipType;
}

export interface GraphData {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
}
