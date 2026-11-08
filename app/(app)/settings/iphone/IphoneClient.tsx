"use client";

import { useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import type { Reply } from "@/lib/validate";
import { createDeviceToken, regenerateCalendarToken, revokeDeviceToken, stopCalendarFeed } from "./actions";

type Token = { id: string; label: string; scope: string; lastUsed: string | null };

type Recipe = { name: string; phrase: string; path: string; method: "GET" | "POST"; body?: string; finish: string; write?: boolean };

const RECIPES: Recipe[] = [
  { name: "What's due", phrase: "What's due", path: "due", method: "GET", finish: "Add Speak Text and choose the Contents of URL." },
  { name: "Today", phrase: "Today", path: "today", method: "GET", finish: "Add Speak Text (or Show Result) with the Contents of URL." },
  { name: "Next shift", phrase: "Next shift", path: "next-shift", method: "GET", finish: "Add Speak Text with the Contents of URL." },
  { name: "Add to dashboard", phrase: "Add to dashboard", path: "add-todo", method: "POST", body: `{"title": "<Dictated Text>"}`, finish: "Before it, add Dictate Text. In the request body choose JSON, add a key title, and set it to Dictated Text. End with Speak Text.", write: true },
  { name: "Save to notes", phrase: "Save to notes", path: "add-note", method: "POST", body: `{"text": "<Shortcut Input>"}`, finish: "Turn on Show in Share Sheet (accepts URLs and Text). In the JSON body add a key text set to Shortcut Input. Now Share → Save to notes works from Safari.", write: true },
  { name: "Log habit", phrase: "Log habit", path: "log-habit", method: "POST", body: `{"habit": "<Ask for Input>"}`, finish: "Before it, add Ask for Input (\"Which habit?\"). Put the answer in a JSON key habit. End with Speak Text.", write: true },
  { name: "Ask The BRIAN", phrase: "Ask The BRIAN", path: "ask", method: "POST", body: `{"question": "<Dictated Text>"}`, finish: "Before it, add Dictate Text. JSON key question = Dictated Text. End with Speak Text. Uses your own AI key.", write: true },
  { name: "Cleaning hours", phrase: "Cleaning hours", path: "cleaner-hours", method: "GET", finish: "Add Speak Text or Send Message with the Contents of URL." },
];

function copy(text: string, set: (r: Reply) => void) {
  navigator.clipboard?.writeText(text).then(
    () => set({ ok: true, message: "Copied." }),
    () => set({ ok: false, message: "Couldn't copy: select it and copy by hand." }),
  );
}

export function IphoneClient({ site, tokens, hasCalendar }: { site: string; tokens: Token[]; hasCalendar: boolean }) {
  const make = useAction();
  const cal = useAction();
  const [shown, setShown] = useState<string | null>(null);
  const [feed, setFeed] = useState<{ url: string; qr: string | null } | null>(null);
  const [copied, setCopied] = useState<Reply | null>(null);
  const [testMsg, setTestMsg] = useState<string>("");

  async function makeFeed() {
    const res = await regenerateCalendarToken();
    if (res.ok && res.token) {
      const url = `${site.replace(/^https?:/, "webcal:")}/api/calendar/feed/${res.token}.ics`;
      let qr: string | null = null;
      try {
        const QR = await import("qrcode");
        qr = await QR.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0a0a0a", light: "#ffffff" } });
      } catch {
        /* the link still works */
      }
      setFeed({ url, qr });
    }
    return res;
  }

  async function test(token: string) {
    const res = await fetch("/api/shortcuts/ping?format=text", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.text()).catch(() => "Couldn't reach the server.");
    setTestMsg(res);
  }

  return (
    <>
      <section className="card" aria-label="Siri tokens">
        <h2 className="card-title">1. Make a token for each device</h2>
        <p className="track-empty">
          Shortcuts use a token instead of your password. It goes in an Authorization header, never in a link. A read token can only look
          things up; a write token can also add to-dos, notes and habit ticks.
        </p>
        <form
          className="track-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            make.run(async () => {
              const res = await createDeviceToken(String(f.get("label") ?? ""), String(f.get("scope") ?? "read"));
              if (res.token) setShown(res.token);
              return res;
            });
          }}
        >
          <input name="label" className="input" placeholder="e.g. Cameron's iPhone" maxLength={40} aria-label="Device name" />
          <select name="scope" className="input" aria-label="Access" defaultValue="write">
            <option value="read">Read only</option>
            <option value="write">Read and add things</option>
          </select>
          <button type="submit" className="btn btn-dark" disabled={make.pending}>
            Make token
          </button>
        </form>
        <ReplyLine reply={make.reply} />
        {shown ? (
          <div className="steps">
            <span className="field-label">Your new token (shown once)</span>
            <code className="token-box">{shown}</code>
            <div className="note-actions">
              <button type="button" className="btn btn-small" onClick={() => copy(shown, setCopied)}>
                Copy token
              </button>
              <button type="button" className="btn btn-small" onClick={() => test(shown)}>
                Run a test call
              </button>
            </div>
            {testMsg ? <span className="field-help">{testMsg}</span> : null}
            <ReplyLine reply={copied} />
          </div>
        ) : null}
        {tokens.length ? (
          <div className="track-list">
            {tokens.map((t) => (
              <div className="task" key={t.id}>
                <div className="task-body">
                  <span className="task-title">{t.label}</span>
                  <span className="task-sub">
                    {t.scope === "write" ? "Read and add" : "Read only"} · {t.lastUsed ? `last used ${new Date(t.lastUsed).toLocaleString()}` : "not used yet"}
                  </span>
                </div>
                <button type="button" className="btn btn-small" onClick={() => window.confirm(`Revoke ${t.label}?`) && make.run(() => revokeDeviceToken(t.id))}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card" aria-label="Shortcut recipes">
        <h2 className="card-title">2. Build the Shortcuts</h2>
        <p className="track-empty">
          In the Shortcuts app tap +, add the actions below, then name the shortcut with the phrase shown: that&apos;s what you say to Siri.
        </p>
        {RECIPES.map((r) => {
          const url = `${site}/api/shortcuts/${r.path}?format=text`;
          return (
            <details className="more recipe" key={r.path}>
              <summary>
                &ldquo;Hey Siri, {r.phrase}&rdquo;{r.write ? " (needs a write token)" : ""}
              </summary>
              <ol className="paste-steps">
                <li>
                  Add <strong>Get Contents of URL</strong>. URL: <code>{url}</code>{" "}
                  <button type="button" className="btn btn-small" onClick={() => copy(url, setCopied)}>
                    Copy URL
                  </button>
                </li>
                <li>
                  Tap Show More. Method: <strong>{r.method}</strong>. Headers: add <code>Authorization</code> with the value <code>Bearer YOUR-TOKEN</code>.
                </li>
                {r.body ? (
                  <li>
                    Request Body: <strong>JSON</strong>, shaped like <code>{r.body}</code>.
                  </li>
                ) : null}
                <li>{r.finish}</li>
                <li>
                  Name the shortcut <strong>{r.phrase}</strong>.
                </li>
              </ol>
            </details>
          );
        })}
        <ReplyLine reply={copied} />
      </section>

      <section className="card" aria-label="Automations">
        <h2 className="card-title">3. Automations</h2>
        <details className="more recipe">
          <summary>Text yourself your cleaning hours every Wednesday</summary>
          <ol className="paste-steps">
            <li>Shortcuts → Automation → + → Time of Day → 7:00 am, Weekly, Wednesday → Run Immediately.</li>
            <li>
              Add <strong>Get Contents of URL</strong> with <code>{site}/api/shortcuts/cleaner-hours?format=text</code> and your token header (GET).
            </li>
            <li>
              Add <strong>Send Message</strong>: message = Contents of URL, recipient = yourself. Free, and exactly on time.
            </li>
          </ol>
        </details>
        <details className="more recipe">
          <summary>Back Tap or the Action button</summary>
          <p className="track-empty">Settings → Accessibility → Touch → Back Tap → Double Tap → choose your &ldquo;Today&rdquo; shortcut. On iPhone 15 Pro and later you can set the Action button to a shortcut too.</p>
        </details>
        <details className="more recipe">
          <summary>Reminders: dashboard to-dos into Apple Reminders</summary>
          <ol className="paste-steps">
            <li>
              Get Contents of URL <code>{site}/api/shortcuts/todos</code> (GET, token header) → Get Dictionary Value <code>todos</code>.
            </li>
            <li>Repeat with Each → Get Dictionary Value title → Add New Reminder with that title. Run it whenever you like (one-way).</li>
            <li>The other way round, use the &ldquo;Add to dashboard&rdquo; shortcut with Siri.</li>
          </ol>
        </details>
      </section>

      <section className="card" aria-label="Apple Calendar">
        <h2 className="card-title">4. Apple Calendar</h2>
        <p className="track-empty">
          A private calendar with your shifts, due dates and study blocks. Apple refreshes subscribed calendars on its own schedule (often every
          hour or so), not instantly.
        </p>
        <div className="note-actions">
          <button type="button" className="btn btn-dark" disabled={cal.pending} onClick={() => cal.run(makeFeed)}>
            {hasCalendar ? "Make a new calendar address" : "Make my calendar address"}
          </button>
          {hasCalendar ? (
            <button type="button" className="btn" disabled={cal.pending} onClick={() => window.confirm("Turn off the calendar feed?") && cal.run(stopCalendarFeed)}>
              Turn off
            </button>
          ) : null}
        </div>
        <ReplyLine reply={cal.reply} />
        {feed ? (
          <div className="steps">
            <a className="btn" href={feed.url}>
              Subscribe on this device
            </a>
            <code className="token-box">{feed.url}</code>
            <button type="button" className="btn btn-small" onClick={() => copy(feed.url, setCopied)}>
              Copy link
            </button>
            {feed.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={feed.qr} width={220} height={220} alt="QR code for the calendar subscription link" />
            ) : null}
            <span className="field-help">
              iPhone/iPad: scan the code with the Camera, or Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar. Mac:
              Calendar → File → New Calendar Subscription. Making a new address stops the old one.
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
