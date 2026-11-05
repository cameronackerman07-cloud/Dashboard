"use client";

import { useRef, useState, useTransition } from "react";
import { saveSummaryToNotes, summarise } from "./actions";

export function SummariesClient({ courses }: { courses: string[] }) {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("");
  const [course, setCourse] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  function run() {
    const text = textRef.current?.value ?? "";
    if (text.trim().length < 20 || pending) {
      setStatus("Paste a bit more text first.");
      return;
    }
    setStatus("");
    setSummary("");
    startTransition(async () => {
      const res = await summarise(text, course);
      if (res.ok) setSummary(res.text);
      else setStatus(res.text);
    });
  }

  function save() {
    if (!summary || pending) return;
    startTransition(async () => {
      const title = `Summary${course ? ` · ${course}` : ""}`;
      const id = await saveSummaryToNotes(title, summary, course || null);
      setStatus(id ? "Saved to Notes." : "Couldn't save to Notes.");
    });
  }

  function copy() {
    if (!summary) return;
    navigator.clipboard?.writeText(summary).then(
      () => setStatus("Copied."),
      () => setStatus("Couldn't copy."),
    );
  }

  return (
    <>
      <section className="card" aria-label="Paste notes">
        <h2 className="card-title">Paste your notes</h2>
        <div className="track-fields">
          <select
            className="input"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            aria-label="Subject"
          >
            <option value="">No subject</option>
            {courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <textarea
          ref={textRef}
          className="input note-body"
          placeholder="Paste notes, a worksheet, or a textbook passage…"
          aria-label="Text to summarise"
          rows={10}
        />
        <div className="note-actions">
          <button type="button" className="btn btn-dark" onClick={run} disabled={pending}>
            {pending ? "Working…" : "Summarise"}
          </button>
          {status ? <span className="card-meta">{status}</span> : null}
        </div>
      </section>

      {summary ? (
        <section className="card" aria-label="Summary">
          <div className="card-head">
            <h2 className="card-title">Summary</h2>
          </div>
          <p className="bubble-text">{summary}</p>
          <div className="note-actions">
            <button type="button" className="btn" onClick={copy}>
              Copy
            </button>
            <button type="button" className="btn" onClick={save} disabled={pending}>
              Save to Notes
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
