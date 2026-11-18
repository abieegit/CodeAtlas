import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { env } from "../config/env";

/*
 * Server-side Supabase client (Build 06).
 *
 * It carries the service-role key, which BYPASSES row level security, so
 * every query built with it must be explicitly scoped to the authenticated
 * user. The key never leaves the backend and is never logged.
 *
 * Placeholder values are used when the environment is not configured so
 * importing this module (for example in tests) never throws; required
 * variables are enforced separately by assertSupabaseConfigured() at startup.
 */
export const supabaseAdmin: SupabaseClient = createClient(
    env.supabase.url || "http://localhost:54321",
    env.supabase.serviceRoleKey || "service-role-key-not-configured",
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);

/**
 * Throws when a required Supabase variable is missing. Called once at
 * startup so a misconfigured server fails clearly rather than 500-ing on
 * the first request.
 */
export function assertSupabaseConfigured(): void {

    const missing = [
        ["SUPABASE_URL", env.supabase.url],
        ["SUPABASE_ANON_KEY", env.supabase.anonKey],
        ["SUPABASE_SERVICE_ROLE_KEY", env.supabase.serviceRoleKey]
    ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missing.length > 0) {
        throw new Error(
            `Missing required Supabase environment variables: ${missing.join(", ")}. ` +
                "Copy backend/.env.example to backend/.env and fill them in."
        );
    }
}
