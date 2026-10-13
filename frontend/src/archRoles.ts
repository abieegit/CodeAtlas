import type { EntityType, GraphNode } from "./types";

/**
 * Visualisation-only overlay roles. Classification is a deterministic,
 * conservative name/path heuristic — it says nothing about what a component
 * actually does at runtime, and it never touches the graph data, the AST
 * pipeline, Neo4j or the uploaded ZIP.
 */
export type ArchRole =
    | "database"
    | "auth"
    | "login"
    | "users"
    | "api"
    | "payment"
    | "external";

/** Node types the overlay is applied to. */
const ICON_TYPES: EntityType[] = [
    "Directory",
    "File",
    "Class",
    "Function",
    "Method"
];

/**
 * Files that are almost never architectural components. Matched against the
 * node's path and, as a prefix, against its name (e.g. `testLogin`).
 */
const NON_COMPONENT =
    /(^|\/|[^a-z])(tests?|specs?|__tests__|fixtures?|mocks?|__mocks__|e2e)([^a-z]|\/|$)/i;

/**
 * Rules in precedence order; the first match wins so classification is
 * deterministic. Each regex is tested against `name + " " + filePath`.
 */
const RULES: Array<{ role: ArchRole; pattern: RegExp }> = [
    {
        role: "payment",
        pattern:
            /payment|billing|checkout|invoice|(^|[^a-z])(stripe|paypal|braintree|cart)([^a-z]|$)/i
    },
    {
        role: "auth",
        pattern: /auth|jwt|oauth|credential|rbac|session/i
    },
    {
        role: "login",
        pattern:
            /log[-_ ]?in|log[-_ ]?out|sign[-_ ]?in|sign[-_ ]?up|sign[-_ ]?out|signin|signout|signup/i
    },
    {
        role: "database",
        pattern:
            /database|(^|[^a-z])db([^a-z]|$)|postgres|mysql|sqlite|mongo|redis|neo4j|mariadb|mssql|prisma|sequelize|typeorm|mongoose|knex|drizzle|migration/i
    },
    {
        role: "users",
        pattern:
            /(^|[^a-z])users?([^a-z]|$)|accounts?|members?|customers?|profiles?/i
    },
    {
        role: "api",
        pattern:
            /(^|\/)api(\/|$)|routes?|routers?|controllers?|endpoints?|graphql|resolvers?/i
    },
    {
        role: "external",
        pattern:
            /webhook|gateway|proxy|integrations?|external|(^|[^a-z])clients?([^a-z]|$)/i
    }
];

/**
 * Map a node to an overlay role, or null when the evidence is not strong
 * enough (ambiguous nodes keep their existing visual style).
 */
export function classifyArchitecturalRole(
    node: Pick<GraphNode, "type" | "name" | "filePath">
): ArchRole | null {

    if (!ICON_TYPES.includes(node.type)) {
        return null;
    }

    if (NON_COMPONENT.test(node.filePath ?? "")) {
        return null;
    }

    if (/^(test|spec|mock)/i.test(node.name ?? "")) {
        return null;
    }

    const haystack = `${node.name ?? ""} ${node.filePath ?? ""}`;

    for (const rule of RULES) {
        if (rule.pattern.test(haystack)) {
            return rule.role;
        }
    }

    return null;
}

/**
 * Reused SVG artwork (24x24, stroke-based) rendered once into <defs> as
 * <symbol> elements and referenced with <use>, so per-node rendering stays
 * lightweight.
 */
export interface IconShape {
    tag: "path" | "circle" | "rect" | "ellipse";
    attrs: Record<string, string>;
}

export const ARCH_ICON_SHAPES: Record<ArchRole, IconShape[]> = {
    database: [
        { tag: "ellipse", attrs: { cx: "12", cy: "5", rx: "9", ry: "3" } },
        {
            tag: "path",
            attrs: { d: "M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" }
        },
        {
            tag: "path",
            attrs: { d: "M3 12c0 1.7 4 3 9 3s9-1.3 9-3" }
        }
    ],
    auth: [
        {
            tag: "path",
            attrs: {
                d: "M12 2l8 3.5V12c0 4.8-3.4 8.4-8 10-4.6-1.6-8-5.2-8-10V5.5L12 2z"
            }
        }
    ],
    login: [
        {
            tag: "path",
            attrs: { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" }
        },
        { tag: "path", attrs: { d: "M10 17l5-5-5-5" } },
        { tag: "path", attrs: { d: "M15 12H3" } }
    ],
    users: [
        { tag: "circle", attrs: { cx: "12", cy: "7", r: "4" } },
        {
            tag: "path",
            attrs: { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }
        }
    ],
    api: [
        { tag: "circle", attrs: { cx: "18", cy: "5", r: "3" } },
        { tag: "circle", attrs: { cx: "6", cy: "12", r: "3" } },
        { tag: "circle", attrs: { cx: "18", cy: "19", r: "3" } },
        { tag: "path", attrs: { d: "M8.6 10.8l6.8-4.6" } },
        { tag: "path", attrs: { d: "M8.6 13.2l6.8 4.6" } }
    ],
    payment: [
        { tag: "rect", attrs: { x: "2", y: "5", width: "20", height: "14", rx: "2" } },
        { tag: "path", attrs: { d: "M2 10h20" } }
    ],
    external: [
        { tag: "path", attrs: { d: "M9 2v6" } },
        { tag: "path", attrs: { d: "M15 2v6" } },
        { tag: "path", attrs: { d: "M6 8h12v2a6 6 0 0 1-12 0V8z" } },
        { tag: "path", attrs: { d: "M12 16v6" } }
    ]
};

/** <symbol> id for a role, as referenced by the overlay's <use> elements. */
export function archIconId(role: ArchRole): string {
    return `ca-icon-${role}`;
}
