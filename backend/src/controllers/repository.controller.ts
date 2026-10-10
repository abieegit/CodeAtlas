import * as path from "path";

import {
    NextFunction,
    Request,
    Response
} from "express";

import {
    extractZip
} from "../services/ingestion.service";

import {
    analyzeAndStore
} from "../services/parser.service";

import {
    fetchGraph,
    listRepositories,
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
 * Accepts a ZIP upload, extracts it, analyzes the repository and
 * persists the resulting graph to Neo4j.
 */
export async function analyzeRepositoryUpload(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

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

        let extracted;

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

        const result =
            await analyzeAndStore(
                extracted.repositoryPath,
                extracted.repositoryName
            );

        response.status(201).json({
            repository: extracted.repositoryName,
            persisted: result.persisted,
            nodeCount: result.graph.nodes.length,
            relationshipCount: result.graph.relationships.length,
            graph: result.graph
        });

    } catch (error) {

        next(error);

    } finally {

        removeFileIfExists(uploadedPath);
    }
}

/**
 * Returns a stored graph. Optionally filtered to a single repository
 * via ?repository=<name>.
 */
export async function getGraph(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        const repository =
            typeof request.query.repository === "string"
                ? request.query.repository
                : undefined;

        const graph = await fetchGraph(repository);

        response.json(graph);

    } catch (error) {

        next(error);
    }
}

export async function getRepositories(
    _request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    try {

        response.json({
            repositories: await listRepositories()
        });

    } catch (error) {

        next(error);
    }
}
