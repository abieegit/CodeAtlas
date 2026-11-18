import { NodePath } from "@babel/traverse";

import {
    Function as BabelFunction,
    Node,
    ObjectMethod,
    ObjectProperty,
    VariableDeclarator
} from "@babel/types";

import { BranchKind } from "../models/graph.types";

/**
 * Hooks that return the function passed to them, so the variable name is a
 * real, addressable callable. Deliberately narrow: not every callback passed
 * to every API becomes an entity.
 */
const CALLBACK_HOOKS = new Set(["useCallback", "useMemo"]);

/** Conditions are evidence for a label, so they are kept short. */
const MAX_CONDITION_LENGTH = 120;

export interface CallableSite {
    id: string;
    name: string;
    fn: BabelFunction;
    isAsync: boolean;
}

export interface BranchContext {
    branch: BranchKind;
    condition?: string;
    line?: number;
}

function isFunctionNode(node: unknown): node is BabelFunction {

    const type = (node as { type?: string } | null | undefined)?.type;

    return (
        type === "ArrowFunctionExpression" ||
        type === "FunctionExpression" ||
        type === "FunctionDeclaration"
    );
}

/**
 * Exact source text of a node, sliced by its byte offsets. Used for branch
 * conditions so the recorded text is the real condition, not a rendering.
 */
function nodeSource(source: string, node: Node | null | undefined): string {

    if (!node || node.start == null || node.end == null) {
        return "";
    }

    return source
        .slice(node.start, node.end)
        .replace(/\s+/g, " ")
        .trim();
}

function shorten(text: string): string | undefined {

    if (text === "") {
        return undefined;
    }

    return text.length > MAX_CONDITION_LENGTH
        ? `${text.slice(0, MAX_CONDITION_LENGTH)}…`
        : text;
}

/**
 * True when `path` lives inside the given AST node. Used instead of
 * `NodePath.contains`, which is not part of Babel's public typing.
 */
function isWithin(
    container: Node | null | undefined,
    path: NodePath
): boolean {

    if (!container) {
        return false;
    }

    let current: NodePath | null = path;

    while (current) {

        if (current.node === container) {
            return true;
        }

        current = current.parentPath;
    }

    return false;
}

/**
 * The function value behind a variable initializer: a direct
 * `const x = () => {}` / `const x = function () {}`, or a callback handed to
 * a known hook (`const x = useCallback(() => {}, [])`).
 */
export function functionValueOfInitializer(
    init: Node | null | undefined
): BabelFunction | null {

    if (!init) {
        return null;
    }

    if (isFunctionNode(init)) {
        return init;
    }

    if (init.type === "CallExpression") {

        const callee = init.callee;
        const first = init.arguments[0];

        if (
            callee.type === "Identifier" &&
            CALLBACK_HOOKS.has(callee.name) &&
            first &&
            first.type !== "SpreadElement" &&
            isFunctionNode(first)
        ) {
            return first;
        }
    }

    return null;
}

function propertyKeyName(node: ObjectMethod | ObjectProperty): string | null {

    const key = node.key;

    if (key.type === "Identifier") {
        return key.name;
    }

    if (key.type === "StringLiteral") {
        return key.value;
    }

    return null;
}

/**
 * A callable declared by one AST node, using the project's existing id
 * scheme (`function:<file>:<Name>`, `method:<file>:<Class>:<Name>`).
 * Returns null for anything that is not an addressable callable, so no
 * invented identifier can reach the graph.
 */
export function callableSiteOf(
    node:
        | VariableDeclarator
        | ObjectMethod
        | ObjectProperty
        | null
        | undefined,
    filePath: string,
    className?: string | null
): CallableSite | null {

    if (!node) {
        return null;
    }

    if (node.type === "VariableDeclarator") {

        const fn = functionValueOfInitializer(node.init);
        const name = node.id.type === "Identifier" ? node.id.name : null;

        if (!fn || !name) {
            return null;
        }

        return {
            id: `function:${filePath}:${name}`,
            name,
            fn,
            isAsync: Boolean(fn.async)
        };
    }

    if (node.type === "ObjectMethod") {

        const name = propertyKeyName(node);

        if (!name) {
            return null;
        }

        return className
            ? {
                  id: `method:${filePath}:${className}:${name}`,
                  name,
                  fn: node,
                  isAsync: Boolean(node.async)
              }
            : {
                  id: `function:${filePath}:${name}`,
                  name,
                  fn: node,
                  isAsync: Boolean(node.async)
              };
    }

    if (node.type === "ObjectProperty" && isFunctionNode(node.value)) {

        const name = propertyKeyName(node);

        if (!name) {
            return null;
        }

        return {
            id: `function:${filePath}:${name}`,
            name,
            fn: node.value,
            isAsync: Boolean(node.value.async)
        };
    }

    return null;
}

/**
 * The callable that lexically contains a node, or null when there is no
 * addressable one.
 *
 * This replaces the previous behaviour, which recognised only named
 * declarations: calls written inside an anonymous callback (for example a
 * `useCallback` body) were attributed to the nearest named ancestor, which
 * produced genuine edges between the wrong functions. Anonymous callbacks
 * with no addressable owner now stop the search instead of guessing.
 */
export function enclosingCallableId(
    path: NodePath,
    filePath: string
): string | null {

    let current: NodePath | null = path.parentPath;

    while (current) {

        if (current.isFunctionDeclaration()) {
            const name = current.node.id?.name;
            return name ? `function:${filePath}:${name}` : null;
        }

        if (current.isClassMethod()) {

            const name = propertyKeyName(
                current.node as unknown as ObjectMethod
            );

            if (!name) {
                return null;
            }

            const classPath = current.findParent((parent) =>
                parent.isClassDeclaration()
            );

            const className =
                classPath && classPath.isClassDeclaration()
                    ? classPath.node.id?.name ?? null
                    : null;

            return className
                ? `method:${filePath}:${className}:${name}`
                : `method:${filePath}:${name}`;
        }

        if (current.isObjectMethod() || current.isObjectProperty()) {
            const site = callableSiteOf(current.node, filePath);

            if (site) {
                return site.id;
            }
        }

        if (current.isVariableDeclarator()) {

            const site = callableSiteOf(current.node, filePath);

            if (site) {
                return site.id;
            }

            /*
             * A plain `const value = compute(...)` declarator is not itself a
             * callable, so the search must keep going outward. Stopping here
             * would drop attribution for every call written inside a
             * variable initializer.
             */
        }

        if (
            current.isArrowFunctionExpression() ||
            current.isFunctionExpression()
        ) {

            const parent = current.parentPath;

            const site =
                parent && (parent.isVariableDeclarator() || parent.isObjectProperty())
                    ? callableSiteOf(parent.node as VariableDeclarator | ObjectProperty, filePath)
                    : null;

            /*
             * A hook-wrapped callback (`const x = useCallback(() => …)`) is
             * owned by the declarator two levels up.
             */
            if (site) {
                return site.id;
            }

            if (parent?.isCallExpression()) {
                const owner = parent.parentPath;

                if (owner?.isVariableDeclarator()) {
                    const hooked = callableSiteOf(owner.node, filePath);

                    if (hooked) {
                        return hooked.id;
                    }
                }
            }

            return null;
        }

        current = current.parentPath;
    }

    return null;
}

/** True when any ancestor declaration is exported. */
export function isExportedPath(path: NodePath): boolean {

    let current: NodePath | null = path.parentPath;

    while (current && !current.isProgram()) {

        if (
            current.isExportNamedDeclaration() ||
            current.isExportDefaultDeclaration()
        ) {
            return true;
        }

        current = current.parentPath;
    }

    return false;
}

/**
 * The nearest enclosing branch/loop of a node, up to its callable boundary,
 * with that branch's real condition text where one exists.
 */
export function branchContextOf(
    path: NodePath,
    source: string
): BranchContext {

    let current: NodePath | null = path.parentPath;

    while (current) {

        if (
            current.isFunctionDeclaration() ||
            current.isFunctionExpression() ||
            current.isArrowFunctionExpression() ||
            current.isClassMethod() ||
            current.isObjectMethod()
        ) {
            break;
        }

        if (current.isIfStatement()) {

            const test = shorten(nodeSource(source, current.node.test));
            const line = current.node.loc?.start.line;

            /*
             * Which side of this `if` does the call live on? An `else if`
             * chain parses as a nested IfStatement inside the alternate, so
             * the nested statement is reached first and its own consequent
             * is labelled `else-if`.
             */
            if (isWithin(current.node.alternate, path)) {
                return { branch: "if.else", condition: test, line };
            }

            const parentIf = current.parentPath;
            const isElseIf =
                parentIf?.isIfStatement() === true &&
                parentIf.node.alternate === current.node;

            return {
                branch: isElseIf ? "else-if" : "if.then",
                condition: test,
                line
            };
        }

        if (current.isSwitchCase()) {

            const isDefault = current.node.test === null;

            return {
                branch: isDefault ? "default" : "case",
                condition: isDefault
                    ? undefined
                    : shorten(nodeSource(source, current.node.test)),
                line: current.node.loc?.start.line
            };
        }

        if (current.isConditionalExpression()) {

            const isConsequent = isWithin(current.node.consequent, path);

            return {
                branch: isConsequent
                    ? "ternary.consequent"
                    : "ternary.alternate",
                condition: shorten(nodeSource(source, current.node.test)),
                line: current.node.loc?.start.line
            };
        }

        if (current.isCatchClause()) {
            return {
                branch: "catch",
                condition: current.node.param
                    ? shorten(nodeSource(source, current.node.param))
                    : undefined,
                line: current.node.loc?.start.line
            };
        }

        if (current.isTryStatement()) {

            if (isWithin(current.node.finalizer, path)) {
                return {
                    branch: "finally",
                    line: current.node.loc?.start.line
                };
            }

            return { branch: "try", line: current.node.loc?.start.line };
        }

        if (
            current.isForStatement() ||
            current.isForInStatement() ||
            current.isForOfStatement() ||
            current.isWhileStatement() ||
            current.isDoWhileStatement()
        ) {
            return {
                branch: "loop",
                condition: shorten(
                    nodeSource(
                        source,
                        (current.node as { left?: Node; test?: Node }).test ??
                            (current.node as { right?: Node }).right
                    )
                ),
                line: current.node.loc?.start.line
            };
        }

        current = current.parentPath;
    }

    return { branch: "unconditional" };
}
