import {
    neo4jDriver,
    database
} from "../database/neo4j";

import {
    CallOccurrence,
    EntityType,
    FileWorkflowEvidence,
    GraphData,
    GraphNode,
    GraphRelationship,
    RelationshipType
} from "../models/graph.types";

import { recallGraph, rememberedRepositories } from "./graph.store";

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
 * Retrieval must never fail because of one malformed property, so evidence
 * is parsed defensively and an unusable value simply yields no evidence.
 */
const MAX_PERSISTED_EVIDENCE_CHARS = 250_000;

const EMPTY_EVIDENCE_JSON = JSON.stringify({
    routes: [],
    requests: [],
    mounts: [],
    units: [],
    unresolved: [],
    external: [],
    truncated: true
});

function serializeWorkflowEvidence(
    node: GraphNode
): string | null {

    if (!node.workflowEvidence) {
        return null;
    }

    try {

        const json = JSON.stringify(node.workflowEvidence);

        return json.length > MAX_PERSISTED_EVIDENCE_CHARS
            ? EMPTY_EVIDENCE_JSON
            : json;

    } catch {
        return null;
    }
}

function parseWorkflowEvidence(
    value: unknown
): FileWorkflowEvidence | undefined {

    if (typeof value !== "string" || value === "") {
        return undefined;
    }

    try {

        const parsed = JSON.parse(value) as Partial<FileWorkflowEvidence>;

        return {
            routes: Array.isArray(parsed.routes) ? parsed.routes : [],
            requests: Array.isArray(parsed.requests) ? parsed.requests : [],
            mounts: Array.isArray(parsed.mounts) ? parsed.mounts : [],
            units: Array.isArray(parsed.units) ? parsed.units : [],
            unresolved: Array.isArray(parsed.unresolved)
                ? parsed.unresolved
                : [],
            selfCalls: Array.isArray(parsed.selfCalls) ? parsed.selfCalls : [],
            external: Array.isArray(parsed.external) ? parsed.external : [],
            truncated: parsed.truncated === true
        };

    } catch {
        return undefined;
    }
}

function parseOccurrences(value: unknown): CallOccurrence[] | undefined {

    if (typeof value !== "string" || value === "") {
        return undefined;
    }

    try {

        const parsed = JSON.parse(value);

        return Array.isArray(parsed) ? (parsed as CallOccurrence[]) : undefined;

    } catch {
        return undefined;
    }
}

/**
 * Persists a repository graph to Neo4j. Any previously stored graph for
 * the same repository is replaced, so re-analyzing is idempotent while
 * other repositories are left untouched.
 */
export async function saveGraph(
    graph: GraphData,
    repositoryId: string
): Promise<void> {

    const session =
        neo4jDriver.session({ database });

    try {

        await session.run(
            `
            MATCH (n:Entity {repository: $repository})
            DETACH DELETE n
            `,
            { repository: repositoryId }
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
                        isAsync: $isAsync,
                        isExported: $isExported,
                        workflowEvidence: $workflowEvidence,
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
                    isAsync: node.async ?? null,
                    isExported: node.exported ?? null,
                    workflowEvidence: serializeWorkflowEvidence(node),
                    repository: repositoryId
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
                    resolution: $resolution,
                    occurrences: $occurrences
                }]->(target)
                `,
                {
                    source: relationship.source,
                    target: relationship.target,
                    repository: repositoryId,
                    line: relationship.evidence?.line ?? null,
                    filePath: relationship.evidence?.filePath ?? null,
                    resolution: relationship.evidence?.resolution ?? null,
                    occurrences: relationship.occurrences
                        ? JSON.stringify(relationship.occurrences)
                        : null
                }
            );
        }

    } finally {

        await session.close();
    }
}

/**
 * Reads a graph back out of Neo4j, falling back to the in-memory store when
 * the database is unavailable (or holds nothing). This is what lets the
 * report, summary and workflow features work even when persistence was
 * skipped because Neo4j was down.
 */
export async function fetchGraph(
    repositoryId?: string
): Promise<GraphData> {

    try {

        const graph = await fetchGraphFromNeo4j(repositoryId);

        if (graph.nodes.length > 0) {
            return graph;
        }

    } catch (error) {

        console.warn(
            `[graph] Neo4j read failed, using the in-memory graph: ${(error as Error).message}`
        );
    }

    return recallGraph(repositoryId) ?? { nodes: [], relationships: [] };
}

/**
 * Reads a graph back out of Neo4j. When `repositoryId` is omitted the
 * whole (single-repository) graph is returned.
 */
async function fetchGraphFromNeo4j(
    repositoryId?: string
): Promise<GraphData> {

    const session =
        neo4jDriver.session({ database });

    try {

        const nodeResult =
            await session.run(
                repositoryId
                    ? `MATCH (n:Entity {repository: $repository}) RETURN n`
                    : `MATCH (n:Entity) RETURN n`,
                repositoryId
                    ? { repository: repositoryId }
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

                if (properties.isAsync === true) {
                    node.async = true;
                }

                if (properties.isExported === true) {
                    node.exported = true;
                }

                const evidence = parseWorkflowEvidence(
                    properties.workflowEvidence
                );

                if (evidence) {
                    node.workflowEvidence = evidence;
                }

                return node;
            });

        const relationshipResult =
            await session.run(
                repositoryId
                    ? `
                        MATCH (a:Entity {repository: $repository})-[r]->(b:Entity {repository: $repository})
                        RETURN a.id AS source, type(r) AS type, b.id AS target,
                               r.line AS line, r.filePath AS filePath, r.resolution AS resolution,
                               r.occurrences AS occurrences
                       `
                    : `
                        MATCH (a:Entity)-[r]->(b:Entity)
                        RETURN a.id AS source, type(r) AS type, b.id AS target,
                               r.line AS line, r.filePath AS filePath, r.resolution AS resolution,
                               r.occurrences AS occurrences
                       `,
                repositoryId
                    ? { repository: repositoryId }
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

                const occurrences = parseOccurrences(
                    record.get("occurrences")
                );

                if (occurrences) {
                    relationship.occurrences = occurrences;
                }

                return relationship;
            });

        return { nodes, relationships };

    } finally {

        await session.close();
    }
}

/**
 * Builds the node + direct CALLS context from the in-memory graph.
 */
function functionContextFromMemory(
    repositoryId: string,
    nodeId: string
): { node: GraphNode; callers: string[]; callees: string[] } | null {

    const graph = recallGraph(repositoryId);

    if (!graph) {
        return null;
    }

    const node = graph.nodes.find((entry) => entry.id === nodeId);

    if (!node) {
        return null;
    }

    const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));

    const callers = new Set<string>();
    const callees = new Set<string>();

    for (const relationship of graph.relationships) {

        if (relationship.type !== "CALLS") {
            continue;
        }

        if (relationship.target === nodeId) {
            const caller = byId.get(relationship.source);
            if (caller) {
                callers.add(caller.name);
            }
        }

        if (relationship.source === nodeId) {
            const callee = byId.get(relationship.target);
            if (callee) {
                callees.add(callee.name);
            }
        }
    }

    return { node, callers: [...callers], callees: [...callees] };
}

/**
 * Returns one node plus its direct CALLS context (who calls it, what it
 * calls) for the function-summary feature. Falls back to the in-memory
 * graph when Neo4j is unavailable. Null when the node does not exist.
 */
export async function fetchFunctionContext(
    repositoryId: string,
    nodeId: string
): Promise<{
    node: GraphNode;
    callers: string[];
    callees: string[];
} | null> {

    try {

        const context = await fetchFunctionContextFromNeo4j(
            repositoryId,
            nodeId
        );

        if (context) {
            return context;
        }

    } catch (error) {

        console.warn(
            `[graph] Neo4j function-context read failed, using memory: ${(error as Error).message}`
        );
    }

    return functionContextFromMemory(repositoryId, nodeId);
}

/**
 * Returns one node plus its direct CALLS context (who calls it, what it
 * calls) for the function-summary feature. Null when the node does not
 * exist in the repository.
 */
async function fetchFunctionContextFromNeo4j(
    repositoryId: string,
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
                { repository: repositoryId, nodeId }
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
                { repository: repositoryId, nodeId }
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
 * Returns the names of repositories that currently have a stored graph,
 * falling back to the in-memory store when Neo4j is unavailable.
 */
export async function listRepositories(): Promise<string[]> {

    try {

        const repositories = await listRepositoriesFromNeo4j();

        if (repositories.length > 0) {
            return repositories;
        }

    } catch (error) {

        console.warn(
            `[graph] Neo4j repository list failed, using memory: ${(error as Error).message}`
        );
    }

    return rememberedRepositories();
}

/**
 * Returns the names of repositories that currently have a stored graph.
 */
async function listRepositoriesFromNeo4j(): Promise<string[]> {

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
