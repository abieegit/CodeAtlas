import * as fs from "fs";
import * as path from "path";

import { isIgnoredDirectory } from "../utils/ignore.utils";

const SUPPORTED_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx"
];

export function findSourceFiles(
    repositoryPath: string
): string[] {

    const sourceFiles: string[] = [];

    function scanDirectory(
        directoryPath: string
    ): void {

        const entries =
            fs.readdirSync(
                directoryPath,
                {
                    withFileTypes: true
                }
            );

        for (const entry of entries) {

            const fullPath =
                path.join(
                    directoryPath,
                    entry.name
                );

            // -----------------------------------------
            // DIRECTORY
            // -----------------------------------------

            if (entry.isDirectory()) {

                if (isIgnoredDirectory(entry.name)) {
                    continue;
                }

                scanDirectory(fullPath);

                continue;
            }

            // -----------------------------------------
            // FILE
            // -----------------------------------------

            if (!entry.isFile()) {
                continue;
            }

            const extension =
                path.extname(
                    entry.name
                ).toLowerCase();

            if (
                !SUPPORTED_EXTENSIONS.includes(
                    extension
                )
            ) {
                continue;
            }

            const relativePath =
                path.relative(
                    repositoryPath,
                    fullPath
                );

            sourceFiles.push(
                relativePath.replace(
                    /\\/g,
                    "/"
                )
            );
        }
    }

    scanDirectory(repositoryPath);

    return sourceFiles;
}