import traverse from "@babel/traverse";

import { File, ClassMethod } from "@babel/types";

import {
    GraphNode,
    GraphRelationship,
    RelationshipEvidence
} from "../models/graph.types";

import { resolveModule } from "./module-resolver";

import { SymbolResolver } from "./symbol.resolver";

/**
 * Everything the extractor needs to relate a parsed file back to its
 * repository: the repository-relative path (used for graph ids) and the
 * physical absolute path (used for import resolution and the TypeScript
 * program).
 */
export interface RelationshipContext {
    filePath: string;
    absoluteFilePath: string;
    repositoryRoot: string;
}

/**
 * True when an initializer is a function value (`() => {}` /
 * `function () {}`) assigned to a variable, mirroring entity.extractor so
 * CONTAINS and CALLS attribute to the same Function entity.
 */
function isFunctionValue(node: unknown): boolean {

    if (!node || typeof node !== "object") {
        return false;
    }

    const type = (node as { type?: string }).type;

    return (
        type === "ArrowFunctionExpression" ||
        type === "FunctionExpression"
    );
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
    symbolResolver: SymbolResolver
): GraphRelationship[] {

    const relationships: GraphRelationship[] = [];

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

        // Arrow / const function assigned to a variable (mirrors
        // entity.extractor so the Function node has a containing file).
        VariableDeclarator(path) {

            if (!isFunctionValue(path.node.init)) {
                return;
            }

            const id = path.node.id;

            if (id.type !== "Identifier") {
                return;
            }

            relationships.push({
                source: fileId,
                target: `function:${context.filePath}:${id.name}`,
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

            const callerPath = path.findParent(
                (parentPath) =>
                    parentPath.isFunctionDeclaration() ||
                    parentPath.isClassMethod() ||
                    (parentPath.isVariableDeclarator() &&
                        isFunctionValue(parentPath.node.init))
            );

            if (!callerPath) {
                return;
            }

            let callerId: string | null = null;

            if (callerPath.isFunctionDeclaration()) {

                const functionName = callerPath.node.id?.name;

                if (functionName) {
                    callerId =
                        `function:${context.filePath}:${functionName}`;
                }
            } else if (callerPath.isVariableDeclarator()) {

                const id = callerPath.node.id;

                if (id.type === "Identifier") {
                    callerId =
                        `function:${context.filePath}:${id.name}`;
                }
            } else if (callerPath.isClassMethod()) {

                const methodName = getMethodKey(callerPath.node);

                const classPath =
                    callerPath.findParent(
                        (parent) => parent.isClassDeclaration()
                    );

                const className =
                    classPath && classPath.isClassDeclaration()
                        ? classPath.node.id?.name ?? null
                        : null;

                if (methodName) {
                    callerId = className
                        ? `method:${context.filePath}:${className}:${methodName}`
                        : `method:${context.filePath}:${methodName}`;
                }
            }

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
                return;
            }

            const targetExists =
                entities.some(
                    (entity) => entity.id === targetId
                );

            if (!targetExists) {
                return;
            }

            relationships.push({
                source: callerId,
                target: targetId,
                type: "CALLS",
                evidence: {
                    filePath: context.filePath,
                    line: path.node.loc?.start.line,
                    resolution: "resolved"
                }
            });
        }
    });

    return relationships;
}
