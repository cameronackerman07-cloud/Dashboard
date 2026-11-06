"use client";

import { useState, useTransition, type ClipboardEvent } from "react";
import { readPastedTimetable, type PastedClass, type Week } from "@/lib/timetable-paste";
import { importClasses } from "./actions";

const DAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Draft = PastedClass & { key: number; keep: boolean };

// Copy your timetable from Atlantis or Sentral and paste it in. It's read in the
// browser; only the classes you tick are saved (subject, room, period).
export function TimetablePaste({ courses, existing }: { courses: string[]; existing: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [replace, setReplace] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function show(found: PastedClass[] | null) {
    if (!found) {
      setRows(null);
      setMessage({
        ok: false,
        text: "Couldn't find a timetable in that. Copy the whole table, including the row of day names. Or type it out: a day name on its own line, then one class per line (period, subject, room).",
      });
      return;
    }
    setMessage(null);
    setRows(found.map((r, i) => ({ ...r, key: i, keep: true })));
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    if (!html && !plain) return;
    e.preventDefault();
    setText(plain);
    show(readPastedTimetable(html, plain));
  }

  function update(key: number, patch: Partial<Draft>) {
    setRows((all) => all?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  function save() {
    const chosen = (rows ?? []).filter((r) => r.keep && r.subject.trim());
    if (chosen.length === 0) {
      setMessage({ ok: false, text: "Tick at least one class to save." });
      return;
    }
    startTransition(async () => {
      try {
        const res = await importClasses(
          chosen
            .sort((a, b) => a.day - b.day || a.order - b.order)
            .map((r) => ({ day: r.day, week: r.week, period: r.period, subject: r.subject, room: r.room })),
          replace && existing > 0,
        );
        setMessage({ ok: res.ok, text: res.message });
        if (res.ok) {
          setRows(null);
          setText("");
        }
      } catch {
        setMessage({ ok: false, text: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  const kept = rows?.filter((r) => r.keep).length ?? 0;
  const hasWeeks = rows?.some((r) => r.week !== "all");

  return (
    <section className="card" id="paste" aria-label="Paste your timetable">
      <div className="card-head">
        <h2 className="card-title">Paste from Atlantis or Sentral</h2>
        <button type="button" className="btn" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide" : "Paste a timetable"}
        </button>
      </div>
      {!open ? (
        <span className="card-meta">
          No calendar link? Copy your timetable straight from the Atlantis or Sentral website and paste it here.
        </span>
      ) : (
        <>
          <ol className="paste-steps">
            <li>Open your timetable in Atlantis or Sentral, on a computer if you can.</li>
            <li>
              Select the whole timetable, from the row of day names to the last class (drag across it, or press{" "}
              <strong>Ctrl+A</strong> / <strong>⌘A</strong>), and copy it.
            </li>
            <li>Click in the box and paste. Check the classes it finds, then save.</li>
          </ol>
          <textarea
            className="input own-question"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            aria-label="Pasted timetable"
            placeholder={"Paste here. Or type it out like this:\nMonday\nPeriod 1  Physics  B12\nPeriod 2  Mathematics Advanced  Room 4"}
          />
          <div className="note-actions">
            <button type="button" className="btn" onClick={() => show(readPastedTimetable("", text))} disabled={!text.trim()}>
              Read what&apos;s typed
            </button>
            <span className="card-meta">Teacher names are left out. Nothing is saved until you click Save.</span>
          </div>

          {rows ? (
            <div className="paste-preview">
              <span className="field-label">
                Found {rows.length} {rows.length === 1 ? "class" : "classes"}
                {hasWeeks ? " over a two-week (A/B) timetable" : ""}. Untick any that are wrong.
              </span>
              <div className="paste-rows">
                {rows.map((r) => (
                  <div className={`paste-row${r.keep ? "" : " is-off"}`} key={r.key}>
                    <input
                      type="checkbox"
                      checked={r.keep}
                      onChange={(e) => update(r.key, { keep: e.target.checked })}
                      aria-label={`Keep ${r.subject} on ${DAY_LABELS[r.day]}`}
                    />
                    <select className="input" value={r.day} onChange={(e) => update(r.key, { day: Number(e.target.value) })} aria-label="Day">
                      {DAY_LABELS.slice(1, 6).map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select className="input" value={r.week} onChange={(e) => update(r.key, { week: e.target.value as Week })} aria-label="Week">
                      <option value="all">Every week</option>
                      <option value="A">Week A</option>
                      <option value="B">Week B</option>
                    </select>
                    <input className="input" value={r.period ?? ""} onChange={(e) => update(r.key, { period: e.target.value || null })} placeholder="Period" aria-label="Period" maxLength={40} />
                    <input className="input" value={r.subject} onChange={(e) => update(r.key, { subject: e.target.value })} list="tt-paste-courses" aria-label="Subject" maxLength={80} />
                    <input className="input" value={r.room ?? ""} onChange={(e) => update(r.key, { room: e.target.value || null })} placeholder="Room" aria-label="Room" maxLength={40} />
                  </div>
                ))}
              </div>
              <datalist id="tt-paste-courses">
                {courses.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {existing > 0 ? (
                <label className="paste-replace">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  Replace the {existing} {existing === 1 ? "class" : "classes"} already saved
                </label>
              ) : null}
              <div className="note-actions">
                <button type="button" className="btn btn-dark" onClick={save} disabled={pending || kept === 0}>
                  {pending ? "Saving…" : `Save ${kept} ${kept === 1 ? "class" : "classes"}`}
                </button>
              </div>
            </div>
          ) : null}

          {message ? (
            <p className={message.ok ? "mark-cards" : "ai-error"} role={message.ok ? "status" : "alert"}>
              {message.text}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
