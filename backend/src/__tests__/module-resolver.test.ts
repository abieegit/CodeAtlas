import { describe, it, expect } from "vitest";

import * as path from "path";

import { resolveModule } from "../parser/module-resolver";

const repositoryRoot = path.resolve(
    process.cwd(),
    "src",
    "test-fixtures",
    "imports"
);

const importer = path.join(repositoryRoot, "a.ts");

describe("module-resolver", () => {

    it("resolves a relative import to a repository-relative path", () => {
        expect(resolveModule(importer, "./b", repositoryRoot)).toBe("b.ts");
    });

    it("maps an ESM .js import onto the .ts source", () => {
        expect(resolveModule(importer, "./b.js", repositoryRoot)).toBe("b.ts");
    });

    it("returns null for a non-relative (package) import", () => {
        expect(resolveModule(importer, "lodash", repositoryRoot)).toBeNull();
    });

    it("returns null when the module cannot be found", () => {
        expect(resolveModule(importer, "./missing", repositoryRoot)).toBeNull();
    });
});
