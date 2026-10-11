import { GraphData } from "../models/graph.types";

import { classifyFile } from "../utils/classify.utils";

/**
 * Annotates the assembled graph with relevance information. This is a
 * VISUALISATION concern: it sets `category` (on File nodes) and
 * `inDefaultScope` (on every node) as properties. It never removes a node
 * or relationship from the graph.
 *
 * Scope rule:
 *   - a `source` file is always in scope;
 *   - any file imported, directly or transitively, by a source file is in
 *     scope (so a relevant module outside the main source directory is not
 *     lost);
 *   - a Directory is in scope when it contains an in-scope file;
 *   - the Repository is in scope when any file is in scope;
 *   - other nodes (Class/Function/Method) inherit their file's scope.
 */
export function annotateScope(graph: GraphData): GraphData {

    const fileNodes = graph.nodes.filter(
        (node) => node.type === "File"
    );

    const inScopePaths = new Set<string>();

    for (const file of fileNodes) {

        const category = classifyFile(file.filePath, file.name);

        file.category = category;

        if (category === "source") {
            inScopePaths.add(file.filePath);
        }
    }

    /*
     * IMPORTS edges are file -> file. Walk outwards from every source
     * file so imported (transitive) files are promoted into scope.
     */
    const importsFrom = new Map<string, string[]>();

    for (const relationship of graph.relationships) {

        if (relationship.type !== "IMPORTS") {
            continue;
        }

        if (
            !relationship.source.startsWith("file:") ||
            !relationship.target.startsWith("file:")
        ) {
            continue;
        }

        const from = relationship.source.slice("file:".length);
        const to = relationship.target.slice("file:".length);

        const targets = importsFrom.get(from) ?? [];
        targets.push(to);
        importsFrom.set(from, targets);
    }

    const queue = [...inScopePaths];

    while (queue.length > 0) {

        const current = queue.shift() as string;

        for (const target of importsFrom.get(current) ?? []) {
            if (!inScopePaths.has(target)) {
                inScopePaths.add(target);
                queue.push(target);
            }
        }
    }

    for (const node of graph.nodes) {

        if (node.type === "File") {
            node.inDefaultScope = inScopePaths.has(node.filePath);
            continue;
        }

        if (node.type === "Directory") {
            const prefix = node.filePath ? `${node.filePath}/` : "";
            node.inDefaultScope = [...inScopePaths].some(
                (path) => path.startsWith(prefix)
            );
            continue;
        }

        if (node.type === "Repository") {
            node.inDefaultScope = inScopePaths.size > 0;
            continue;
        }

        node.inDefaultScope = inScopePaths.has(node.filePath);
    }

    return graph;
}
