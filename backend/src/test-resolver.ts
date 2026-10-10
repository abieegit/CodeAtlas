import * as path from "path";

import {
    resolveModule
} from "./parser/module-resolver";

const result =
    resolveModule(
        path.resolve("src/test-project/sample.ts"),
        "./userService",
        process.cwd()
    );

console.log("RESOLVED PATH:");
console.log(result);