import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import AuthGate from "./auth/AuthGate";

/*
 * Build 06 — frontend authentication.
 *
 * The Supabase browser client is mocked, so no real credentials are used.
 * AuthProvider, AuthGate and AuthScreen are exercised for real.
 */
const { authMock, authListeners } = vi.hoisted(() => {
    const authListeners: Array<
        (event: string, session: unknown) => void
    > = [];

    const authMock = {
        getSession: vi.fn(
            async (): Promise<{ data: { session: unknown }; error: unknown }> => ({
                data: { session: null },
                error: null
            })
        ),
        onAuthStateChange: vi.fn(
            (callback: (event: string, session: unknown) => void) => {
                authListeners.push(callback);
                return {
                    data: { subscription: { unsubscribe: vi.fn() } }
                };
            }
        ),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn()
    };

    return { authMock, authListeners };
});

vi.mock("./lib/supabase", () => ({
    supabase: { auth: authMock }
}));

const SESSION = {
    access_token: "test-token",
    user: { id: "user-1", email: "ada@example.com" }
};

/** A stand-in for the dashboard that can sign out. */
function DashboardStub() {
    const { signOut } = useAuth();
    return (
        <button onClick={() => void signOut()}>Sign out</button>
    );
}

function renderApp() {
    return render(
        <AuthProvider>
            <AuthGate>
                <DashboardStub />
            </AuthGate>
        </AuthProvider>
    );
}

function emitAuthChange(event: string, session: unknown) {
    act(() => {
        authListeners.forEach((listener) => listener(event, session));
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    authListeners.length = 0;
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

afterEach(() => {
    cleanup();
});

describe("Build 06 — frontend authentication (mocked Supabase)", () => {

    it("shows a loading state while the session is restored", () => {
        authMock.getSession.mockReturnValue(new Promise(() => undefined) as never);

        renderApp();

        expect(screen.getByRole("status")).toHaveTextContent(
            /restoring your session/i
        );
    });

    it("protects the dashboard when there is no session", async () => {
        renderApp();

        expect(
            await screen.findByText("Log in to CodeAtlas")
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    });

    it("restores an existing session without returning to login", async () => {
        authMock.getSession.mockResolvedValue({
            data: { session: SESSION },
            error: null
        });

        renderApp();

        expect(
            await screen.findByRole("button", { name: "Sign out" })
        ).toBeInTheDocument();
        expect(screen.queryByText("Log in to CodeAtlas")).toBeNull();
    });

    it("signs up with a full name and reports email confirmation", async () => {
        authMock.signUp.mockResolvedValue({ data: { session: null }, error: null });

        renderApp();
        await screen.findByText("Log in to CodeAtlas");

        fireEvent.click(screen.getByRole("button", { name: "Create an account" }));

        fireEvent.change(screen.getByLabelText("Full name"), {
            target: { value: "Ada Lovelace" }
        });
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "ada@example.com" }
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "secret1" }
        });

        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

        expect(
            await screen.findByText(/check your inbox/i)
        ).toBeInTheDocument();
        expect(authMock.signUp).toHaveBeenCalledWith({
            email: "ada@example.com",
            password: "secret1",
            options: { data: { full_name: "Ada Lovelace" } }
        });
    });

    it("validates the signup password before calling Supabase", async () => {
        renderApp();
        await screen.findByText("Log in to CodeAtlas");

        fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "ada@example.com" }
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "123" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

        expect(
            await screen.findByRole("alert")
        ).toHaveTextContent(/at least 6 characters/i);
        expect(authMock.signUp).not.toHaveBeenCalled();
    });

    it("logs in and enters the dashboard when the session arrives", async () => {
        authMock.signInWithPassword.mockResolvedValue({
            data: { session: SESSION },
            error: null
        });

        renderApp();
        await screen.findByText("Log in to CodeAtlas");

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "ada@example.com" }
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "secret1" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Log in" }));

        expect(authMock.signInWithPassword).toHaveBeenCalledWith({
            email: "ada@example.com",
            password: "secret1"
        });

        emitAuthChange("SIGNED_IN", SESSION);

        expect(
            await screen.findByRole("button", { name: "Sign out" })
        ).toBeInTheDocument();
    });

    it("surfaces a login error", async () => {
        authMock.signInWithPassword.mockResolvedValue({
            data: { session: null },
            error: { message: "Invalid login credentials" }
        });

        renderApp();
        await screen.findByText("Log in to CodeAtlas");

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "ada@example.com" }
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "wrong" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Log in" }));

        expect(
            await screen.findByRole("alert")
        ).toHaveTextContent(/invalid login credentials/i);
    });

    it("logs out and returns to the login screen", async () => {
        authMock.getSession.mockResolvedValue({
            data: { session: SESSION },
            error: null
        });
        authMock.signOut.mockResolvedValue({ error: null });

        renderApp();
        await screen.findByRole("button", { name: "Sign out" });

        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

        expect(authMock.signOut).toHaveBeenCalledTimes(1);

        emitAuthChange("SIGNED_OUT", null);

        expect(
            await screen.findByText("Log in to CodeAtlas")
        ).toBeInTheDocument();
    });
});
