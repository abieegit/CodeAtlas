import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll
} from "vitest";

import * as path from "path";

import { analyzeRepository } from "../services/analysis.service";

import {
    saveGraph,
    fetchGraph,
    verifyConnection
} from "../services/graph.service";

import { neo4jDriver } from "../database/neo4j";

/*
 * Live Neo4j integration test. It is GATED: when Neo4j is unreachable the
 * test is skipped with a reason instead of failing. The driver is always
 * closed in afterAll so the process can exit (the Bolt driver otherwise
 * keeps the event loop alive).
 */

const fixturesRoot = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures"
);

const repositoryName = "build02-roundtrip-test";

let connected = false;

beforeAll(async () => {
    connected = await verifyConnection();
});

afterAll(async () => {
    if (connected) {
        try {
            await saveGraph({ nodes: [], relationships: [] }, repositoryName);
        } catch {
            /* best-effort cleanup */
        }
    }
    await neo4jDriver.close();
});

describe("Neo4j round-trip (gated)", () => {

    it("persists and reads back nodes, relationships and evidence", async (ctx) => {

        if (!connected) {
            ctx.skip();
            return;
        }

        const graph = analyzeRepository(
            path.join(fixturesRoot, "inheritance"),
            repositoryName
        );

        await saveGraph(graph, repositoryName);

        const read = await fetchGraph(repositoryName);

        expect(read.nodes.length).toBe(graph.nodes.length);
        expect(read.relationships.length).toBe(graph.relationships.length);

        const withEvidence = read.relationships.filter(
            (relationship) => relationship.evidence
        );

        expect(withEvidence.length).toBe(read.relationships.length);
    });
});
