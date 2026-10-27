"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // The magic-link confirm route sends failures back here as ?error=link.
  // Read it from the URL (not useSearchParams) so this page stays static.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setStatus("error");
      setMessage("That sign-in link didn't work — it may have expired. Enter your email to get a new one.");
    }
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">D</span>
          Dashboard
        </div>

        {status === "sent" ? (
          <div className="auth-done">
            <span className="auth-done-icon">
              <Icon name="mail" size={24} />
            </span>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-lede">
              We sent a sign-in link to <strong>{email}</strong>. Open it on this device to finish signing in. You
              can close this tab.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStatus("idle");
                setMessage("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 className="auth-title">Sign in</h1>
            <p className="auth-lede">
              Enter your email and we&apos;ll send you a one-time sign-in link. No password needed.
            </p>

            <form className="auth-form" onSubmit={onSubmit}>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "sending"}
                />
              </label>

              {status === "error" ? (
                <p className="auth-error" role="alert">
                  {message}
                </p>
              ) : null}

              <button type="submit" className="btn btn-dark auth-submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="auth-foot">Private dashboard · only invited accounts can sign in.</p>
    </main>
  );
}
