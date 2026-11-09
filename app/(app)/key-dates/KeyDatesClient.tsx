"use client";

import { useState } from "react";
import { SubjectSelect } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import { addKeyDate, deleteKeyDate, saveExamDates, togglePin } from "./actions";

export type KeyDateRow = { id: string; title: string; kind: string; course: string | null; pinned: boolean; notes: string | null; day: string; time: string; when: string; days: number };

const KIND_LABEL: Record<string, string> = { exam: "HSC exam", trial: "Trial", assessment: "Assessment", term: "Term", custom: "Countdown" };

export function KeyDatesClient({ rows, courses, exams, studentsOnline }: { rows: KeyDateRow[]; courses: string[]; exams: Record<string, { day: string; time: string }>; studentsOnline: string }) {
  const examForm = useAction();
  const addForm = useAction();
  const list = useAction();
  const [addKey, setAddKey] = useState(0);
  const upcoming = rows.filter((r) => r.days >= 0);
  const past = rows.filter((r) => r.days < 0);

  return (
    <>
      <section className="card" aria-label="Add my exam dates">
        <h2 className="card-title">Add my exam dates</h2>
        <p className="card-meta">
          Your own exam timetable shows in{" "}
          <a href={studentsOnline} target="_blank" rel="noreferrer">
            NESA Students Online
          </a>{" "}
          once it&apos;s released (30 April 2027). Fill in what you know; leave the rest blank.
        </p>
        <form
          className="exam-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            examForm.run(() => saveExamDates(f));
          }}
        >
          {courses.map((c, i) => (
            <fieldset className="exam-row" key={c}>
              <legend className="field-label">{c}</legend>
              <input className="input" type="date" name={`day-${i}`} aria-label={`${c} exam date`} defaultValue={exams[c]?.day ?? ""} />
              <input className="input" type="time" name={`time-${i}`} aria-label={`${c} exam start time`} defaultValue={exams[c]?.time ?? ""} />
            </fieldset>
          ))}
          <div className="note-actions">
            <button type="submit" className="btn btn-dark" disabled={examForm.pending}>
              Save exam dates
            </button>
          </div>
        </form>
        <ReplyLine reply={examForm.reply} />
      </section>

      <section className="card" aria-label="Add a countdown">
        <h2 className="card-title">Add a countdown</h2>
        <p className="card-meta">Trials, major works, assessments, the start or end of term. Term dates are yours to enter: the site doesn&apos;t guess them.</p>
        <form
          key={addKey}
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            addForm.run(() => addKeyDate(f), () => setAddKey((k) => k + 1));
          }}
        >
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" name="title" required maxLength={120} placeholder="e.g. Physics trial" />
          </label>
          <label className="field">
            <span className="field-label">Kind</span>
            <select className="input" name="kind" defaultValue="assessment">
              <option value="trial">Trial exam</option>
              <option value="assessment">Assessment</option>
              <option value="term">Term start or end</option>
              <option value="custom">Other countdown</option>
              <option value="exam">HSC exam</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input className="input" type="date" name="day" required />
          </label>
          <label className="field">
            <span className="field-label">Time (optional)</span>
            <input className="input" type="time" name="time" />
          </label>
          <label className="field">
            <span className="field-label">Course (optional)</span>
            <SubjectSelect name="course" />
          </label>
          <label className="paste-replace">
            <input type="checkbox" name="pinned" />
            <span>Show on Home</span>
          </label>
          <div className="note-actions form-wide">
            <button type="submit" className="btn btn-dark" disabled={addForm.pending}>
              Add
            </button>
          </div>
        </form>
        <ReplyLine reply={addForm.reply} />
      </section>

      <section className="card" aria-label="Your dates">
        <h2 className="card-title">Coming up</h2>
        {upcoming.length === 0 ? <p className="track-empty">Nothing yet.</p> : null}
        <div className="track-list">
          {upcoming.map((r) => (
            <DateRow key={r.id} r={r} run={list.run} pending={list.pending} />
          ))}
        </div>
        {past.length ? (
          <details>
            <summary className="card-meta" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
              Past dates ({past.length})
            </summary>
            <div className="track-list">
              {past.map((r) => (
                <DateRow key={r.id} r={r} run={list.run} pending={list.pending} />
              ))}
            </div>
          </details>
        ) : null}
        <ReplyLine reply={list.reply} />
      </section>
    </>
  );
}

function DateRow({ r, run, pending }: { r: KeyDateRow; run: ReturnType<typeof useAction>["run"]; pending: boolean }) {
  return (
    <div className="task">
      <div className="task-body">
        <span className="task-title">{r.title}</span>
        <span className="task-sub">
          {[KIND_LABEL[r.kind] ?? r.kind, r.when, r.days > 0 ? `in ${r.days} day${r.days === 1 ? "" : "s"}` : r.days === 0 ? "today" : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-small" disabled={pending} aria-pressed={r.pinned} onClick={() => run(() => togglePin(r.id, !r.pinned))}>
          {r.pinned ? "Unpin" : "Pin to Home"}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={pending}
          aria-label={`Delete ${r.title}`}
          onClick={() => {
            if (window.confirm(`Delete ${r.title}?`)) run(() => deleteKeyDate(r.id));
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
