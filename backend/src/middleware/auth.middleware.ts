import { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../services/auth.service";

/**
 * Requires a valid Supabase access token (Build 06). A missing, malformed,
 * invalid or expired token is rejected with 401. On success the verified
 * user is attached to the request as `request.user`.
 *
 * This is the only place a request is authenticated; verification itself
 * lives in auth.service.
 */
export async function requireAuth(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    const header = request.headers.authorization;

    if (!header || !header.toLowerCase().startsWith("bearer ")) {
        response.status(401).json({ error: "Missing bearer token" });
        return;
    }

    const token = header.slice("bearer ".length).trim();

    if (token === "") {
        response.status(401).json({ error: "Missing bearer token" });
        return;
    }

    const user = await verifyAccessToken(token);

    if (!user) {
        response.status(401).json({ error: "Invalid or expired token" });
        return;
    }

    request.user = user;
    next();
}
