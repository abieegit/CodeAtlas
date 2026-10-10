import * as fs from "fs";
import * as path from "path";

import {
    parse,
    ParserPlugin
} from "@babel/parser";

import {
    File
} from "@babel/types";

export function parseFile(
    filePath: string
): File {

    const sourceCode = fs.readFileSync(
        filePath,
        "utf-8"
    );

    const extension =
        path.extname(filePath).toLowerCase();

    /*
     * TypeScript files need the "typescript"
     * plugin. Files that may contain JSX
     * (.tsx/.jsx) additionally need the "jsx"
     * plugin. The "jsx" plugin is deliberately
     * not enabled for .ts files so that
     * angle-bracket type assertions still parse.
     */
    const plugins: ParserPlugin[] = [];

    if (
        extension === ".ts" ||
        extension === ".tsx"
    ) {
        plugins.push("typescript");
    }

    if (
        extension === ".tsx" ||
        extension === ".jsx"
    ) {
        plugins.push("jsx");
    }

    const result = parse(
        sourceCode,
        {
            sourceType: "module",
            plugins,
            ranges: true
        }
    );

    return result as File;
}