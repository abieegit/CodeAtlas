import traverse from "@babel/traverse";
import { File } from "@babel/types";

import {
    GraphNode
} from "../models/graph.types";

/**
 * True when an initializer is a function value assigned to a variable,
 * i.e. `const x = () => {}` or `const x = function () {}`. These are
 * emitted as Function entities so modern JS/TS codebases are represented
 * (a large share of functions in real repos are declared this way).
 */
function isFunctionValue(
    node: unknown
): boolean {

    if (!node || typeof node !== "object") {
        return false;
    }

    const type = (node as { type?: string }).type;

    return (
        type === "ArrowFunctionExpression" ||
        type === "FunctionExpression"
    );
}

/**
 * Maximum characters of source text captured per Function entity. Long
 * function bodies are truncated; the summary feature only needs the
 * signature and the opening logic.
 */
const SOURCE_SNIPPET_MAX_LENGTH = 700;

/**
 * Whitespace-collapsed, truncated source text for a node's byte range.
 */
function sourceSnippetOf(
    source: string | undefined,
    node:
        | {
              start?: number | null;
              end?: number | null;
          }
        | null
        | undefined
): string | undefined {

    if (
        source === undefined ||
        !node ||
        node.start === null ||
        node.start === undefined ||
        node.end === null ||
        node.end === undefined
    ) {
        return undefined;
    }

    const snippet = source
        .slice(node.start, node.end)
        .replace(/\s+/g, " ")
        .trim();

    if (snippet.length === 0) {
        return undefined;
    }

    return snippet.length > SOURCE_SNIPPET_MAX_LENGTH
        ? `${snippet.slice(0, SOURCE_SNIPPET_MAX_LENGTH)}…`
        : snippet;
}

export function extractEntities(
    ast: File,
    filePath: string,
    source?: string
): GraphNode[] {

    const nodes: GraphNode[] = [];

    // ---------------------------------------------
    // FILE
    // ---------------------------------------------

    nodes.push({
        id: `file:${filePath}`,
        type: "File",
        name: filePath.split(/[\\/]/).pop() ?? filePath,
        filePath: filePath,
        startLine: 1,
        endLine: ast.loc?.end.line ?? 0
    });

    // ---------------------------------------------
    // AST TRAVERSAL
    // ---------------------------------------------

    traverse(ast, {

        // -----------------------------------------
        // CLASS
        // -----------------------------------------

        ClassDeclaration(path) {

            const name = path.node.id?.name;

            if (!name) {
                return;
            }

            nodes.push({
                id: `class:${filePath}:${name}`,
                type: "Class",
                name: name,
                filePath: filePath,
                startLine: path.node.loc?.start.line ?? 0,
                endLine: path.node.loc?.end.line ?? 0
            });
        },

        // -----------------------------------------
        // FUNCTION
        // -----------------------------------------

        FunctionDeclaration(path) {

            const name = path.node.id?.name;

            if (!name) {
                return;
            }

            nodes.push({
                id: `function:${filePath}:${name}`,
                type: "Function",
                name: name,
                filePath: filePath,
                startLine: path.node.loc?.start.line ?? 0,
                endLine: path.node.loc?.end.line ?? 0,
                sourceSnippet: sourceSnippetOf(source, path.node)
            });
        },

        // -----------------------------------------
        // ARROW / CONST FUNCTION
        //
        // `const name = () => {}` and
        // `const name = function () {}` are
        // emitted as Function entities with the
        // same id scheme as declarations, so call
        // edges can attribute to and from them.
        // -----------------------------------------

        VariableDeclarator(path) {

            if (!isFunctionValue(path.node.init)) {
                return;
            }

            const id = path.node.id;

            if (id.type !== "Identifier") {
                return;
            }

            nodes.push({
                id: `function:${filePath}:${id.name}`,
                type: "Function",
                name: id.name,
                filePath: filePath,
                startLine: path.node.loc?.start.line ?? 0,
                endLine: path.node.loc?.end.line ?? 0,
                sourceSnippet: sourceSnippetOf(source, path.node.init)
            });
        },

        // -----------------------------------------
        // CLASS METHOD
        //
        // Method ids are qualified with the
        // enclosing class name so that two
        // classes in the same file may declare
        // methods with the same name without
        // colliding in the graph.
        // -----------------------------------------

        ClassMethod(path) {

            const key = path.node.key;

            let name = "";

            if (key.type === "Identifier") {
                name = key.name;
            } else if (key.type === "StringLiteral") {
                name = key.value;
            }

            if (!name) {
                return;
            }

            const classPath =
                path.findParent(
                    (parent) =>
                        parent.isClassDeclaration()
                );

            let className: string | null = null;

            if (
                classPath &&
                classPath.isClassDeclaration()
            ) {
                className =
                    classPath.node.id?.name ?? null;
            }

            const methodId =
                className
                    ? `method:${filePath}:${className}:${name}`
                    : `method:${filePath}:${name}`;

            nodes.push({
                id: methodId,
                type: "Method",
                name: name,
                filePath: filePath,
                startLine: path.node.loc?.start.line ?? 0,
                endLine: path.node.loc?.end.line ?? 0
            });
        }
    });

    return nodes;
}
