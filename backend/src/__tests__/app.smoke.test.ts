import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
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
