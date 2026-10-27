"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

type Method = "feed" | "token";

const METHODS: { id: Method; title: string; desc: string }[] = [
  { id: "feed", title: "Calendar feed", desc: "Works at every school. Brings in assignments and due dates." },
  {
    id: "token",
    title: "Access token",
    desc: "Adds full task details, announcements and marks. Some schools turn this off.",
  },
];

export function CanvasConnect() {
  const [method, setMethod] = useState<Method>("feed");

  return (
    <section className="connect-card" aria-label="Canvas">
      <div className="connect-head">
        <span className="connect-logo">
          <Icon name="canvas" size={22} />
        </span>
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Canvas</h2>
          <span className="list-desc">Courses, assignments, due dates, announcements and marks</span>
        </div>
        <span className="chip-outline">Not connected</span>
      </div>

      <div className="field">
        <label htmlFor="canvas-url" className="field-label">
          1. Your school&apos;s Canvas address
        </label>
        <input id="canvas-url" className="input" type="text" placeholder="yourschool.instructure.com" autoComplete="off" />
        <span className="field-help">Copy it from your browser&apos;s address bar when you&apos;re logged into Canvas.</span>
      </div>

      <div className="field">
        <span className="field-label">2. How should it connect?</span>
        <div className="choice-grid">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="choice"
              aria-pressed={method === m.id}
              onClick={() => setMethod(m.id)}
            >
              <span className="choice-title">{m.title}</span>
              <span className="choice-desc">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {method === "feed" ? (
        <div className="steps">
          <span className="field-label">3. Get your calendar feed link</span>
          <ol>
            <li>
              In Canvas, open <strong>Calendar</strong>.
            </li>
            <li>
              Click <strong>Calendar Feed</strong> (bottom of the right-hand column).
            </li>
            <li>Copy the link and paste it here.</li>
          </ol>
          <label htmlFor="canvas-feed" className="field-label" style={{ fontWeight: 600 }}>
            Calendar feed link
          </label>
          <input
            id="canvas-feed"
            className="input"
            type="url"
            placeholder="https://yourschool.instructure.com/feeds/calendars/…"
            autoComplete="off"
          />
        </div>
      ) : (
        <div className="steps">
          <span className="field-label">3. Make an access token</span>
          <ol>
            <li>
              In Canvas, go to <strong>Account → Settings</strong>.
            </li>
            <li>
              Under <strong>Approved Integrations</strong>, click <strong>+ New Access Token</strong>.
            </li>
            <li>Name it “Dashboard”, copy the token and paste it here. Don&apos;t send it anywhere else.</li>
          </ol>
          <label htmlFor="canvas-token" className="field-label" style={{ fontWeight: 600 }}>
            Access token
          </label>
          <input id="canvas-token" className="input" type="password" placeholder="Paste token" autoComplete="off" />
          <span className="field-help">Saved encrypted on your account. It won&apos;t be shown again after you save it.</span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <button type="button" className="btn btn-dark" disabled title="Switches on once Supabase is set up">
          Test &amp; connect
        </button>
        <span className="field-help">
          Switches on once your login and database are set up (next step).{" "}
          {method === "feed" ? "Checks for new tasks every hour." : "Checks for new tasks every 15 minutes."}
        </span>
      </div>
    </section>
  );
}
