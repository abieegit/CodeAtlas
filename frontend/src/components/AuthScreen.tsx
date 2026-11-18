import { useState, type FormEvent } from "react";

import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "signup" | "reset" | "update";

interface Props {
    /** Shown when the user arrived through a password-recovery link. */
    recovery?: boolean;
}

const inputClass =
    "rounded border border-neutral-800 bg-black px-3 py-2 text-sm text-white " +
    "outline-none placeholder:text-neutral-600 focus:border-white disabled:opacity-50";

/**
 * Login / signup / password-reset screen (Build 06), styled to match the
 * CodeAtlas dashboard (black surfaces, white text, neutral borders).
 */
export default function AuthScreen({ recovery = false }: Props) {

    const { signIn, signUp, sendPasswordReset, updatePassword } = useAuth();

    const [mode, setMode] = useState<Mode>(recovery ? "update" : "login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const isUpdate = mode === "update";

    function switchMode(next: Mode): void {
        setMode(next);
        setError("");
        setNotice("");
        setPassword("");
    }

    async function submit(event: FormEvent): Promise<void> {

        event.preventDefault();
        setError("");
        setNotice("");

        if (!isUpdate && email.trim() === "") {
            setError("Enter your email address.");
            return;
        }

        if (mode !== "reset" && password === "") {
            setError("Enter your password.");
            return;
        }

        if ((mode === "signup" || isUpdate) && password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setBusy(true);

        try {

            if (mode === "login") {
                await signIn(email.trim(), password);

            } else if (mode === "signup") {

                const { needsEmailConfirmation } = await signUp(
                    email.trim(),
                    password,
                    fullName.trim()
                );

                if (needsEmailConfirmation) {
                    setNotice(
                        "Account created. Check your inbox to confirm your " +
                            "email, then log in."
                    );
                    setMode("login");
                    setPassword("");
                }

            } else if (mode === "reset") {

                await sendPasswordReset(email.trim());
                setNotice(
                    "If that email is registered, a reset link is on its way."
                );

            } else {

                await updatePassword(password);
                setNotice("Password updated. You are signed in.");
            }

        } catch (cause) {

            setError((cause as Error).message);

        } finally {

            setBusy(false);
        }
    }

    const heading = isUpdate
        ? "Set a new password"
        : mode === "login"
          ? "Log in to CodeAtlas"
          : mode === "signup"
            ? "Create your account"
            : "Reset your password";

    return (
        <div className="flex min-h-full items-center justify-center bg-black px-4 py-10">
            <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-black p-6">

                <h1 className="text-lg font-semibold text-white">CodeAtlas</h1>
                <p className="mt-1 text-xs text-neutral-500">
                    Turn a JavaScript or TypeScript repository into an
                    interactive knowledge graph.
                </p>

                <h2 className="mt-6 text-sm font-medium text-white">
                    {heading}
                </h2>

                <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>

                    {mode === "signup" && (
                        <label className="flex flex-col gap-1 text-xs text-neutral-400">
                            Full name
                            <input
                                className={inputClass}
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                autoComplete="name"
                                disabled={busy}
                            />
                        </label>
                    )}

                    {!isUpdate && (
                        <label className="flex flex-col gap-1 text-xs text-neutral-400">
                            Email
                            <input
                                type="email"
                                className={inputClass}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                                disabled={busy}
                            />
                        </label>
                    )}

                    {mode !== "reset" && (
                        <label className="flex flex-col gap-1 text-xs text-neutral-400">
                            Password
                            <input
                                type="password"
                                className={inputClass}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete={
                                    mode === "login"
                                        ? "current-password"
                                        : "new-password"
                                }
                                disabled={busy}
                            />
                        </label>
                    )}

                    {error !== "" && (
                        <p
                            role="alert"
                            className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs leading-snug text-red-400"
                        >
                            {error}
                        </p>
                    )}

                    {notice !== "" && (
                        <p
                            role="status"
                            className="rounded border border-neutral-800 px-3 py-2 text-xs leading-snug text-neutral-300"
                        >
                            {notice}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="mt-1 rounded bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-40"
                    >
                        {busy
                            ? "Please wait…"
                            : isUpdate
                              ? "Update password"
                              : mode === "login"
                                ? "Log in"
                                : mode === "signup"
                                  ? "Sign up"
                                  : "Send reset link"}
                    </button>
                </form>

                {!isUpdate && (
                    <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-neutral-500">
                        {mode === "login" ? (
                            <>
                                <button
                                    type="button"
                                    className="hover:text-white"
                                    onClick={() => switchMode("signup")}
                                    disabled={busy}
                                >
                                    Create an account
                                </button>
                                <button
                                    type="button"
                                    className="hover:text-white"
                                    onClick={() => switchMode("reset")}
                                    disabled={busy}
                                >
                                    Forgot password?
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="hover:text-white"
                                onClick={() => switchMode("login")}
                                disabled={busy}
                            >
                                Back to log in
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
