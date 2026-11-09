"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Mode = "signin" | "signup" | "forgot";

async function post(path: string, body: Record<string, string>): Promise<{ ok: boolean; error?: string; signedIn?: boolean }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; signedIn?: boolean } | null;
    if (!data) return { ok: false, error: "Something went wrong. Try again." };
    return { ok: !!data.ok, error: data.error, signedIn: data.signedIn };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export function LoginClient({ connected }: { connected: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  // The emailed link sends failures back here as ?error=link. Read it from the
  // URL (not useSearchParams) so this page needs no Suspense boundary.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setError("That sign-in link didn't work. It may have expired, so ask for a new one.");
      setMode("forgot");
    }
  }, []);

  function switchTo(next: Mode) {
    setMode(next);
    setError("");
    setSent("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    setBusy(true);
    setError("");

    if (mode === "forgot") {
      const res = await post("/api/auth/link", { email: field("email") });
      setBusy(false);
      if (res.ok) setSent(field("email"));
      else setError(res.error ?? "Couldn't send the email.");
      return;
    }

    const res =
      mode === "signin"
        ? await post("/api/auth/signin", { email: field("email"), password: field("password") })
        : await post("/api/auth/signup", {
            email: field("email"),
            password: field("password"),
          });

    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? "Something went wrong. Try again.");
      return;
    }
    if (mode === "signup" && res.signedIn === false) {
      setBusy(false);
      setMode("signin");
      setError("Your account is ready. Sign in with the email and password you just chose.");
      return;
    }
    // A full page load, so every page sees the new session cookies.
    window.location.assign(mode === "signup" ? "/welcome" : "/");
  }

  if (!connected) {
    return (
      <main className="auth">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="brand-logo">D</span>
            Dashboard
          </div>
          <h1 className="auth-title">Supabase isn&apos;t connected yet</h1>
          <p className="auth-lede">
            Sign-in switches on once SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY are added in
            Vercel and the site is redeployed. SETUP.md has the steps.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">D</span>
          Dashboard
        </div>

        {sent ? (
          <div className="auth-done">
            <span className="auth-done-icon">
              <Icon name="mail" size={24} />
            </span>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-lede">
              If <strong>{sent}</strong> has an account, a sign-in link is on its way. Open it on this device, then set a
              new password in Settings.
            </p>
            <button type="button" className="btn" onClick={() => switchTo("signin")}>
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            {mode !== "forgot" ? (
              <div className="seg auth-tabs" role="tablist" aria-label="Sign in or create an account">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    className={`seg-btn${mode === m ? " is-active" : ""}`}
                    onClick={() => switchTo(m)}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
            ) : null}

            <h1 className="auth-title">
              {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Forgot your password?"}
            </h1>
            <p className="auth-lede">
              {mode === "signin"
                ? "Sign in with your email and password."
                : mode === "signup"
                  ? "Just an email and a password. Next you\u2019ll pick your year and subjects."
                  : "We'll email you a one-time sign-in link. Then set a new password in Settings."}
            </p>

            <form className="auth-form" onSubmit={onSubmit} key={mode}>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  required
                  placeholder="you@example.com"
                />
              </label>

              {mode !== "forgot" ? (
                <label className="field">
                  <span className="field-label">Password</span>
                  <input
                    className="input"
                    type="password"
                    name="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    maxLength={72}
                  />
                  {mode === "signup" ? <span className="field-help">At least 8 characters.</span> : null}
                </label>
              ) : null}

              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button type="submit" className="btn btn-dark auth-submit" disabled={busy}>
                {busy
                  ? mode === "signin"
                    ? "Signing in…"
                    : mode === "signup"
                      ? "Creating account…"
                      : "Sending…"
                  : mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                      ? "Create account"
                      : "Email me a sign-in link"}
              </button>
            </form>

            {mode === "signin" ? (
              <button type="button" className="auth-link" onClick={() => switchTo("forgot")}>
                Forgot your password?
              </button>
            ) : mode === "forgot" ? (
              <button type="button" className="auth-link" onClick={() => switchTo("signin")}>
                Back to sign in
              </button>
            ) : null}
          </>
        )}
      </div>

      <p className="auth-foot">Private dashboard · each account only sees its own data.</p>
    </main>
  );
}
