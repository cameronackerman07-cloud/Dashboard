"use client";

import { useState, useTransition } from "react";
import { updateDisplayName, updatePassword, type AccountReply } from "@/app/(app)/settings/account-actions";

export function AccountCard({ displayName, email }: { displayName: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState<AccountReply | null>(null);

  function run(action: () => Promise<AccountReply>, form: HTMLFormElement, clear: boolean) {
    setReply(null);
    startTransition(async () => {
      try {
        const res = await action();
        setReply(res);
        if (res.ok && clear) form.reset();
      } catch {
        setReply({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  return (
    <section className="card" aria-label="Your account">
      <div className="card-head">
        <h2 className="card-title">Your account</h2>
        <span className="card-meta">{email}</span>
      </div>
      <form
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("name") ?? "");
          run(() => updateDisplayName(value), e.currentTarget, false);
        }}
      >
        <input
          name="name"
          className="input"
          defaultValue={displayName}
          maxLength={40}
          aria-label="Your name"
          autoComplete="given-name"
          required
        />
        <button type="submit" className="btn" disabled={pending}>
          Save name
        </button>
      </form>
      <form
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("password") ?? "");
          run(() => updatePassword(value), e.currentTarget, true);
        }}
      >
        <input
          name="password"
          type="password"
          className="input"
          placeholder="New password (8+ characters)"
          aria-label="New password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
        />
        <button type="submit" className="btn" disabled={pending}>
          Change password
        </button>
      </form>
      {reply ? (
        <p className={reply.ok ? "mark-cards" : "ai-error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </p>
      ) : null}
    </section>
  );
}
