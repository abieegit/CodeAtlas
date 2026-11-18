import {
    RequestEvidence,
    RouteEvidence,
    RouteMountEvidence
} from "../../models/graph.types";

export type MatchStatus = "resolved" | "ambiguous" | "unresolved";

export interface RouteMatch {
    status: MatchStatus;
    route: RouteEvidence | null;
    candidates: RouteEvidence[];
    request: RequestEvidence;
}

const MAX_PATTERN_SEGMENTS = 24;

/**
 * Splits a path or URL into comparable segments. Query strings, hashes and
 * the protocol are dropped; an empty segment list means "nothing to match".
 */
export function pathSegments(value: string): string[] {

    const withoutQuery = value.split("?")[0].split("#")[0];

    const withoutProtocol = /^(https?:)?\/\//.test(withoutQuery)
        ? `/${withoutQuery.split("/").slice(2).join("/")}`
        : withoutQuery;

    return withoutProtocol
        .split("/")
        .filter((segment) => segment !== "")
        .slice(0, MAX_PATTERN_SEGMENTS);
}

function join(prefix: string, path: string): string {

    const segments = [
        ...pathSegments(prefix),
        ...pathSegments(path)
    ];

    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Applies statically discovered `app.use("/prefix", router)` mounts to the
 * routes of the mounted file. Routes whose file is never mounted keep the
 * path exactly as declared — nothing is invented.
 */
export function withMounts(
    routes: RouteEvidence[],
    routeFile: string,
    mounts: RouteMountEvidence[]
): RouteEvidence[] {

    const prefix = mounts
        .filter((mount) => mount.targetFile === routeFile)
        .map((mount) => mount.prefix)
        .sort((a, b) => b.length - a.length)[0];

    if (!prefix) {
        return routes;
    }

    return routes.map((route) => ({
        ...route,
        mountPath: prefix,
        fullPath: join(prefix, route.path)
    }));
}

/**
 * Segment-wise comparison. A `:`-prefixed route segment or a `*` produced by
 * an unresolvable URL part matches any single concrete segment; everything
 * else must match literally. Words are never treated as similar.
 */
function segmentsMatch(requestSegment: string, routeSegment: string): boolean {

    if (routeSegment.startsWith(":") || requestSegment === "*") {
        return true;
    }

    if (requestSegment.startsWith(":")) {
        return routeSegment === requestSegment;
    }

    return requestSegment === routeSegment;
}

export function routeMatchesRequest(
    route: RouteEvidence,
    request: RequestEvidence
): boolean {

    if (route.method.toUpperCase() !== request.method.toUpperCase()) {
        return false;
    }

    const requestParts = pathSegments(request.url);
    const routeParts = pathSegments(route.fullPath);

    if (requestParts.length === 0 || routeParts.length === 0) {
        return false;
    }

    if (requestParts.length !== routeParts.length) {
        return false;
    }

    return requestParts.every((part, index) =>
        segmentsMatch(part, routeParts[index])
    );
}

/**
 * Matches one statically extracted request against the statically
 * extracted routes. Ambiguity is preserved rather than resolved by picking
 * one candidate, and a request whose URL is not resolvable stays unresolved.
 */
export function matchRequest(
    request: RequestEvidence,
    routes: RouteEvidence[]
): RouteMatch {

    if (!request.url || request.url === "*" || !request.urlStatic) {

        const wildcardCandidates = request.url.includes("*")
            ? routes.filter((route) => routeMatchesRequest(route, request))
            : [];

        if (wildcardCandidates.length === 1) {
            return {
                status: "resolved",
                route: wildcardCandidates[0],
                candidates: wildcardCandidates,
                request
            };
        }

        return {
            status: "unresolved",
            route: null,
            candidates: wildcardCandidates,
            request
        };
    }

    const candidates = routes.filter((route) =>
        routeMatchesRequest(route, request)
    );

    if (candidates.length === 0) {
        return {
            status: "unresolved",
            route: null,
            candidates: [],
            request
        };
    }

    if (candidates.length > 1) {
        return {
            status: "ambiguous",
            route: null,
            candidates,
            request
        };
    }

    return {
        status: "resolved",
        route: candidates[0],
        candidates,
        request
    };
}
