import * as path from "path";

import {
    NextFunction,
    Request,
    Response
} from "express";

import {
    sanitizeRepositoryName
} from "../services/ingestion.service";

import {
    createRepository,
    deleteRepository,
    listRepositoriesForUser,
    setRepositorySourceKey
} from "../services/repositories.service";

import { createJob } from "../services/jobs.service";

import {
    deleteObject,
    isR2Configured,
    objectKeyFor,
    putZip
} from "../services/storage.service";

import {
    fetchGraph,
    verifyConnection
} from "../services/graph.service";

import {
    isZipArchive,
    removeFileIfExists
} from "../utils/file.utils";

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
 * Accepts a ZIP upload and QUEUES it for asynchronous analysis (Build 07).
 *
 * Order: validate the archive → create the repository row (owned by the
 * verified user) → upload the ZIP to private R2 storage → record the object
 * key → create the analysis job → return 202 immediately. The worker does the
 * heavy lifting. Any failure rolls back what it created so no repository is
 * left permanently "queued".
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

        if (!isR2Configured()) {
            response.status(503).json({
                error:
                    "Repository storage (Cloudflare R2) is not configured on " +
                    "the server, so uploads are temporarily unavailable."
            });
            return;
        }

        const repositoryName =
            sanitizeRepositoryName(request.file.originalname);

        const repository = await createRepository(userId, repositoryName);

        const objectKey = objectKeyFor(userId, repository.id);

        try {

            await putZip(objectKey, uploadedPath);
            await setRepositorySourceKey(repository.id, userId, objectKey);

        } catch (error) {

            /* Nothing usable reached storage — roll the repository back. */
            await deleteObject(objectKey).catch(() => undefined);
            await deleteRepository(repository.id, userId).catch(() => undefined);

            throw new Error(
                `Could not store the uploaded archive: ${(error as Error).message}`
            );
        }

        let jobId: string;

        try {

            const job = await createJob(repository.id, userId);
            jobId = job.id;

        } catch (error) {

            /* Stored object and row are both orphaned — clean both up. */
            await deleteObject(objectKey).catch(() => undefined);
            await deleteRepository(repository.id, userId).catch(() => undefined);

            throw error;
        }

        response.status(202).json({
            repositoryId: repository.id,
            repositoryName: repository.name,
            jobId,
            status: "pending"
        });

    } catch (error) {

        next(error);

    } finally {

        removeFileIfExists(uploadedPath);
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
