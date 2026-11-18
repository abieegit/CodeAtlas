import { supabaseAdmin } from "../database/supabase";

export interface AuthenticatedUser {
    id: string;
    email?: string;
}

/*
 * Verifies a Supabase access token using the SDK's supported server-side
 * check (auth.getUser). Returns the user, or null when the token is missing,
 * malformed, invalid or expired.
 *
 * This is the single place token verification happens — routes and
 * middleware never parse or trust a JWT themselves, and no custom
 * cryptography is used.
 */
export async function verifyAccessToken(
    token: string
): Promise<AuthenticatedUser | null> {

    if (!token) {
        return null;
    }

    try {

        const { data, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !data.user) {
            return null;
        }

        return {
            id: data.user.id,
            email: data.user.email ?? undefined
        };

    } catch {
        return null;
    }
}
