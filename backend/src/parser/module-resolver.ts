import * as fs from "fs";
import * as path from "path";

/**
 * Resolves a local (relative) import to a repository-relative
 * source path.
 *
 * Physical filesystem paths and repository-relative paths are kept
 * separate: the caller passes the physical absolute path of the
 * importing file, and this function returns a path relative to the
 * repository root (using forward slashes) so it matches graph ids.
 */
export function resolveModule(
    currentAbsoluteFilePath: string,
    importPath: string,
    repositoryRoot: string
): string | null {

    // Only local imports are resolved for now.
    // Example: "./userService"
    if (!importPath.startsWith(".")) {
        return null;
    }

    const currentDirectory =
        path.dirname(
            path.resolve(
                currentAbsoluteFilePath
            )
        );

    const basePath =
        path.resolve(
            currentDirectory,
            importPath
        );

    const possiblePaths: string[] = [basePath];

    /*
     * ESM/TypeScript projects often write imports with a `.js`
     * extension even though the source file is `.ts`
     * (e.g. `import "./constants.js"` -> constants.ts).
     * Try the TypeScript equivalents first.
     */
    const jsExtensionMatch =
        basePath.match(/\.(js|jsx|mjs|cjs)$/);

    if (jsExtensionMatch) {

        const withoutExtension =
            basePath.slice(
                0,
                -jsExtensionMatch[0].length
            );

        possiblePaths.push(
            `${withoutExtension}.ts`,
            `${withoutExtension}.tsx`
        );
    }

    possiblePaths.push(
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.jsx`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
        path.join(basePath, "index.js"),
        path.join(basePath, "index.jsx")
    );

    for (const possiblePath of possiblePaths) {

        if (!fs.existsSync(possiblePath)) {
            continue;
        }

        if (!fs.statSync(possiblePath).isFile()) {
            continue;
        }

        return path
            .relative(
                path.resolve(repositoryRoot),
                possiblePath
            )
            .replace(/\\/g, "/");
    }

    return null;
}
