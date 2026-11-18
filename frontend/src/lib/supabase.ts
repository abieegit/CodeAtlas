import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "";

if (!url || !anonKey) {
    console.warn(
        "[auth] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
            "Copy frontend/.env.example to frontend/.env.local and fill them in."
    );
}

/*
 * Browser Supabase client (Build 06).
 *
 * It holds only the public anon key — the service-role key lives in the
 * backend and is never exposed here. Placeholder values keep the module
 * importable in tests; the real values come from Vite env at dev/build time.
 *
 * Sessions persist across refreshes (persistSession), tokens auto-refresh,
 * and an email-confirmation / password-recovery link is picked up from the
 * URL (detectSessionInUrl).
 */
export const supabase = createClient(
    url || "http://localhost:54321",
    anonKey || "anon-key-not-configured",
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);
