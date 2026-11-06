"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { connectCanvas, disconnectCanvas, syncCanvasNow, type CalendarReply } from "@/app/(app)/settings/actions";
import { Icon } from "@/components/Icon";

type Method = "token" | "feed";

export type CanvasState = {
  method: Method;
  host: string;
  needsFixing: boolean;
  syncedLabel: string | null;
} | null;

const METHODS: { id: Method; title: string; desc: string }[] = [
  {
    id: "token",
    title: "Address + access token",
    desc: "Best: knows what you've already handed in and ticks it off.",
  },
  {
    id: "feed",
    title: "Calendar feed link",
    desc: "Works even if your school turns tokens off. Can't see what you've submitted.",
  },
];

export function CanvasConnect({ state }: { state: CanvasState }) {
  const [method, setMethod] = useState<Method>(state?.method ?? "token");
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState<CalendarReply | null>(null);
  const [showForm, setShowForm] = useState(!state);
  const formRef = useRef<HTMLFormElement>(null);

  function run(action: () => Promise<CalendarReply>, after?: () => void) {
    setReply(null);
    startTransition(async () => {
      try {
        const res = await action();
        setReply(res);
        if (res.ok) after?.();
      } catch {
        setReply({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  const chip = !state ? "Not connected" : state.needsFixing ? "NEEDS FIXING" : "CONNECTED";

  return (
    <section className="connect-card" aria-label="Canvas">
      <div className="connect-head">
        <span className="connect-logo">
          <Icon name="canvas" size={22} />
        </span>
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Canvas</h2>
          <span className="list-desc">Assignments and due dates, on Assignments, Home and Calendar</span>
        </div>
        <span className={state && !state.needsFixing ? "chip" : "chip-outline"}>{chip}</span>
      </div>

      {state ? (
        <div className="field">
          <span className="field-label">
            {state.host} · {state.method === "token" ? "access token" : "calendar feed"}
          </span>
          <span className="field-help">
            {state.needsFixing
              ? "Canvas stopped accepting these details (the token may have expired or been deleted). Connect again below."
              : `Checks for new work when you open Assignments or Home, at most every 30 minutes.${state.syncedLabel ? ` Last synced ${state.syncedLabel}.` : ""}`}{" "}
            <Link href="/assignments">Open Assignments</Link>
          </span>
          <div className="note-actions">
            <button type="button" className="btn btn-dark" disabled={pending} onClick={() => run(syncCanvasNow)}>
              {pending ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Hide" : "Change details"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => disconnectCanvas(false))}>
              Disconnect
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => disconnectCanvas(true))}>
              Disconnect and remove its tasks
            </button>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <form
          ref={formRef}
          className="connect-form"
          // onSubmit, not action: React clears an action form even when connecting
          // fails, which would wipe what was typed.
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              () => connectCanvas(fd),
              () => {
                formRef.current?.reset();
                setShowForm(false);
              },
            );
          }}
        >
          <input type="hidden" name="method" value={method} />
          <div className="field">
            <span className="field-label">1. How should it connect?</span>
            <div className="choice-grid">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="choice"
                  aria-pressed={method === m.id}
                  onClick={() => {
                    setMethod(m.id);
                    setReply(null);
                  }}
                >
                  <span className="choice-title">{m.title}</span>
                  <span className="choice-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {method === "token" ? (
            <>
              <div className="field">
                <label htmlFor="canvas-url" className="field-label">
                  2. Your school&apos;s Canvas address
                </label>
                <input
                  id="canvas-url"
                  name="base"
                  className="input"
                  type="text"
                  inputMode="url"
                  placeholder="yourschool.instructure.com"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <span className="field-help">
                  Copy it from your browser&apos;s address bar while you&apos;re signed in to Canvas. Just the first part
                  is fine.
                </span>
              </div>
              <div className="steps">
                <span className="field-label">3. Make an access token</span>
                <ol>
                  <li>
                    In Canvas, click <strong>Account</strong> (your picture, top left) → <strong>Settings</strong>.
                  </li>
                  <li>
                    Under <strong>Approved Integrations</strong>, click <strong>+ New Access Token</strong>.
                  </li>
                  <li>
                    Purpose: “Dashboard”. Leave the expiry blank, or pick the end of the year. Click{" "}
                    <strong>Generate Token</strong>.
                  </li>
                  <li>Copy the long token straight away (Canvas only shows it once) and paste it below.</li>
                </ol>
                <span className="field-help">
                  No <strong>New Access Token</strong> button? Your school has turned tokens off: choose{" "}
                  <strong>Calendar feed link</strong> above instead.
                </span>
              </div>
              <div className="field">
                <label htmlFor="canvas-token" className="field-label">
                  Access token
                </label>
                <input
                  id="canvas-token"
                  name="token"
                  className="input"
                  type="password"
                  placeholder="Paste token"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <span className="field-help">
                  Treat it like a password. It&apos;s saved encrypted, only ever sent to your Canvas address, and never
                  shown again. You can delete it in Canvas at any time to cut off access.
                </span>
              </div>
            </>
          ) : (
            <div className="steps">
              <span className="field-label">2. Copy your calendar feed link</span>
              <ol>
                <li>
                  In Canvas, open <strong>Calendar</strong>.
                </li>
                <li>
                  Click <strong>Calendar Feed</strong> (bottom of the right-hand column) and copy the link.
                </li>
              </ol>
              <label htmlFor="canvas-feed" className="field-label" style={{ fontWeight: 600 }}>
                Calendar feed link
              </label>
              <input
                id="canvas-feed"
                name="link"
                className="input"
                type="text"
                inputMode="url"
                placeholder="https://yourschool.instructure.com/feeds/calendars/…"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <span className="field-help">
                Anyone with this link can see your Canvas calendar, so it&apos;s stored encrypted and never shown again.
              </span>
            </div>
          )}

          <div className="note-actions">
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? "Checking…" : state ? "Test & replace" : "Test & connect"}
            </button>
          </div>
        </form>
      ) : null}

      {reply ? (
        <p className={reply.ok ? "mark-cards" : "ai-error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </p>
      ) : null}
    </section>
  );
}
