import * as fs from "fs";
import * as path from "path";

import { File } from "@babel/types";

import {
    findSourceFiles
} from "./repository.service";

import {
    parseFile
} from "../parser/ast.parser";

import {
    extractEntities
} from "../parser/entity.extractor";

import {
    extractRelationships,
    RelationshipCollector,
    RelationshipContext
} from "../parser/relationship.extractor";

import {
    buildGraph
} from "../parser/graph.builder";

import {
    annotateScope
} from "./scope.service";

import {
    createSymbolResolver
} from "../parser/symbol.resolver";

import { resolveModule } from "../parser/module-resolver";

import { extractControlFlowUnits } from "../parser/control-flow.extractor";

import { extractBoundaries } from "../parser/boundary.extractor";

import {
    GraphData,
    GraphNode,
    GraphRelationship,
    UnresolvedCall
} from "../models/graph.types";

interface ParsedFile {
    context: RelationshipContext;
    ast: File;
    source: string;
    unresolved: UnresolvedCall[];
    selfCalls: number[];
}

/**
 * Analyzes a repository and returns its knowledge graph.
 *
 * Physical filesystem paths are kept separate from the
 * repository-relative paths used in graph ids. A single unparsable
 * file is skipped rather than aborting the whole analysis.
 */
export function analyzeRepository(
    repositoryPath: string,
    repositoryName?: string
): GraphData {

    const repositoryRoot = path.resolve(repositoryPath);
    const resolvedRepositoryName =
        repositoryName ?? path.basename(repositoryRoot);

    const relativeFiles = findSourceFiles(repositoryRoot);

    const allEntities: GraphNode[] = [];
    const parsedFiles: ParsedFile[] = [];

    /*
     * ------------------------------------------------
     * PHASE 1 / 2
     * Parse repository files
     * ------------------------------------------------
     */

    for (const relativeFile of relativeFiles) {

        const absoluteFilePath =
            path.resolve(
                path.join(repositoryRoot, relativeFile)
            );

        try {

            const ast = parseFile(absoluteFilePath);

            /*
             * Function entities capture a compact source snippet so the
             * analysis features can describe the real implementation
             * without the uploaded ZIP.
             */
            const source = fs.readFileSync(absoluteFilePath, "utf8");

            allEntities.push(
                ...extractEntities(ast, relativeFile, source)
            );

            parsedFiles.push({
                context: {
                    filePath: relativeFile,
                    absoluteFilePath,
                    repositoryRoot,
                    source
                },
                ast,
                source,
                unresolved: [],
                selfCalls: []
            });

        } catch (error) {

            console.warn(
                `[analysis] Skipping ${relativeFile}: ${(error as Error).message}`
            );
        }
    }

    /*
     * ------------------------------------------------
     * PHASE 2
     * Build the TypeScript program for symbol resolution
     * ------------------------------------------------
     */

    const absoluteSourceFiles = parsedFiles.map(
        (parsedFile) => parsedFile.context.absoluteFilePath
    );

    const symbolResolver =
        createSymbolResolver(
            repositoryRoot,
            absoluteSourceFiles
        );

    /*
     * ------------------------------------------------
     * PHASE 3
     * Extract relationships
     * ------------------------------------------------
     */

    const allRelationships: GraphRelationship[] = [];

    for (const parsedFile of parsedFiles) {

        const collector: RelationshipCollector = {
            unresolved: parsedFile.unresolved,
            selfCalls: parsedFile.selfCalls
        };

        try {

            allRelationships.push(
                ...extractRelationships(
                    parsedFile.ast,
                    parsedFile.context,
                    allEntities,
                    symbolResolver,
                    collector
                )
            );

        } catch (error) {

            console.warn(
                `[analysis] Relationship extraction failed for ${parsedFile.context.filePath}: ${(error as Error).message}`
            );
        }
    }

    /*
     * ------------------------------------------------
     * PHASE 3b
     * Workflow evidence (control flow + HTTP boundaries)
     *
     * Attached to File nodes as a bounded property so no new
     * node or relationship type enters the graph, and every
     * existing consumer keeps working unchanged.
     * ------------------------------------------------
     */

    const callableIds = new Set(
        allEntities
            .filter(
                (entity) =>
                    entity.type === "Function" || entity.type === "Method"
            )
            .map((entity) => entity.id)
    );

    const nodesById = new Map(
        allEntities.map((entity) => [entity.id, entity])
    );

    for (const parsedFile of parsedFiles) {

        const fileNode = nodesById.get(
            `file:${parsedFile.context.filePath}`
        );

        if (!fileNode) {
            continue;
        }

        try {

            const boundaries = extractBoundaries(
                parsedFile.ast,
                parsedFile.context.filePath,
                {
                    entityIds: callableIds,
                    resolveImport: (specifier: string) =>
                        resolveModule(
                            parsedFile.context.absoluteFilePath,
                            specifier,
                            parsedFile.context.repositoryRoot
                        )
                }
            );

            fileNode.workflowEvidence = {
                routes: boundaries.routes,
                requests: boundaries.requests,
                mounts: boundaries.mounts,
                units: extractControlFlowUnits(
                    parsedFile.ast,
                    parsedFile.context.filePath,
                    parsedFile.source,
                    callableIds
                ),
                unresolved: parsedFile.unresolved,
                selfCalls: parsedFile.selfCalls,
                external: boundaries.external,
                truncated: boundaries.truncated
            };

        } catch (error) {

            console.warn(
                `[analysis] Workflow evidence failed for ${parsedFile.context.filePath}: ${(error as Error).message}`
            );
        }
    }

    /*
     * ------------------------------------------------
     * PHASE 4
     * Validate + assemble the final graph
     * ------------------------------------------------
     */

    return annotateScope(
        buildGraph(
            allEntities,
            allRelationships,
            resolvedRepositoryName
        )
    );
}
