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

export function extractEntities(
    ast: File,
    filePath: string
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
                endLine: path.node.loc?.end.line ?? 0
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
                endLine: path.node.loc?.end.line ?? 0
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
