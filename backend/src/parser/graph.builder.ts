import {
    GraphData,
    GraphNode,
    GraphRelationship
} from "../models/graph.types";

/**
 * Assembles the final graph:
 * - adds the Repository node and Directory nodes derived from file paths
 * - deduplicates nodes by id
 * - validates relationship endpoints and removes dangling relationships
 * - removes duplicate relationships
 */
export function buildGraph(
    entities: GraphNode[],
    relationships: GraphRelationship[],
    repositoryName: string
): GraphData {

    const nodeMap = new Map<string, GraphNode>();

    const repositoryId = `repository:${repositoryName}`;

    nodeMap.set(repositoryId, {
        id: repositoryId,
        type: "Repository",
        name: repositoryName,
        filePath: "",
        startLine: 0,
        endLine: 0
    });

    for (const entity of entities) {
        if (!nodeMap.has(entity.id)) {
            nodeMap.set(entity.id, entity);
        }
    }

    const derived: GraphRelationship[] = [...relationships];

    const ensureDirectory = (directoryPath: string): string => {

        const id = `directory:${directoryPath}`;

        if (!nodeMap.has(id)) {

            const segments = directoryPath.split("/");

            nodeMap.set(id, {
                id: id,
                type: "Directory",
                name: segments[segments.length - 1],
                filePath: directoryPath,
                startLine: 0,
                endLine: 0
            });
        }

        return id;
    };

    /*
     * Link the repository to its directories and files, and
     * directories to their children, using CONTAINS edges.
     */

    const fileNodes = entities.filter(
        (entity) => entity.type === "File"
    );

    for (const file of fileNodes) {

        const segments = file.filePath.split("/").filter(Boolean);

        let parentId = repositoryId;
        let currentDirectory = "";

        for (let i = 0; i < segments.length - 1; i++) {

            currentDirectory = currentDirectory
                ? `${currentDirectory}/${segments[i]}`
                : segments[i];

            const directoryId = ensureDirectory(currentDirectory);

            derived.push({
                source: parentId,
                target: directoryId,
                type: "CONTAINS"
            });

            parentId = directoryId;
        }

        derived.push({
            source: parentId,
            target: file.id,
            type: "CONTAINS"
        });
    }

    /*
     * Validate + deduplicate relationships.
     */

    const seen = new Set<string>();
    const validRelationships: GraphRelationship[] = [];

    for (const relationship of derived) {

        if (
            !nodeMap.has(relationship.source) ||
            !nodeMap.has(relationship.target)
        ) {
            continue;
        }

        if (relationship.source === relationship.target) {
            continue;
        }

        const key =
            `${relationship.source}|${relationship.type}|${relationship.target}`;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        validRelationships.push(relationship);
    }

    return {
        nodes: [...nodeMap.values()],
        relationships: validRelationships
    };
}
