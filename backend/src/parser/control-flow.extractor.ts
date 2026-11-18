import traverse from "@babel/traverse";

import { File, Node } from "@babel/types";

import { BranchKind, ControlFlowUnit } from "../models/graph.types";

import { enclosingCallableId } from "./callable";

/*
 * Bounded so one large file cannot inflate the persisted evidence.
 */
const MAX_UNITS_PER_FILE = 60;
const MAX_ENTRIES_PER_UNIT = 40;
const MAX_CONDITION_LENGTH = 120;

interface UnitAccumulator {
    id: string;
    name: string;
    branches: Array<{ kind: BranchKind; condition?: string; line: number }>;
    returns: number[];
    throws: number[];
    awaits: number[];
    loops: number[];
}

function sourceText(source: string, node: Node | null | undefined): string {

    if (!node || node.start == null || node.end == null) {
        return "";
    }

    const flat = source
        .slice(node.start, node.end)
        .replace(/\s+/g, " ")
        .trim();

    return flat.length > MAX_CONDITION_LENGTH
        ? `${flat.slice(0, MAX_CONDITION_LENGTH)}…`
        : flat;
}

/**
 * Records the control-flow shape of each addressable callable in a file:
 * which branches exist, what their source condition is, where it returns,
 * throws, awaits and loops.
 *
 * This is deliberately evidence about the SOURCE, not a claim about runtime
 * behaviour: a call inside an `if` is not proven to execute.
 */
export function extractControlFlowUnits(
    ast: File,
    filePath: string,
    source: string,
    entityIds: Set<string>
): ControlFlowUnit[] {

    const units = new Map<string, UnitAccumulator>();

    const unitFor = (nodePath: Parameters<typeof enclosingCallableId>[0]): UnitAccumulator | null => {

        const id = enclosingCallableId(nodePath, filePath);

        if (!id || !entityIds.has(id)) {
            return null;
        }

        const existing = units.get(id);

        if (existing) {
            return existing;
        }

        if (units.size >= MAX_UNITS_PER_FILE) {
            return null;
        }

        const created: UnitAccumulator = {
            id,
            name: id.split(":").pop() ?? id,
            branches: [],
            returns: [],
            throws: [],
            awaits: [],
            loops: []
        };

        units.set(id, created);

        return created;
    };

    const push = (
        unit: UnitAccumulator | null,
        field: "returns" | "throws" | "awaits" | "loops",
        line: number
    ): void => {

        if (!unit || unit[field].length >= MAX_ENTRIES_PER_UNIT) {
            return;
        }

        unit[field].push(line);
    };

    traverse(ast, {

        IfStatement(path) {

            const unit = unitFor(path);

            if (!unit || unit.branches.length >= MAX_ENTRIES_PER_UNIT) {
                return;
            }

            const test = sourceText(source, path.node.test);
            const line = path.node.loc?.start.line ?? 0;

            unit.branches.push({ kind: "if.then", condition: test, line });

            if (path.node.alternate) {
                unit.branches.push({
                    kind:
                        path.node.alternate.type === "IfStatement"
                            ? "else-if"
                            : "if.else",
                    condition: test,
                    line: path.node.alternate.loc?.start.line ?? line
                });
            }
        },

        SwitchStatement(path) {

            const unit = unitFor(path);

            if (!unit) {
                return;
            }

            for (const member of path.node.cases) {

                if (unit.branches.length >= MAX_ENTRIES_PER_UNIT) {
                    return;
                }

                const isDefault = member.test === null;

                unit.branches.push({
                    kind: isDefault ? "default" : "case",
                    condition: isDefault
                        ? undefined
                        : sourceText(source, member.test),
                    line: member.loc?.start.line ?? 0
                });
            }
        },

        ConditionalExpression(path) {

            const unit = unitFor(path);

            if (!unit || unit.branches.length >= MAX_ENTRIES_PER_UNIT) {
                return;
            }

            const condition = sourceText(source, path.node.test);
            const line = path.node.loc?.start.line ?? 0;

            unit.branches.push({
                kind: "ternary.consequent",
                condition,
                line
            });

            unit.branches.push({
                kind: "ternary.alternate",
                condition,
                line
            });
        },

        TryStatement(path) {

            const unit = unitFor(path);

            if (!unit || unit.branches.length >= MAX_ENTRIES_PER_UNIT) {
                return;
            }

            unit.branches.push({
                kind: "try",
                line: path.node.loc?.start.line ?? 0
            });

            if (path.node.handler) {
                unit.branches.push({
                    kind: "catch",
                    condition: path.node.handler.param
                        ? sourceText(source, path.node.handler.param)
                        : undefined,
                    line: path.node.handler.loc?.start.line ?? 0
                });
            }

            if (path.node.finalizer) {
                unit.branches.push({
                    kind: "finally",
                    line: path.node.finalizer.loc?.start.line ?? 0
                });
            }
        },

        ReturnStatement(path) {
            push(
                unitFor(path),
                "returns",
                path.node.loc?.start.line ?? 0
            );
        },

        ThrowStatement(path) {
            push(
                unitFor(path),
                "throws",
                path.node.loc?.start.line ?? 0
            );
        },

        AwaitExpression(path) {
            push(
                unitFor(path),
                "awaits",
                path.node.loc?.start.line ?? 0
            );
        },

        ForStatement(path) {
            push(unitFor(path), "loops", path.node.loc?.start.line ?? 0);
        },

        ForInStatement(path) {
            push(unitFor(path), "loops", path.node.loc?.start.line ?? 0);
        },

        ForOfStatement(path) {
            push(unitFor(path), "loops", path.node.loc?.start.line ?? 0);
        },

        WhileStatement(path) {
            push(unitFor(path), "loops", path.node.loc?.start.line ?? 0);
        },

        DoWhileStatement(path) {
            push(unitFor(path), "loops", path.node.loc?.start.line ?? 0);
        }
    });

    return [...units.values()];
}
