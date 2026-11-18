import traverse from "@babel/traverse";

import { File, Node, StringLiteral, TemplateLiteral } from "@babel/types";

import {
    RequestEvidence,
    RouteEvidence,
    RouteMountEvidence
} from "../models/graph.types";

import { enclosingCallableId } from "./callable";

const HTTP_METHODS = new Set([
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "all"
]);

/**
 * callees whose result is a router object. Restricting route detection to
 * variables created this way (or named like the framework's own `app` /
 * `router`) is what keeps `map.get("k")`, `record.get("n")` and test
 * helpers such as `request(app).get("/x")` from being read as endpoints.
 */
const ROUTER_FACTORIES = new Set([
    "Router",
    "router",
    "express",
    "application",
    "Application"
]);

const ROUTER_OBJECT_NAMES = new Set(["app", "router", "server", "api"]);

const MAX_ROUTES_PER_FILE = 40;
const MAX_REQUESTS_PER_FILE = 40;
const MAX_MOUNTS_PER_FILE = 20;
const MAX_EXTERNALS_PER_FILE = 30;

export interface BoundaryEvidence {
    routes: RouteEvidence[];
    requests: RequestEvidence[];
    mounts: RouteMountEvidence[];
    /** Import specifiers that are not local files (packages, builtins). */
    external: string[];
    truncated: boolean;
}

export interface BoundaryOptions {
    /** Ids of every callable in the repository, so imported handlers resolve. */
    entityIds: Set<string>;
    /** Resolves a relative import specifier to a repository-relative path. */
    resolveImport: (specifier: string) => string | null;
}

function staticTextOf(
    node: Node | null | undefined
): { text: string; isStatic: boolean } {

    if (node === null || node === undefined) {
        return { text: "", isStatic: false };
    }

    if (node.type === "StringLiteral") {
        return { text: node.value, isStatic: true };
    }

    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return { text: node.quasis[0]?.value.cooked ?? "", isStatic: true };
    }

    return { text: "", isStatic: false };
}

/**
 * Best-effort assembly of a URL from a template or concatenation, using
 * string constants declared in the same file. Anything that cannot be
 * resolved statically is emitted as a `*` part with `isStatic: false`, so
 * nothing is guessed.
 */
function urlFromNode(
    node: Node | null | undefined,
    constants: Map<string, string>
): { url: string; isStatic: boolean } {

    const simple = staticTextOf(node);

    if (simple.isStatic) {
        return { url: simple.text, isStatic: true };
    }

    if (!node) {
        return { url: "", isStatic: false };
    }

    if (node.type === "TemplateLiteral") {

        let out = "";
        let fullyStatic = true;

        node.quasis.forEach((quasi, index) => {

            out += quasi.value.cooked ?? "";

            const expression = node.expressions[index];

            if (!expression) {
                return;
            }

            if (expression.type === "Identifier" && constants.has(expression.name)) {
                out += constants.get(expression.name) ?? "";
                return;
            }

            out += "*";
            fullyStatic = false;
        });

        return { url: out, isStatic: fullyStatic };
    }

    if (node.type === "BinaryExpression" && node.operator === "+") {

        const left = urlFromNode(node.left, constants);
        const right = urlFromNode(node.right, constants);

        return {
            url: `${left.url}${right.url}`,
            isStatic: left.isStatic && right.isStatic
        };
    }

    return { url: "", isStatic: false };
}

function calleeName(node: Node): string {

    if (node.type === "Identifier") {
        return node.name;
    }

    if (
        node.type === "MemberExpression" &&
        node.property.type === "Identifier"
    ) {
        return node.property.name;
    }

    return "";
}

function objectName(node: Node): string | null {

    if (
        node.type === "MemberExpression" &&
        node.object.type === "Identifier"
    ) {
        return node.object.name;
    }

    return null;
}

/**
 * Extracts the HTTP boundaries that are statically visible in one file:
 *
 *  - backend route registrations (`router.get("/x", handler)`),
 *  - `app.use("/prefix", router)` mounts,
 *  - outbound requests (`fetch`, axios-style calls).
 *
 * Route paths, handlers and methods come from the source text only. Nothing
 * here executes or guesses: an unresolvable URL is recorded as unresolvable.
 */
export function extractBoundaries(
    ast: File,
    filePath: string,
    options: BoundaryOptions
): BoundaryEvidence {

    const routes: RouteEvidence[] = [];
    const requests: RequestEvidence[] = [];
    const mounts: RouteMountEvidence[] = [];
    const external: string[] = [];

    let truncated = false;

    /* Local string constants (`const BASE = "/api"`) for URL assembly. */
    const constants = new Map<string, string>();

    /* Locally bound import names, used to resolve handlers and mounts. */
    const importedFrom = new Map<string, string>();

    /* Identifiers that hold a router/app object in this file. */
    const routerNames = new Set<string>();

    traverse(ast, {

        VariableDeclarator(path) {

            const init = path.node.init;
            const id = path.node.id;

            if (
                id.type === "Identifier" &&
                init &&
                init.type === "StringLiteral"
            ) {
                constants.set(id.name, init.value);
            }

            /*
             * `const router = Router()`, `const app = express()`, and an
             * imported default used directly (`import { app } from …`) all
             * name a router object for registration calls.
             */
            if (
                id.type === "Identifier" &&
                init &&
                init.type === "CallExpression" &&
                init.callee.type === "Identifier" &&
                ROUTER_FACTORIES.has(init.callee.name)
            ) {
                routerNames.add(id.name);
            }
        },

        ImportDeclaration(path) {

            const resolved = options.resolveImport(path.node.source.value);

            if (!resolved) {

                /*
                 * A package or builtin dependency: recorded as an external
                 * boundary, never as an internal call target.
                 */
                if (
                    external.length < MAX_EXTERNALS_PER_FILE &&
                    !external.includes(path.node.source.value)
                ) {
                    external.push(path.node.source.value);
                }

                return;
            }

            for (const specifier of path.node.specifiers) {

                if (
                    specifier.type === "ImportSpecifier" ||
                    specifier.type === "ImportDefaultSpecifier"
                ) {
                    importedFrom.set(specifier.local.name, resolved);
                }
            }
        }
    });

    const handlerIdFor = (name: string): string | null => {

        const own = `function:${filePath}:${name}`;

        if (options.entityIds.has(own)) {
            return own;
        }

        const origin = importedFrom.get(name);

        if (!origin) {
            return null;
        }

        const imported = `function:${origin}:${name}`;

        return options.entityIds.has(imported) ? imported : null;
    };

    const isRouterObject = (node: Node): boolean => {

        if (node.type !== "Identifier") {
            return false;
        }

        return (
            routerNames.has(node.name) ||
            ROUTER_OBJECT_NAMES.has(node.name.toLowerCase())
        );
    };

    /**
     * A route registration is `router.get("/path", …)`. Requiring a
     * router-shaped receiver plus a leading-slash path is what stops
     * `record.get("n")`, `map.get(k)`, `byId.get(key)` and test calls such as
     * `request(app).get("/api/x")` from being read as endpoints.
     */
    const isRouteRegistration = (
        callee: Node,
        firstArg: Node | undefined
    ): { method: string; path: string } | null => {

        if (callee.type !== "MemberExpression" || !firstArg) {
            return null;
        }

        if (firstArg.type !== "StringLiteral" || !firstArg.value.startsWith("/")) {
            return null;
        }

        if (!isRouterObject(callee.object)) {
            return null;
        }

        if (
            callee.property.type !== "Identifier" ||
            !HTTP_METHODS.has(callee.property.name)
        ) {
            return null;
        }

        return {
            method: callee.property.name.toUpperCase(),
            path: firstArg.value
        };
    };

    traverse(ast, {

        CallExpression(path) {

            const line = path.node.loc?.start.line ?? 0;
            const column = path.node.loc?.start.column;
            const args = path.node.arguments;
            const callee = path.node.callee;

            /* ----------------------------------------------
             * app.use("/api", router) — router mounts
             * ---------------------------------------------- */
            if (
                callee.type === "MemberExpression" &&
                callee.property.type === "Identifier" &&
                callee.property.name === "use" &&
                isRouterObject(callee.object) &&
                args.length >= 2 &&
                args[0].type === "StringLiteral" &&
                args[1].type === "Identifier"
            ) {

                if (mounts.length < MAX_MOUNTS_PER_FILE) {
                    mounts.push({
                        prefix: (args[0] as StringLiteral).value,
                        targetName: (args[1] as { name: string }).name,
                        targetFile:
                            importedFrom.get(
                                (args[1] as { name: string }).name
                            ) ?? null,
                        line
                    });
                }

                return;
            }

            /* ----------------------------------------------
             * router.get("/x", middleware, handler)
             * ---------------------------------------------- */
            const registration = isRouteRegistration(callee, args[0]);

            if (registration) {

                if (routes.length >= MAX_ROUTES_PER_FILE) {
                    truncated = true;
                    return;
                }

                const middleware: string[] = [];
                let handler = "";
                let handlerId: string | null = null;

                for (const arg of args.slice(1)) {

                    if (arg.type === "Identifier") {

                        handler = arg.name;
                        handlerId = handlerIdFor(arg.name);

                    } else if (arg.type === "CallExpression") {

                        middleware.push(calleeName(arg.callee) || "middleware");
                    }
                }

                routes.push({
                    method: registration.method,
                    path: registration.path,
                    mountPath: "",
                    fullPath: registration.path,
                    handler,
                    handlerId,
                    line,
                    column,
                    middleware
                });

                return;
            }

            /* ----------------------------------------------
             * fetch(url, { method }) / axios.get(url)
             * ---------------------------------------------- */
            const isFetch =
                callee.type === "Identifier" && callee.name === "fetch";

            const axiosStyle =
                callee.type === "MemberExpression" &&
                callee.property.type === "Identifier" &&
                HTTP_METHODS.has(callee.property.name) &&
                objectName(callee)?.toLowerCase() === "axios";

            if (!isFetch && !axiosStyle) {
                return;
            }

            if (requests.length >= MAX_REQUESTS_PER_FILE) {
                truncated = true;
                return;
            }

            const built = urlFromNode(args[0] ?? null, constants);

            let method = axiosStyle
                ? (callee as { property: { name: string } }).property.name.toUpperCase()
                : "GET";

            if (isFetch && args[1] && args[1].type === "ObjectExpression") {

                for (const property of args[1].properties) {

                    if (
                        property.type === "ObjectProperty" &&
                        property.key.type === "Identifier" &&
                        property.key.name === "method" &&
                        property.value.type === "StringLiteral"
                    ) {
                        method = property.value.value.toUpperCase();
                    }
                }
            }

            requests.push({
                method,
                url: built.url,
                urlStatic: built.isStatic,
                client: isFetch ? "fetch" : "axios",
                callerId: enclosingCallableId(path, filePath),
                line,
                column
            });
        }
    });

    return { routes, requests, mounts, external, truncated };
}
