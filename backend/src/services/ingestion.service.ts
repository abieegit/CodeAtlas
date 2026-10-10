import * as fs from "fs";
import * as path from "path";

import unzipper from "unzipper";

import { env } from "../config/env";

import {
    ensureDirectory,
    isPathInside
} from "../utils/file.utils";

export interface ExtractedRepository {
    repositoryName: string;
    repositoryPath: string;
}

function sanitizeName(
    name: string
): string {

    const base =
        path.basename(name, path.extname(name)) ||
        "repository";

    return base.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

/**
 * If the archive contains a single top-level directory (the common
 * "project folder" layout), use it as the repository root.
 */
function resolveRepositoryRoot(
    destination: string
): string {

    const entries =
        fs.readdirSync(
            destination,
            { withFileTypes: true }
        );

    if (
        entries.length === 1 &&
        entries[0].isDirectory()
    ) {
        return path.join(destination, entries[0].name);
    }

    return destination;
}

/**
 * Extracts an uploaded ZIP archive into a fresh directory under the
 * configured extraction root and returns the repository root.
 *
 * Entries that would escape the extraction directory (zip-slip) are
 * skipped.
 */
export async function extractZip(
    zipPath: string,
    originalName: string
): Promise<ExtractedRepository> {

    const repositoryName = sanitizeName(originalName);

    const destination =
        path.join(
            env.extractedDir,
            `${repositoryName}-${Date.now()}`
        );

    ensureDirectory(destination);

    const archive =
        await unzipper.Open.file(zipPath);

    for (const entry of archive.files) {

        const target =
            path.resolve(destination, entry.path);

        if (!isPathInside(destination, target)) {
            console.warn(
                `[ingestion] Skipping unsafe archive entry: ${entry.path}`
            );
            continue;
        }

        if (entry.type === "Directory") {
            ensureDirectory(target);
            continue;
        }

        ensureDirectory(path.dirname(target));

        await new Promise<void>((resolve, reject) => {

            entry.stream()
                .pipe(fs.createWriteStream(target))
                .on("finish", () => resolve())
                .on("error", reject);
        });
    }

    return {
        repositoryName,
        repositoryPath: resolveRepositoryRoot(destination)
    };
}
