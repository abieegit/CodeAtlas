import { NextFunction, Request, Response } from "express";

import { findRepositoryForUser } from "../services/repositories.service";

/**
 * Resolves the repository named by `?repository=<id>` and confirms the
 * authenticated user owns it BEFORE any graph is read, analysed or deleted
 * (Build 06).
 *
 * A repository that does not exist, or that belongs to another user, yields
 * the same non-disclosing 404 so ownership is never leaked. On success the
 * owned record is attached to the request as `request.repository`.
 */
export async function requireOwnedRepository(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    const userId = request.user?.id;

    if (!userId) {
        response.status(401).json({ error: "Missing bearer token" });
        return;
    }

    const repositoryId =
        typeof request.query.repository === "string"
            ? request.query.repository
            : "";

    if (repositoryId === "") {
        response.status(400).json({
            error: "The ?repository=<id> query parameter is required."
        });
        return;
    }

    try {

        const repository = await findRepositoryForUser(repositoryId, userId);

        if (!repository) {
            response.status(404).json({
                error:
                    `No stored graph was found for repository "${repositoryId}". ` +
                    "Analyze it first."
            });
            return;
        }

        request.repository = repository;
        next();

    } catch (error) {
        next(error);
    }
}
