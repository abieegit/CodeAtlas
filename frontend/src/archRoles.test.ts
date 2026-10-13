import { describe, expect, it } from "vitest";

import { archIconId, classifyArchitecturalRole } from "./archRoles";

import type { EntityType, GraphNode } from "./types";

function node(
    type: EntityType,
    name: string,
    filePath: string
): Pick<GraphNode, "type" | "name" | "filePath"> {
    return { type, name, filePath };
}

describe("classifyArchitecturalRole", () => {

    it("classifies database components", () => {
        expect(
            classifyArchitecturalRole(node("File", "connection.ts", "src/db/connection.ts"))
        ).toBe("database");
        expect(
            classifyArchitecturalRole(node("Class", "Database", "src/persistence/Database.ts"))
        ).toBe("database");
        expect(
            classifyArchitecturalRole(node("Function", "connectPostgres", "src/store.ts"))
        ).toBe("database");
    });

    it("classifies authentication, login and user components", () => {
        expect(
            classifyArchitecturalRole(node("File", "authService.ts", "src/auth/authService.ts"))
        ).toBe("auth");
        expect(
            classifyArchitecturalRole(node("Function", "signIn", "src/pages/signIn.ts"))
        ).toBe("login");
        expect(
            classifyArchitecturalRole(node("Class", "UserService", "src/users/UserService.ts"))
        ).toBe("users");
    });

    it("classifies api, payment and external integration components", () => {
        expect(
            classifyArchitecturalRole(node("File", "userController.ts", "src/api/userController.ts"))
        ).toBe("api");
        expect(
            classifyArchitecturalRole(node("Class", "PaymentService", "src/billing/PaymentService.ts"))
        ).toBe("payment");
        expect(
            classifyArchitecturalRole(node("Function", "sendWebhook", "src/integrations/webhooks.ts"))
        ).toBe("external");
    });

    it("applies precedence deterministically", () => {
        // "auth" outranks "login" for a login page inside an auth module.
        expect(
            classifyArchitecturalRole(node("File", "LoginService.ts", "src/auth/LoginService.ts"))
        ).toBe("auth");
        // Payment outranks the rest for a billing API route.
        expect(
            classifyArchitecturalRole(node("File", "route.ts", "src/billing/route.ts"))
        ).toBe("payment");
    });

    it("leaves ambiguous nodes unclassified", () => {
        expect(classifyArchitecturalRole(node("File", "helpers.ts", "src/utils/helpers.ts"))).toBeNull();
        expect(classifyArchitecturalRole(node("Function", "formatDate", "src/format.ts"))).toBeNull();
        expect(classifyArchitecturalRole(node("Class", "Lexer", "src/lexer.ts"))).toBeNull();
    });

    it("never classifies test, spec or fixture files", () => {
        expect(
            classifyArchitecturalRole(node("File", "auth.test.ts", "src/auth/auth.test.ts"))
        ).toBeNull();
        expect(
            classifyArchitecturalRole(node("File", "login.spec.ts", "src/login.spec.ts"))
        ).toBeNull();
        expect(
            classifyArchitecturalRole(node("Function", "testLogin", "src/auth.ts"))
        ).toBeNull();
        expect(
            classifyArchitecturalRole(node("Directory", "fixtures", "test/fixtures"))
        ).toBeNull();
    });

    it("never classifies repository or variable nodes", () => {
        expect(
            classifyArchitecturalRole(node("Repository", "demo", ""))
        ).toBeNull();
        expect(
            classifyArchitecturalRole(node("Variable", "db", "src/db.ts"))
        ).toBeNull();
    });

    it("is deterministic for repeated calls", () => {
        const candidate = node("File", "stripe.ts", "src/payments/stripe.ts");

        expect(classifyArchitecturalRole(candidate)).toBe("payment");
        expect(classifyArchitecturalRole(candidate)).toBe("payment");
    });
});

describe("archIconId", () => {
    it("builds stable symbol ids", () => {
        expect(archIconId("database")).toBe("ca-icon-database");
    });
});
