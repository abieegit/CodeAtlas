import * as fs from "fs";
import * as path from "path";

export function ensureDirectory(
    directoryPath: string
): void {
    fs.mkdirSync(directoryPath, { recursive: true });
}

/**
 * True when `childPath` is the same as, or nested inside, `parentPath`.
 * Used to reject archive entries that would escape the extraction root
 * (zip-slip / path traversal).
 */
export function isPathInside(
    parentPath: string,
    childPath: string
): boolean {

    const relative = path.relative(
        path.resolve(parentPath),
        path.resolve(childPath)
    );

    return (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
}

export function toPosixPath(
    value: string
): string {
    return value.replace(/\\/g, "/");
}

/**
 * Removes a directory tree if it exists. Used to clean up temporary
 * extraction directories.
 */
export function removeDirectoryIfExists(
    directoryPath: string
): void {
    fs.rmSync(directoryPath, { recursive: true, force: true });
}

/**
 * Removes a single file if it exists. Used to clean up uploaded
 * archives after extraction.
 */
export function removeFileIfExists(
    filePath: string
): void {
    fs.rmSync(filePath, { force: true });
}

/**
 * True when the file starts with the ZIP local-file signature ("PK"),
 * so a non-ZIP archive (e.g. a RAR) is rejected before extraction.
 */
export function isZipArchive(
    filePath: string
): boolean {

    const fileDescriptor = fs.openSync(filePath, "r");

    try {

        const signature = Buffer.alloc(4);
        const bytesRead = fs.readSync(
            fileDescriptor,
            signature,
            0,
            4,
            0
        );

        if (bytesRead < 2) {
            return false;
        }

        return signature[0] === 0x50 && signature[1] === 0x4b;
    } finally {
        fs.closeSync(fileDescriptor);
    }
}
