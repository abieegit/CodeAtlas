import { beforeEach, describe, expect, it, vi } from "vitest";

import request from "supertest";

/*
 * Build 06 — authentication.
 *
 * The Supabase client is mocked, so the REAL requireAuth middleware and the
 * REAL auth.service run end-to-end against a fake Supabase: no network and no
 * real credentials are required.
 */
vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
}));

vi.mock("../database/supabase", () => ({
    supabaseAdmin: {
        auth: { getUser: vi.fn() },
        from: vi.fn(() => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: {
                            id: "user-1",
                            full_name: "Ada Lovelace",
                            avatar_url: null,
                            created_at: "2026-01-01T00:00:00Z",
                            updated_at: "2026-01-01T00:00:00Z"
                        },
                        error: null
                    })
                })
            })
        }))
    },
    assertSupabaseConfigured: () => undefined
}));

import { app } from "../server";
import { supabaseAdmin } from "../database/supabase";

const getUser = vi.mocked(supabaseAdmin.auth.getUser);

beforeEach(() => {
    getUser.mockReset();
});

describe("Build 06 — authentication", () => {

    it("keeps the health endpoint public", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
    });

    it("rejects a missing token with 401", async () => {
        const response = await request(app).get("/api/auth/me");

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/bearer token/i);
        expect(getUser).not.toHaveBeenCalled();
    });

    it("rejects a non-Bearer Authorization header with 401", async () => {
        const response = await request(app)
            .get("/api/auth/me")
            .set("Authorization", "Token abc");

        expect(response.status).toBe(401);
        expect(getUser).not.toHaveBeenCalled();
    });

    it("rejects an invalid or expired token with 401", async () => {
        getUser.mockResolvedValue({
            data: { user: null },
            error: { name: "AuthApiError", message: "invalid token" }
        } as never);

        const response = await request(app)
            .get("/api/auth/me")
            .set("Authorization", "Bearer bad-token");

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/invalid or expired/i);
    });

    it("returns the profile for a valid token", async () => {
        getUser.mockResolvedValue({
            data: { user: { id: "user-1", email: "ada@example.com" } },
            error: null
        } as never);

        const response = await request(app)
            .get("/api/auth/me")
            .set("Authorization", "Bearer good-token");

        expect(getUser).toHaveBeenCalledWith("good-token");
        expect(response.status).toBe(200);
        expect(response.body.user).toEqual({
            id: "user-1",
            email: "ada@example.com"
        });
        expect(response.body.profile.full_name).toBe("Ada Lovelace");
    });

    it("protects every private route with 401 when unauthenticated", async () => {
        const routes = [
            "/api/repositories",
            "/api/graph?repository=x",
            "/api/analysis?repository=x",
            "/api/analysis/function?repository=x&nodeId=y",
            "/api/workflows?repository=x",
            "/api/workflows/wf-1?repository=x"
        ];

        for (const route of routes) {
            const response = await request(app).get(route);
            expect(response.status).toBe(401);
        }
    });
});
