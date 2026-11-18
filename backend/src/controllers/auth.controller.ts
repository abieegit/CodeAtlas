import { NextFunction, Request, Response } from "express";

import { supabaseAdmin } from "../database/supabase";

/**
 * GET /api/auth/me
 *
 * The authenticated user plus their profile row. Behind requireAuth, so the
 * user id always comes from a verified token, never from the request body or
 * query string.
 */
export async function getMe(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {

    const user = request.user;

    if (!user) {
        response.status(401).json({ error: "Invalid or expired token" });
        return;
    }

    try {

        const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, avatar_url, created_at, updated_at")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            throw new Error(`Could not read the profile: ${error.message}`);
        }

        response.json({
            user: {
                id: user.id,
                email: user.email ?? null
            },
            profile: data ?? null
        });

    } catch (error) {
        next(error);
    }
}
