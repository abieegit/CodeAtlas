import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!url || !publishableKey) {
    console.warn(
        "[auth] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set. " +
            "Copy frontend/.env.example to frontend/.env.local and fill them in."
    );
}

/*
 * Browser Supabase client (Build 06).
 *
 * It holds only the public Publishable key (sb_publishable_...) — the Secret
 * key lives in the backend and is never exposed here. Placeholder values keep
 * the module importable in tests; the real values come from Vite env at
 * dev/build time.
 *
 * Sessions persist across refreshes (persistSession), tokens auto-refresh,
 * and an email-confirmation / password-recovery link is picked up from the
 * URL (detectSessionInUrl).
 */
export const supabase = createClient(
    url || "http://localhost:54321",
    publishableKey || "publishable-key-not-configured",
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);
