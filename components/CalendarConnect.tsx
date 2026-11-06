"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  clearImportedCalendar,
  connectCalendar,
  disconnectCalendar,
  importCalendarFile,
  type CalendarReply,
} from "@/app/(app)/settings/actions";
import { Icon } from "@/components/Icon";
import { CALENDAR_SOURCE_IDS, CALENDAR_SOURCES, type CalendarSource } from "@/lib/calendar-sources";

export type ConnectedCalendar = { source: CalendarSource; name: string; syncedLabel: string | null };

const PLACEHOLDER: Record<CalendarSource, string> = {
  sentral: "webcal://yourschool.sentral.com.au/…",
  atlantis: "https://… (Atlantis calendar link)",
  ical: "https://… or webcal://… (.ics link)",
};

// Where to find the link, for each source. Neither Sentral nor Atlantis lets an
// app sign in with your password, so a link (or a copy-paste) is the way in.
function Steps({ source }: { source: CalendarSource }) {
  if (source === "sentral") {
    return (
      <ol>
        <li>
          Sign in to your school&apos;s <strong>Sentral portal</strong> and open your <strong>Timetable</strong> or{" "}
          <strong>Calendar</strong>.
        </li>
        <li>
          Look for <strong>Subscribe</strong>, <strong>Sync</strong>, <strong>iCal</strong> or <strong>Export</strong>, and
          copy the link (it often starts with <code>webcal://</code>).
        </li>
        <li>Paste it below. Only got a .ics file? Use the file option underneath.</li>
      </ol>
    );
  }
  if (source === "atlantis") {
    return (
      <ol>
        <li>
          Sign in to <strong>Atlantis</strong> (<code>a1.atlantis.education</code>) and open your <strong>timetable</strong>.
        </li>
        <li>
          Look for <strong>Subscribe</strong>, <strong>Calendar</strong>, <strong>Export</strong> or <strong>iCal</strong>{" "}
          and copy the link.
        </li>
        <li>
          No link? Use <Link href="/timetable#paste">Paste from Atlantis</Link> on the Timetable page instead: copy your
          timetable table and paste it in.
        </li>
      </ol>
    );
  }
  return (
    <ol>
      <li>Any calendar that gives you an iCal or .ics link works: Compass, Google Calendar, Outlook, Edval.</li>
      <li>Copy its private or secret iCal address and paste it below.</li>
    </ol>
  );
}

export function CalendarConnect({
  connected,
  importedCount,
}: {
  connected: ConnectedCalendar[];
  importedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState<CalendarReply | null>(null);
  const [source, setSource] = useState<CalendarSource>("sentral");
  const linkForm = useRef<HTMLFormElement>(null);
  const fileForm = useRef<HTMLFormElement>(null);

  const current = connected.find((c) => c.source === source);

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

  return (
    <section className="connect-card" aria-label="School timetable and calendar">
      <div className="connect-head">
        <span className="connect-logo">
          <Icon name="calendar" size={22} />
        </span>
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Timetable &amp; calendar: Sentral or Atlantis</h2>
          <span className="list-desc">
            Shows on your Timetable, Calendar and Home. You can connect both, plus one other calendar link.
          </span>
        </div>
        <span className={connected.length ? "chip" : "chip-outline"}>
          {connected.length ? `${connected.length} CONNECTED` : "Not connected"}
        </span>
      </div>

      {connected.length > 0 ? (
        <div className="list-card">
          {connected.map((c) => (
            <div className="list-row" key={c.source}>
              <div className="list-text">
                <span className="list-name">{c.name}</span>
                <span className="list-desc">
                  Refreshed every 15 minutes.{c.syncedLabel ? ` Connected ${c.syncedLabel}.` : ""}
                </span>
              </div>
              <button
                type="button"
                className="btn"
                style={{ minHeight: 40, fontSize: 13 }}
                disabled={pending}
                onClick={() => run(() => disconnectCalendar(c.source))}
              >
                Disconnect
              </button>
            </div>
          ))}
          <div className="list-row">
            <span className="list-desc">
              <Link href="/calendar">Open Calendar</Link>
            </span>
          </div>
        </div>
      ) : null}

      <div className="field">
        <span className="field-label">{connected.length ? "Add or change a link" : "1. Where is your timetable?"}</span>
        <div className="seg seg-wrap" role="group" aria-label="Calendar source">
          {CALENDAR_SOURCE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`seg-btn${source === id ? " is-active" : ""}`}
              aria-pressed={source === id}
              onClick={() => {
                setSource(id);
                setReply(null);
              }}
            >
              {id === "ical" ? "Other link" : CALENDAR_SOURCES[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="steps">
        <span className="field-label">Find your {source === "ical" ? "calendar" : CALENDAR_SOURCES[source]} link</span>
        <Steps source={source} />
        {source !== "ical" ? (
          <span className="field-help">
            The dashboard can&apos;t sign in with your school email and password: neither Sentral nor Atlantis lets other
            apps do that, and your school password shouldn&apos;t be stored anywhere else. If you can&apos;t find a link,
            ask the school office, or add your classes on the Timetable page.
          </span>
        ) : null}
      </div>

      <form
        ref={linkForm}
        className="field"
        // onSubmit, not action, so a failed check doesn't clear the link you typed.
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => connectCalendar(fd), () => linkForm.current?.reset());
        }}
      >
        <label htmlFor="cal-link" className="field-label">
          {current ? `New ${current.name} link (replaces the old one)` : `Paste the ${source === "ical" ? "calendar" : CALENDAR_SOURCES[source]} link`}
        </label>
        <input
          id="cal-link"
          name="link"
          className="input"
          type="text"
          inputMode="url"
          placeholder={PLACEHOLDER[source]}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <input name="source" type="hidden" value={source} />
        <span className="field-help">
          Treat it like a password: anyone with the link can see your calendar. It&apos;s stored encrypted and never
          shown again.
        </span>
        <div className="note-actions">
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? "Checking…" : "Test & connect"}
          </button>
        </div>
      </form>

      <form
        ref={fileForm}
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => importCalendarFile(fd), () => fileForm.current?.reset());
        }}
      >
        <label htmlFor="cal-file" className="field-label">
          Or import a calendar file (.ics)
        </label>
        <input id="cal-file" name="file" className="input file-input" type="file" accept=".ics,text/calendar" required />
        <span className="field-help">
          A file is a one-off copy: it won&apos;t pick up later changes, so import it again when your timetable
          changes.{importedCount > 0 ? ` ${importedCount} imported events saved now.` : ""}
        </span>
        <div className="note-actions">
          <button type="submit" className="btn" disabled={pending}>
            Import file
          </button>
          {importedCount > 0 ? (
            <button type="button" className="btn" disabled={pending} onClick={() => run(clearImportedCalendar)}>
              Remove imported events
            </button>
          ) : null}
        </div>
      </form>

      {reply ? (
        <p className={reply.ok ? "mark-cards" : "ai-error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </p>
      ) : null}
    </section>
  );
}
