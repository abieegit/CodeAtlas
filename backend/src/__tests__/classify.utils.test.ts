import { describe, it, expect } from "vitest";

import { classifyFile } from "../utils/classify.utils";

import { FileCategory } from "../models/graph.types";

const cases: Array<[string, string, FileCategory]> = [
    ["src/app.ts", "app.ts", "source"],
    ["shared/util.ts", "util.ts", "source"],
    ["src/app.test.ts", "app.test.ts", "test"],
    ["src/__tests__/x.ts", "x.ts", "test"],
    ["src/__fixtures__/sample.ts", "sample.ts", "fixture"],
    ["src/generated/api.ts", "api.ts", "generated"],
    ["vite.config.ts", "vite.config.ts", "config"],
    ["src/types.d.ts", "types.d.ts", "declaration"]
];

describe("classifyFile", () => {

    for (const [path, name, expected] of cases) {
        it(`classifies ${path} as ${expected}`, () => {
            expect(classifyFile(path, name)).toBe(expected);
        });
    }
});
