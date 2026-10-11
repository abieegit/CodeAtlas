import { describe, it, expect, vi } from "vitest";

import * as path from "path";

import request from "supertest";

/*
 * The Neo4j layer is mocked so these tests exercise archive validation,
 * ingestion and the response shape without writing to a database.
 */
vi.mock("../services/graph.service", () => ({
    verifyConnection: vi.fn(async () => true),
    fetchGraph: vi.fn(async () => ({ nodes: [], relationships: [] })),
    listRepositories: vi.fn(async () => []),
    saveGraph: vi.fn(async () => undefined)
}));

import { app } from "../server";

const archivesDir = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures",
    "archives"
);

describe("POST /api/repositories/analyze (archive validation)", () => {

    it("accepts a valid ZIP and returns a graph", async () => {
        const response = await request(app)
            .post("/api/repositories/analyze")
            .attach("file", path.join(archivesDir, "valid.zip"));

        expect(response.status).toBe(201);
        expect(response.body.repository).toBe("valid");
        expect(response.body.graph.nodes.length).toBeGreaterThanOrEqual(1);
        expect(response.body.categoryCounts).toBeDefined();
    });

    it("rejects a mislabeled archive that is not really a ZIP", async () => {
        const response = await request(app)
            .post("/api/repositories/analyze")
            .attach("file", path.join(archivesDir, "fake.zip"));

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/ZIP/i);
    });

    it("rejects a .rar archive", async () => {
        const response = await request(app)
            .post("/api/repositories/analyze")
            .attach("file", path.join(archivesDir, "archive.rar"));

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/ZIP/i);
    });
});
