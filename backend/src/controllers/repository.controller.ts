import * as path from "path";

import {
    NextFunction,
    Request,
    Response
} from "express";

import {
    extractZip,
    ExtractedRepository
} from "../services/ingestion.service";

import {
    analyzeAndStore
} from "../services/parser.service";

import {
    fetchGraph,
    verifyConnection
} from "../services/graph.service";

import {
    createRepository,
    listRepositoriesForUser,
    updateRepositoryOutcome
} from "../services/repositories.service";

import {
    isZipArchive,
    removeDirectoryIfExists,
    removeFileIfExists
} from "../utils/file.utils";

import {
    env
} from "../config/env";

export async function health(
    _request: Request,
    response: Response
): Promise<void> {

    const neo4j = await verifyConnection();

    response.json({
        status: "ok",
        neo4j
    });
}

/**
 * Accepts a ZIP upload, extracts it, analyzes the repository and
 * persists the resulting graph to Neo4j.
 *
 * Build 06: the repository row is created first (owned by the verified
 * user), the id becomes the unique graph/cache key, and the row's status and
 * counts are updated when the analysis finishes.
 */
export async function analyzeRepositoryUpload(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    const userId = request.user?.id;

    if (!userId) {
        response.status(401).json({ error: "Missing bearer token" });
        return;
    }

    if (!request.file) {
        response.status(400).json({
            error: "No archive uploaded. Send a ZIP file in the 'file' field."
        });
        return;
    }

    const uploadedPath = request.file.path;

    let extracted: ExtractedRepository | undefined;

    try {

        const isZipName =
            path.extname(request.file.originalname).toLowerCase() === ".zip";

        if (!isZipName || !isZipArchive(uploadedPath)) {
            response.status(400).json({
                error:
                    "Only ZIP archives are supported. Please compress your " +
                    "project as a .zip file (not .rar or .7z) and try again."
            });
            return;
        }

        try {

            extracted = await extractZip(
                uploadedPath,
                request.file.originalname
            );

        } catch (error) {

            response.status(400).json({
                error:
                    `Could not read the ZIP archive: ${(error as Error).message}`
            });
            return;
        }

        const repository = await createRepository(
            userId,
            extracted.repositoryName
        );

        let result;

        try {

            result = await analyzeAndStore(
                extracted.repositoryPath,
                extracted.repositoryName,
                repository.id
            );

        } catch (error) {

            try {
                await updateRepositoryOutcome(repository.id, userId, {
                    status: "failed"
                });
            } catch (updateError) {
                console.warn(
                    `[repository] Could not mark ${repository.id} as failed: ${
                        (updateError as Error).message
                    }`
                );
            }

            throw error;
        }

        const categoryCounts: Record<string, number> = {};

        for (const node of result.graph.nodes) {
            if (node.type === "File" && node.category) {
                categoryCounts[node.category] =
                    (categoryCounts[node.category] ?? 0) + 1;
            }
        }

        await updateRepositoryOutcome(repository.id, userId, {
            status: "completed",
            graphPersisted: result.persisted,
            nodeCount: result.graph.nodes.length,
            relationshipCount: result.graph.relationships.length
        });

        response.status(201).json({
            repository: extracted.repositoryName,
            repositoryId: repository.id,
            status: "completed",
            persisted: result.persisted,
            nodeCount: result.graph.nodes.length,
            relationshipCount: result.graph.relationships.length,
            categoryCounts,
            graph: result.graph
        });

    } catch (error) {

        next(error);

    } finally {

        removeFileIfExists(uploadedPath);

        if (extracted && !env.keepExtracted) {
            removeDirectoryIfExists(extracted.extractionDir);
        }
    }
}

/**
 * Returns the stored graph of one repository the caller owns.
 * Ownership is enforced by requireOwnedRepository before this runs.
 */
export async function getGraph(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const repository = request.repository;

        if (!repository) {
            response.status(404).json({
                error: "No stored graph was found. Analyze it first."
            });
            return;
        }

        const graph = await fetchGraph(repository.id);

        response.json(graph);

    } catch (error) {

        next(error);
    }
}

/**
 * Lists the repositories owned by the authenticated user.
 */
export async function getRepositories(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const userId = request.user?.id;

        if (!userId) {
            response.status(401).json({ error: "Missing bearer token" });
            return;
        }

        const repositories = await listRepositoriesForUser(userId);

        response.json({
            repositories: repositories.map((entry) => ({
                id: entry.id,
                name: entry.name,
                status: entry.status,
                graphPersisted: entry.graph_persisted,
                nodeCount: entry.node_count,
                relationshipCount: entry.relationship_count,
                createdAt: entry.created_at,
                updatedAt: entry.updated_at
            }))
        });

    } catch (error) {

        next(error);
    }
}
