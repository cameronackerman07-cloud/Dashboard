"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { ConnMeta } from "@/lib/oauth-store";

const STATUS: Record<ConnMeta["status"], string> = { active: "Connected", needs_reconnect: "Needs reconnecting", blocked: "Blocked by school" };
const SCOPES = [
  { id: "calendar", label: "Calendar" },
  { id: "classroom", label: "Classroom due dates" },
  { id: "drive", label: "Drive (pick files to summarise)" },
];

export function GoogleConnect({ accounts, configured, notice }: { accounts: ConnMeta[]; configured: boolean; notice: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState(notice ?? "");
  const [label, setLabel] = useState(accounts.length ? "School" : "Personal");
  const [scopes, setScopes] = useState<string[]>(["calendar", "classroom"]);

  async function post(path: string, id: string) {
    setBusy(id);
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .then((r) => r.json())
      .catch(() => ({ message: "Couldn't reach the server." }));
    setMessage(res.message ?? "");
    setBusy(null);
    router.refresh();
  }

  const connectHref = (l: string, s: string[]) => `/api/google/connect?label=${encodeURIComponent(l)}&scopes=${s.join(",")}`;

  return (
    <section className="connect-card" aria-label="Google accounts">
      <div className="connect-head">
        <span className="connect-logo">
          <Icon name="google" size={22} />
        </span>
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Google: personal and school</h2>
          <span className="list-desc">Calendar events and Classroom due dates, read-only. Connect as many accounts as you like.</span>
        </div>
        <span className={accounts.length ? "chip" : "chip-outline"}>{accounts.length ? `${accounts.length} CONNECTED` : "Not connected"}</span>
      </div>
      {!configured ? <p className="notice">Google isn&apos;t set up yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET need adding in Vercel (see SETUP.md).</p> : null}
      {accounts.length ? (
        <div className="list-card">
          {accounts.map((a) => (
            <div className="list-row" key={a.id}>
              <div className="list-text">
                <span className="list-name">
                  {a.label}
                  {a.accountHint ? ` · ${a.accountHint}` : ""}
                </span>
                <span className="list-desc">
                  {STATUS[a.status]} · {a.scopes.join(", ")}
                  {a.lastSyncedAt ? ` · synced ${new Date(a.lastSyncedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                </span>
                {a.lastError ? <span className="list-desc">{a.lastError}</span> : null}
              </div>
              <div className="row-actions">
                {a.status === "active" ? (
                  <button type="button" className="btn btn-small" disabled={busy === a.id} onClick={() => post("/api/google/sync", a.id)}>
                    {busy === a.id ? "Syncing…" : "Sync now"}
                  </button>
                ) : (
                  <a className="btn btn-small" href={connectHref(a.label, a.scopes)}>
                    Reconnect
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy === a.id}
                  onClick={() => window.confirm(`Disconnect ${a.label}? Google access is revoked too.`) && post("/api/google/disconnect", a.id)}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="field">
        <span className="field-label">Connect an account</span>
        <div className="track-fields">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} aria-label="Label, e.g. Personal or School" placeholder="Personal or School" />
        </div>
        <div className="idea-row" role="group" aria-label="What to read">
          {SCOPES.map((s) => (
            <label className="paste-replace" key={s.id}>
              <input type="checkbox" checked={scopes.includes(s.id)} onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))} />
              {s.label}
            </label>
          ))}
        </div>
        <div className="note-actions">
          <a className={`btn btn-dark${!configured || scopes.length === 0 ? " is-disabled" : ""}`} href={configured && scopes.length ? connectHref(label || "Personal", scopes) : undefined} aria-disabled={!configured || scopes.length === 0}>
            Connect Google
          </a>
        </div>
        <span className="field-help">
          Google shows an &ldquo;unverified app&rdquo; warning because this is a personal project: choose Advanced → Go to Dashboard. If your school blocks
          it, share your school calendar to your personal account and connect that instead.
        </span>
      </div>
      {message ? (
        <p className="mark-cards" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
