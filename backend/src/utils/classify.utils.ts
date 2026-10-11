import { FileCategory } from "../models/graph.types";

/**
 * Classifies a source file by category using combined signals (path
 * segments AND file name), deliberately not relying on folder names alone.
 *
 * Categories drive the default graph scope: only `source` files are shown
 * by default (plus anything reachable from them). Classification never
 * removes a file from the graph - it only sets a visualisation flag.
 */
export function classifyFile(
    relativePath: string,
    fileName: string
): FileCategory {

    const path = relativePath.replace(/\\/g, "/").toLowerCase();
    const name = fileName.toLowerCase();
    const segments = path.split("/");

    if (name.endsWith(".d.ts")) {
        return "declaration";
    }

    if (
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) ||
        segments.includes("__tests__") ||
        segments.includes("test") ||
        segments.includes("tests")
    ) {
        return "test";
    }

    if (
        segments.includes("__fixtures__") ||
        segments.includes("fixtures") ||
        segments.includes("__mocks__") ||
        name.includes(".fixture.")
    ) {
        return "fixture";
    }

    if (
        segments.includes("generated") ||
        name.includes(".generated.") ||
        name.endsWith(".min.js")
    ) {
        return "generated";
    }

    if (
        /\.config\.[cm]?[jt]sx?$/.test(name) ||
        /\.rc\.[cm]?[jt]sx?$/.test(name)
    ) {
        return "config";
    }

    return "source";
}
