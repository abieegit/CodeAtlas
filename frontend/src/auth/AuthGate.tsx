import type { ReactNode } from "react";

import AuthScreen from "../components/AuthScreen";
import { useAuth } from "./AuthContext";

/**
 * Gates the dashboard behind authentication (Build 06).
 *
 *  - while the session is being restored → a loading state;
 *  - a password-recovery link → the "set a new password" screen;
 *  - no session → the login/signup screen;
 *  - a session → the dashboard.
 *
 * The interface has no router, so this gate is the single protected boundary:
 * an unauthenticated visitor can never reach the dashboard.
 */
export default function AuthGate({ children }: { children: ReactNode }) {

    const { session, loading, recovery } = useAuth();

    if (loading) {
        return (
            <div
                className="flex h-full items-center justify-center bg-black text-sm text-neutral-400"
                role="status"
            >
                Restoring your session…
            </div>
        );
    }

    if (recovery) {
        return <AuthScreen recovery />;
    }

    if (!session) {
        return <AuthScreen />;
    }

    return <>{children}</>;
}
