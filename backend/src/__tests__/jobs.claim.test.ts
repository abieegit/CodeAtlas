import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Build 07 — job claiming (mocked).
 *
 * The real atomicity lives in the SQL function claim_analysis_job
 * (FOR UPDATE SKIP LOCKED); these tests only pin the service contract: it
 * calls that function with the configured stale threshold and returns the
 * first claimed row (or null). The database-level guarantee is verified
 * manually against Postgres (see the Build 07 log).
 */

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../database/supabase", () => ({
    supabaseAdmin: { rpc },
    assertSupabaseConfigured: vi.fn()
}));

import { claimNextJob } from "../services/jobs.service";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Build 07 — job claiming", () => {

    it("calls the atomic SQL function and returns the claimed job", async () => {
        rpc.mockResolvedValue({
            data: [{ id: "job-1", status: "processing" }],
            error: null
        });

        const job = await claimNextJob(900);

        expect(rpc).toHaveBeenCalledWith("claim_analysis_job", {
            p_stale_seconds: 900
        });
        expect(job?.id).toBe("job-1");
    });

    it("returns null when no job is available", async () => {
        rpc.mockResolvedValue({ data: [], error: null });

        expect(await claimNextJob(900)).toBeNull();
    });

    it("surfaces a database error", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

        await expect(claimNextJob(900)).rejects.toThrow(/claim/i);
    });
});
