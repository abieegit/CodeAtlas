import traverse from "@babel/traverse";

import { File, ClassMethod } from "@babel/types";

import {
    CallOccurrence,
    GraphNode,
    GraphRelationship,
    RelationshipEvidence,
    UnresolvedCall
} from "../models/graph.types";

import { resolveModule } from "./module-resolver";

import { SymbolResolver } from "./symbol.resolver";

import {
    branchContextOf,
    callableSiteOf,
    enclosingCallableId
} from "./callable";

/**
 * Everything the extractor needs to relate a parsed file back to its
 * repository: the repository-relative path (used for graph ids), the
 * physical absolute path (used for import resolution and the TypeScript
 * program) and, when available, the file's source text (used to record
 * real branch conditions).
 */
export interface RelationshipContext {
    filePath: string;
    absoluteFilePath: string;
    repositoryRoot: string;
    source?: string;
}

/**
 * Optional out-param so callers can collect calls that could not be
 * resolved, without changing the function's existing return shape.
 */
export interface RelationshipCollector {
    unresolved: UnresolvedCall[];
    /** Lines where a callable calls itself (kept out of the graph edges). */
    selfCalls: number[];
}

/** Occurrences are evidence, so each edge keeps a bounded number of them. */
const MAX_OCCURRENCES_PER_EDGE = 20;

function calleeLabel(path: { node: { callee: unknown } }): string {

    const callee = path.node.callee as {
        type?: string;
        name?: string;
        property?: { name?: string };
    };

    if (callee?.type === "Identifier") {
        return callee.name ?? "";
    }

    if (callee?.type === "MemberExpression") {
        return callee.property?.name ?? "";
    }

    return "";
}

function getMethodKey(node: ClassMethod): string | null {
    const key = node.key;
    if (key.type === "Identifier") {
        return key.name;
    }
    if (key.type === "StringLiteral") {
        return key.value;
    }
    return null;
}

function findClassEntityId(
    name: string,
    filePath: string,
    entities: GraphNode[]
): string | null {

    const sameFile = entities.find(
        (entity) =>
            entity.type === "Class" &&
            entity.name === name &&
            entity.filePath === filePath
    );

    if (sameFile) {
        return sameFile.id;
    }

    const anywhere = entities.find(
        (entity) =>
            entity.type === "Class" &&
            entity.name === name
    );

    return anywhere ? anywhere.id : null;
}

export function extractRelationships(
    ast: File,
    context: RelationshipContext,
    entities: GraphNode[],
    symbolResolver: SymbolResolver,
    collector?: RelationshipCollector
): GraphRelationship[] {

    const relationships: GraphRelationship[] = [];

    /* Source order per caller, so occurrences can be replayed in sequence. */
    const sequenceByCaller = new Map<string, number>();

    const nextSequence = (callerKey: string): number => {
        const next = (sequenceByCaller.get(callerKey) ?? 0) + 1;
        sequenceByCaller.set(callerKey, next);
        return next;
    };

    const fileId = `file:${context.filePath}`;

    const derivedEvidence = (
        line?: number | null
    ): RelationshipEvidence => ({
        filePath: context.filePath,
        line: line ?? undefined,
        resolution: "derived"
    });

    /*
     * =====================================================
     * CONTAINS relationships
     * =====================================================
     */

    traverse(ast, {

        ClassDeclaration(path) {

            const className = path.node.id?.name;

            if (!className) {
                return;
            }

            const classId =
                `class:${context.filePath}:${className}`;

            relationships.push({
                source: fileId,
                target: classId,
                type: "CONTAINS",
                evidence: derivedEvidence(path.node.loc?.start.line)
            });

            for (const node of path.node.body.body) {

                if (node.type !== "ClassMethod") {
                    continue;
                }

                const methodName = getMethodKey(node);

                if (!methodName) {
                    continue;
                }

                const methodId =
                    `method:${context.filePath}:${className}:${methodName}`;

                relationships.push({
                    source: classId,
                    target: methodId,
                    type: "CONTAINS",
                    evidence: derivedEvidence(node.loc?.start.line)
                });
            }
        },

        FunctionDeclaration(path) {

            const functionName = path.node.id?.name;

            if (!functionName) {
                return;
            }

            relationships.push({
                source: fileId,
                target: `function:${context.filePath}:${functionName}`,
                type: "CONTAINS",
                evidence: derivedEvidence(path.node.loc?.start.line)
            });
        },

        // Arrow / const function / hook-wrapped callback / object method.
        // Mirrors entity.extractor so every Function node has a containing
        // file, and CONTAINS and CALLS attribute to the same entity.
        VariableDeclarator(path) {

            const site = callableSiteOf(path.node, context.filePath);

            if (!site) {
                return;
            }

            relationships.push({
                source: fileId,
                target: site.id,
                type: "CONTAINS",
                evidence: derivedEvidence(path.node.loc?.start.line)
            });
        },

        ObjectMethod(path) {

            const site = callableSiteOf(path.node, context.filePath);

            if (!site) {
                return;
            }

            relationships.push({
                source: fileId,
                target: site.id,
                type: "CONTAINS",
                evidence: derivedEvidence(path.node.loc?.start.line)
            });
        },

        ObjectProperty(path) {

            const site = callableSiteOf(path.node, context.filePath);

            if (!site) {
                return;
            }

            relationships.push({
                source: fileId,
                target: site.id,
                type: "CONTAINS",
                evidence: derivedEvidence(path.node.loc?.start.line)
            });
        }
    });

    /*
     * =====================================================
     * IMPORTS relationships
     * =====================================================
     */

    traverse(ast, {

        ImportDeclaration(path) {

            const importPath = path.node.source.value;

            const resolved =
                resolveModule(
                    context.absoluteFilePath,
                    importPath,
                    context.repositoryRoot
                );

            if (!resolved) {
                return;
            }

            relationships.push({
                source: fileId,
                target: `file:${resolved}`,
                type: "IMPORTS",
                evidence: {
                    filePath: context.filePath,
                    line: path.node.loc?.start.line,
                    resolution: "resolved"
                }
            });
        }
    });

    /*
     * =====================================================
     * EXTENDS relationships
     *
     * Best effort: the superclass is matched by name against
     * class entities in the repository (same file first). If it
     * cannot be matched the relationship is simply omitted.
     * =====================================================
     */

    traverse(ast, {

        ClassDeclaration(path) {

            const className = path.node.id?.name;

            const superClass = path.node.superClass;

            if (!className || !superClass) {
                return;
            }

            if (superClass.type !== "Identifier") {
                return;
            }

            const targetId =
                findClassEntityId(
                    superClass.name,
                    context.filePath,
                    entities
                );

            if (!targetId) {
                return;
            }

            relationships.push({
                source: `class:${context.filePath}:${className}`,
                target: targetId,
                type: "EXTENDS",
                evidence: {
                    filePath: context.filePath,
                    line: path.node.loc?.start.line,
                    resolution: "name-match"
                }
            });
        }
    });

    /*
     * =====================================================
     * CALLS relationships
     *
     * Resolved using the TypeScript Compiler API.
     * =====================================================
     */

    traverse(ast, {

        CallExpression(path) {

            /*
             * Attribution: the innermost ADDRESSABLE callable. Anonymous
             * callbacks with no owner stop the search rather than blaming a
             * named ancestor, which previously created edges between the
             * wrong functions.
             */
            const callerId = enclosingCallableId(
                path,
                context.filePath
            );

            const line = path.node.loc?.start.line ?? 0;
            const column = path.node.loc?.start.column;

            const control = branchContextOf(path, context.source ?? "");

            const occurrence: CallOccurrence = {
                callId: `${context.filePath}:${line}:${column ?? 0}`,
                line,
                column,
                branch: control.branch,
                condition: control.condition,
                awaited: path.parent?.type === "AwaitExpression",
                sequence: nextSequence(callerId ?? fileId)
            };

            if (!callerId) {
                return;
            }

            const callStart = path.node.start;

            if (callStart === null || callStart === undefined) {
                return;
            }

            const targetId =
                symbolResolver.resolveCallFromLocation(
                    context.absoluteFilePath,
                    callStart
                );

            if (!targetId) {

                collector?.unresolved.push({
                    callerId,
                    callee: calleeLabel(path),
                    line,
                    column,
                    reason: "not-resolved"
                });

                return;
            }

            const targetExists =
                entities.some(
                    (entity) => entity.id === targetId
                );

            if (!targetExists) {

                collector?.unresolved.push({
                    callerId,
                    callee: calleeLabel(path),
                    line,
                    column,
                    reason: "target-not-in-graph"
                });

                return;
            }

            /*
             * Recursion: the graph keeps no self-loop edges (an existing,
             * tested rule), so the call is recorded as file evidence instead
             * of being silently dropped.
             */
            if (targetId === callerId) {

                collector?.selfCalls.push(line);
                return;
            }

            /*
             * One edge per caller/target (existing consumers rely on that),
             * with every concrete call site kept on the edge as an
             * occurrence so repeats and order survive.
             */
            const existing = relationships.find(
                (relationship) =>
                    relationship.type === "CALLS" &&
                    relationship.source === callerId &&
                    relationship.target === targetId
            );

            if (existing) {

                const occurrences = existing.occurrences ?? [];

                if (occurrences.length < MAX_OCCURRENCES_PER_EDGE) {
                    existing.occurrences = [...occurrences, occurrence];
                }

                return;
            }

            relationships.push({
                source: callerId,
                target: targetId,
                type: "CALLS",
                evidence: {
                    filePath: context.filePath,
                    line,
                    resolution: "resolved"
                },
                occurrences: [occurrence]
            });
        }
    });

    return relationships;
}
