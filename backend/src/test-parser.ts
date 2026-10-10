import * as path from "path";

import { parseFile } from "./parser/ast.parser";

import {
    extractEntities
} from "./parser/entity.extractor";

import {
    extractRelationships
} from "./parser/relationship.extractor";

import {
    buildGraph
} from "./parser/graph.builder";

import {
    createSymbolResolver
} from "./parser/symbol.resolver";

import {
    RelationshipContext
} from "./parser/relationship.extractor";

const filePath =
    "src/test-project/sample.ts";

const context: RelationshipContext = {
    filePath,
    absoluteFilePath: path.resolve(filePath),
    repositoryRoot: process.cwd()
};

const ast =
    parseFile(filePath);

const entities =
    extractEntities(
        ast,
        filePath
    );

const symbolResolver =
    createSymbolResolver(
        process.cwd(),
        [
            context.absoluteFilePath
        ]
    );

const relationships =
    extractRelationships(
        ast,
        context,
        entities,
        symbolResolver
    );

const graph =
    buildGraph(
        entities,
        relationships,
        "test-project"
    );

console.log("\nGRAPH DATA:");

console.log(
    JSON.stringify(
        graph,
        null,
        2
    )
);