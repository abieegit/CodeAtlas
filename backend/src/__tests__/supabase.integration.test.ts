import { describe, expect, it } from "vitest";

import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env";

/*
 * LIVE Supabase integration test (Build 06).
 *
 * This is the only test that talks to a real Supabase project, and it is
 * GATED: it runs only when SUPABASE_URL and SUPABASE_SECRET_KEY are set
 * (i.e. a project is configured). Otherwise it is skipped, so the normal
 * `npm test` run needs no credentials and no network.
 *
 * Every other Build 06 suite is a unit / route test with a MOCKED Supabase
 * client (`vi.mock`) — a green run of those proves the wiring, not that a
 * real project or the migration exists.
 *
 * If this test FAILS with a "relation does not exist" error, the migration
 * has not been applied yet: run
 * `supabase/migrations/0001_build06_auth_and_ownership.sql` in the Supabase
 * SQL editor (see the Build 06 log, "Manual setup instructions").
 */

const configured = Boolean(env.supabase.url && env.supabase.secretKey);

describe("Supabase integration (gated, real project)", () => {

    it("has the Build 06 tables once the migration is applied", async (ctx) => {

        if (!configured) {
            ctx.skip();
            return;
        }

        const client = createClient(
            env.supabase.url,
            env.supabase.secretKey,
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        const profiles = await client.from("profiles").select("id").limit(1);
        const repositories = await client
            .from("repositories")
            .select("id")
            .limit(1);

        expect(profiles.error).toBeNull();
        expect(repositories.error).toBeNull();
    });
});
