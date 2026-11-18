import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode
} from "react";

import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

export interface AuthContextValue {
    session: Session | null;
    user: User | null;
    loading: boolean;
    /** True when the user arrived through a password-recovery link. */
    recovery: boolean;
    signUp: (
        email: string,
        password: string,
        fullName: string
    ) => Promise<{ needsEmailConfirmation: boolean }>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    sendPasswordReset: (email: string) => Promise<void>;
    updatePassword: (password: string) => Promise<void>;
}

const noop = async (): Promise<void> => undefined;

/*
 * A safe default value so components that call useAuth() still render when
 * they are mounted without a provider (for example in focused component
 * tests). The real provider replaces this.
 */
const AuthContext = createContext<AuthContextValue>({
    session: null,
    user: null,
    loading: false,
    recovery: false,
    signUp: async () => ({ needsEmailConfirmation: false }),
    signIn: noop,
    signOut: noop,
    sendPasswordReset: noop,
    updatePassword: noop
});

export function useAuth(): AuthContextValue {
    return useContext(AuthContext);
}

/**
 * Authentication state for the whole app (Build 06). It restores the existing
 * session on load, tracks sign-in/out, and surfaces a password-recovery state
 * so the user can set a new password.
 */
export function AuthProvider({ children }: { children: ReactNode }) {

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [recovery, setRecovery] = useState(false);

    useEffect(() => {

        let active = true;

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (!active) {
                    return;
                }
                setSession(data.session ?? null);
                setLoading(false);
            })
            .catch(() => {
                if (active) {
                    setLoading(false);
                }
            });

        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
            setSession(nextSession);
            setLoading(false);

            if (event === "PASSWORD_RECOVERY") {
                setRecovery(true);
            }
        });

        return () => {
            active = false;
            data.subscription.unsubscribe();
        };

    }, []);

    const signUp = useCallback(
        async (email: string, password: string, fullName: string) => {

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName } }
            });

            if (error) {
                throw new Error(error.message);
            }

            /* With email confirmation on, no session is returned yet. */
            return { needsEmailConfirmation: !data.session };
        },
        []
    );

    const signIn = useCallback(async (email: string, password: string) => {

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw new Error(error.message);
        }
    }, []);

    const signOut = useCallback(async () => {

        const { error } = await supabase.auth.signOut();

        if (error) {
            throw new Error(error.message);
        }
    }, []);

    const sendPasswordReset = useCallback(async (email: string) => {

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo:
                typeof window !== "undefined"
                    ? window.location.origin
                    : undefined
        });

        if (error) {
            throw new Error(error.message);
        }
    }, []);

    const updatePassword = useCallback(async (password: string) => {

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            throw new Error(error.message);
        }

        setRecovery(false);
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            user: session?.user ?? null,
            loading,
            recovery,
            signUp,
            signIn,
            signOut,
            sendPasswordReset,
            updatePassword
        }),
        [
            session,
            loading,
            recovery,
            signUp,
            signIn,
            signOut,
            sendPasswordReset,
            updatePassword
        ]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
