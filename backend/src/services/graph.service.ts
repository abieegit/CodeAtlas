import {
    neo4jDriver,
    database
} from "../database/neo4j";

import {
    EntityType,
    GraphData,
    GraphNode,
    GraphRelationship,
    RelationshipType
} from "../models/graph.types";

/*
 * Allow-lists used when building Cypher labels / relationship types.
 * Anything outside these sets falls back to a safe default, so graph
 * data can never inject Cypher through a label.
 */
const ENTITY_LABELS: Record<string, boolean> = {
    Repository: true,
    Directory: true,
    File: true,
    Class: true,
    Function: true,
    Method: true,
    Variable: true
};

const RELATIONSHIP_TYPES: Record<string, boolean> = {
    CONTAINS: true,
    IMPORTS: true,
    CALLS: true,
    EXTENDS: true
};

function entityLabels(type: EntityType): string {
    return ENTITY_LABELS[type]
        ? `:Entity:${type}`
        : ":Entity";
}

function relationshipType(type: RelationshipType): string {
    return RELATIONSHIP_TYPES[type]
        ? type
        : "RELATIONSHIP";
}

/**
 * Persists a repository graph to Neo4j. Any previously stored graph for
 * the same repository is replaced, so re-analyzing is idempotent while
 * other repositories are left untouched.
 */
export async function saveGraph(
    graph: GraphData,
    repositoryName: string
): Promise<void> {

    const session =
        neo4jDriver.session({ database });

    try {

        await session.run(
            `
            MATCH (n:Entity {repository: $repository})
            DETACH DELETE n
            `,
            { repository: repositoryName }
        );

        for (const node of graph.nodes) {

            await session.run(
                `
                CREATE (
                    n${entityLabels(node.type)} {
                        id: $id,
                        type: $type,
                        name: $name,
                        filePath: $filePath,
                        startLine: $startLine,
                        endLine: $endLine,
                        category: $category,
                        inDefaultScope: $inDefaultScope,
                        sourceSnippet: $sourceSnippet,
                        repository: $repository
                    }
                )
                `,
                {
                    id: node.id,
                    type: node.type,
                    name: node.name,
                    filePath: node.filePath,
                    startLine: node.startLine,
                    endLine: node.endLine,
                    category: node.category ?? null,
                    inDefaultScope: node.inDefaultScope ?? null,
                    sourceSnippet: node.sourceSnippet ?? null,
                    repository: repositoryName
                }
            );
        }

        for (const relationship of graph.relationships) {

            await session.run(
                `
                MATCH (source:Entity {id: $source, repository: $repository})
                MATCH (target:Entity {id: $target, repository: $repository})

                CREATE (source)-[r:${relationshipType(relationship.type)} {
                    line: $line,
                    filePath: $filePath,
                    resolution: $resolution
                }]->(target)
                `,
                {
                    source: relationship.source,
                    target: relationship.target,
                    repository: repositoryName,
                    line: relationship.evidence?.line ?? null,
                    filePath: relationship.evidence?.filePath ?? null,
                    resolution: relationship.evidence?.resolution ?? null
                }
            );
        }

    } finally {

        await session.close();
    }
}

/**
 * Reads a graph back out of Neo4j. When `repositoryName` is omitted the
 * whole (single-repository) graph is returned.
 */
export async function fetchGraph(
    repositoryName?: string
): Promise<GraphData> {

    const session =
        neo4jDriver.session({ database });

    try {

        const nodeResult =
            await session.run(
                repositoryName
                    ? `MATCH (n:Entity {repository: $repository}) RETURN n`
                    : `MATCH (n:Entity) RETURN n`,
                repositoryName
                    ? { repository: repositoryName }
                    : {}
            );

        const nodes: GraphNode[] =
            nodeResult.records.map((record) => {

                const properties =
                    record.get("n").properties;

                const node: GraphNode = {
                    id: properties.id,
                    type: properties.type as EntityType,
                    name: properties.name,
                    filePath: properties.filePath,
                    startLine: properties.startLine,
                    endLine: properties.endLine
                };

                if (properties.category) {
                    node.category = properties.category;
                }

                if (
                    properties.inDefaultScope !== null &&
                    properties.inDefaultScope !== undefined
                ) {
                    node.inDefaultScope = properties.inDefaultScope;
                }

                if (properties.sourceSnippet) {
                    node.sourceSnippet = properties.sourceSnippet;
                }

                return node;
            });

        const relationshipResult =
            await session.run(
                repositoryName
                    ? `
                        MATCH (a:Entity {repository: $repository})-[r]->(b:Entity {repository: $repository})
                        RETURN a.id AS source, type(r) AS type, b.id AS target,
                               r.line AS line, r.filePath AS filePath, r.resolution AS resolution
                      `
                    : `
                        MATCH (a:Entity)-[r]->(b:Entity)
                        RETURN a.id AS source, type(r) AS type, b.id AS target,
                               r.line AS line, r.filePath AS filePath, r.resolution AS resolution
                      `,
                repositoryName
                    ? { repository: repositoryName }
                    : {}
            );

        const relationships: GraphRelationship[] =
            relationshipResult.records.map((record) => {

                const resolution = record.get("resolution");

                const relationship: GraphRelationship = {
                    source: record.get("source"),
                    type: record.get("type") as RelationshipType,
                    target: record.get("target")
                };

                if (resolution) {
                    relationship.evidence = {
                        filePath: record.get("filePath") ?? undefined,
                        line: record.get("line") ?? undefined,
                        resolution
                    };
                }

                return relationship;
            });

        return { nodes, relationships };

    } finally {

        await session.close();
    }
}

/**
 * Returns one node plus its direct CALLS context (who calls it, what it
 * calls) for the function-summary feature. Null when the node does not
 * exist in the repository.
 */
export async function fetchFunctionContext(
    repositoryName: string,
    nodeId: string
): Promise<{
    node: GraphNode;
    callers: string[];
    callees: string[];
} | null> {

    const session =
        neo4jDriver.session({ database });

    try {

        const nodeResult =
            await session.run(
                `
                MATCH (n:Entity {repository: $repository, id: $nodeId})
                RETURN n
                `,
                { repository: repositoryName, nodeId }
            );

        if (nodeResult.records.length === 0) {
            return null;
        }

        const properties = nodeResult.records[0].get("n").properties;

        const node: GraphNode = {
            id: properties.id,
            type: properties.type as EntityType,
            name: properties.name,
            filePath: properties.filePath,
            startLine: properties.startLine,
            endLine: properties.endLine
        };

        if (properties.sourceSnippet) {
            node.sourceSnippet = properties.sourceSnippet;
        }

        const contextResult =
            await session.run(
                `
                MATCH (n:Entity {repository: $repository, id: $nodeId})
                OPTIONAL MATCH (caller:Entity)-[:CALLS]->(n)
                OPTIONAL MATCH (n)-[:CALLS]->(callee:Entity)
                RETURN collect(caller) AS callers, collect(callee) AS callees
                `,
                { repository: repositoryName, nodeId }
            );

        const collect = (record: Record<string, unknown>[]): string[] => {
            const names = new Set<string>();
            for (const entry of record) {
                if (entry && typeof entry === "object" && "properties" in (entry as object)) {
                    const props = (entry as { properties?: Record<string, unknown> }).properties;
                    if (typeof props?.name === "string") {
                        names.add(props.name);
                    }
                }
            }
            return [...names];
        };

        const record = contextResult.records[0];

        return {
            node,
            callers: collect(record.get("callers")),
            callees: collect(record.get("callees"))
        };

    } finally {

        await session.close();
    }
}

/**
 * Returns the names of repositories that currently have a stored graph.
 */
export async function listRepositories(): Promise<string[]> {

    const session =
        neo4jDriver.session({ database });

    try {

        const result =
            await session.run(
                `
                MATCH (r:Repository)
                RETURN DISTINCT r.name AS name
                ORDER BY name
                `
            );

        return result.records.map(
            (record) => record.get("name")
        );

    } finally {

        await session.close();
    }
}

/**
 * Checks that Neo4j is reachable. Used by the health endpoint.
 */
export async function verifyConnection(): Promise<boolean> {

    try {
        await neo4jDriver.verifyConnectivity();
        return true;
    } catch (error) {
        console.warn(
            `[neo4j] Connectivity check failed: ${(error as Error).message}`
        );
        return false;
    }
}
