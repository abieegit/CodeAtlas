import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { env } from "../config/env";

/*
 * Server-side Supabase client (Build 06).
 *
 * It carries the Secret key (sb_secret_...), which BYPASSES row level
 * security, so every query built with it must be explicitly scoped to the
 * authenticated user. The key never leaves the backend and is never logged.
 *
 * Placeholder values are used when the environment is not configured so
 * importing this module (for example in tests) never throws; required
 * variables are enforced separately by assertSupabaseConfigured() at startup.
 */
export const supabaseAdmin: SupabaseClient = createClient(
    env.supabase.url || "http://localhost:54321",
    env.supabase.secretKey || "secret-key-not-configured",
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);

/**
 * Throws when a required Supabase variable is missing. Called once at startup
 * so a misconfigured server fails clearly instead of 500-ing on the first
 * request. The legacy anon / service_role names are NOT required.
 */
export function assertSupabaseConfigured(): void {

    const missing = [
        ["SUPABASE_URL", env.supabase.url],
        ["SUPABASE_PUBLISHABLE_KEY", env.supabase.publishableKey],
        ["SUPABASE_SECRET_KEY", env.supabase.secretKey]
    ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missing.length > 0) {
        throw new Error(
            `Supabase is not configured. Missing: ${missing.join(", ")}. ` +
                "Set them in backend/.env (copy backend/.env.example) — see the " +
                "Build 06 log for the dashboard values."
        );
    }
}
