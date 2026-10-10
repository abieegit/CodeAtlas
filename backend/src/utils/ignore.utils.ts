/**
 * Directories that are never scanned for source files.
 */
export const IGNORED_DIRECTORIES = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "out",
    "vendor"
];

export function isIgnoredDirectory(
    name: string
): boolean {
    return IGNORED_DIRECTORIES.includes(name);
}
