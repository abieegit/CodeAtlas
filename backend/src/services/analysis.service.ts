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

import {
    GraphData,
    GraphNode,
    GraphRelationship
} from "../models/graph.types";

interface ParsedFile {
    context: RelationshipContext;
    ast: File;
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

            allEntities.push(
                ...extractEntities(ast, relativeFile)
            );

            parsedFiles.push({
                context: {
                    filePath: relativeFile,
                    absoluteFilePath,
                    repositoryRoot
                },
                ast
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

        try {

            allRelationships.push(
                ...extractRelationships(
                    parsedFile.ast,
                    parsedFile.context,
                    allEntities,
                    symbolResolver
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
