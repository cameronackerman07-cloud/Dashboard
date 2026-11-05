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

// Connects a Sentral calendar link (or any .ics link), or imports a calendar file.
export function CalendarConnect({
  connected,
  label,
  syncedLabel,
  importedCount,
}: {
  connected: boolean;
  label: string | null;
  syncedLabel: string | null;
  importedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState<CalendarReply | null>(null);
  const linkForm = useRef<HTMLFormElement>(null);
  const fileForm = useRef<HTMLFormElement>(null);

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
    <section className="connect-card" aria-label="Sentral calendar">
      <div className="connect-head">
        <span className="connect-logo">
          <Icon name="calendar" size={22} />
        </span>
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Sentral timetable &amp; calendar</h2>
          <span className="list-desc">
            Shows on your Timetable, Calendar and Home. Any calendar link works too (Compass, Google, Outlook).
          </span>
        </div>
        <span className={connected ? "chip" : "chip-outline"}>{connected ? "CONNECTED" : "Not connected"}</span>
      </div>

      {connected ? (
        <div className="field">
          <span className="field-label">{label ?? "Calendar link"}</span>
          <span className="field-help">
            Saved encrypted on your account and refreshed every 15 minutes.
            {syncedLabel ? ` Connected ${syncedLabel}.` : ""}{" "}
            <Link href="/calendar">Open Calendar</Link>
          </span>
          <div className="note-actions">
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => run(disconnectCalendar)}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : null}

      <div className="steps">
        <span className="field-label">{connected ? "Change the link" : "1. Find your calendar link in Sentral"}</span>
        <ol>
          <li>
            Sign in to your school&apos;s <strong>Sentral portal</strong> and open your <strong>Timetable</strong> or{" "}
            <strong>Calendar</strong>.
          </li>
          <li>
            Look for <strong>Subscribe</strong>, <strong>Sync</strong>, <strong>iCal</strong> or <strong>Export</strong>,
            and copy the link it gives you (it often starts with <code>webcal://</code>).
          </li>
          <li>
            Only a link? Paste it below. Only a <strong>.ics file</strong> download? Use the file option underneath.
          </li>
        </ol>
        <span className="field-help">
          Not every school switches this on. If you can&apos;t find either, ask the school office whether Sentral can
          give students a timetable calendar link, or add your classes by hand on the Timetable page.
        </span>
      </div>

      <form
        ref={linkForm}
        className="field"
        action={(fd) => run(() => connectCalendar(fd), () => linkForm.current?.reset())}
      >
        <label htmlFor="cal-link" className="field-label">
          {connected ? "New calendar link" : "2. Paste the calendar link"}
        </label>
        <input
          id="cal-link"
          name="link"
          className="input"
          type="text"
          inputMode="url"
          placeholder="webcal://yourschool.sentral.com.au/…"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <input name="label" type="hidden" value="Sentral" />
        <span className="field-help">
          Treat it like a password: anyone with the link can see your calendar. It&apos;s stored encrypted and
          never shown again.
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
        action={(fd) => run(() => importCalendarFile(fd), () => fileForm.current?.reset())}
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
