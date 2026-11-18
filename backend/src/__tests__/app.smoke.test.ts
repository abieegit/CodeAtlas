import { describe, it, expect, vi } from "vitest";
import request from "supertest";

import type { NextFunction, Request, Response } from "express";

vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
}));

/*
 * Build 06: authentication and ownership are mocked here so this smoke test
 * keeps exercising routing only. The real middleware is covered by the
 * dedicated auth/ownership tests.
 */
vi.mock("../middleware/auth.middleware", () => ({
    requireAuth: (request: Request, _response: Response, next: NextFunction) => {
        request.user = { id: "user-1", email: "user@example.com" };
        next();
    }
}));

vi.mock("../services/repositories.service", () => ({
    listRepositoriesForUser: vi.fn(async () => []),
    findRepositoryForUser: vi.fn(async () => null),
    createRepository: vi.fn(),
    updateRepositoryOutcome: vi.fn(async () => undefined)
}));

import { app } from "../server";

describe("Express app (smoke)", () => {

    it("returns a JSON 404 for unknown routes", async () => {
        const response = await request(app).get("/api/does-not-exist");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("reports health using the (mocked) Neo4j check", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok", neo4j: true });
    });

    it("lists repositories", async () => {
        const response = await request(app).get("/api/repositories");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ repositories: [] });
    });
});
