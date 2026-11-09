"use client";

import { useState } from "react";
import { SubjectSelect } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import { hoursText, SESSION_KINDS, type StudySession } from "@/lib/study-time";
import { addDays, dayKey, formatDayKey, formatTime } from "@/lib/time";
import { addManualSession, deleteSession, editSession, saveStudySettings } from "./actions";

export function ManualEntry({ today }: { today: string }) {
  const { pending, reply, run } = useAction();
  const [key, setKey] = useState(0);
  return (
    <section className="card" aria-label="Add time you forgot to time">
      <h2 className="card-title">Forgot to start the timer?</h2>
      <p className="card-meta">Add it here. Up to 6 hours per entry, from the last 30 days. It&apos;s marked as manual in your history.</p>
      <form
        key={key}
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(
            () =>
              addManualSession({
                day: String(f.get("day")),
                time: String(f.get("time") || ""),
                minutes: Number(f.get("minutes")),
                subject: String(f.get("subject")),
                topic: String(f.get("topic") || ""),
                kind: String(f.get("kind")),
              }),
            () => setKey((k) => k + 1),
          );
        }}
      >
        <label className="field">
          <span className="field-label">Date</span>
          <input className="input" type="date" name="day" required defaultValue={today} min={addDays(today, -30)} max={today} />
        </label>
        <label className="field">
          <span className="field-label">Started at (optional)</span>
          <input className="input" type="time" name="time" />
        </label>
        <label className="field">
          <span className="field-label">Minutes</span>
          <input className="input" name="minutes" inputMode="numeric" required placeholder="e.g. 45" />
        </label>
        <label className="field">
          <span className="field-label">Subject</span>
          <SubjectSelect emptyLabel={null} defaultValue="Physics" />
        </label>
        <label className="field">
          <span className="field-label">Topic</span>
          <input className="input" name="topic" maxLength={120} placeholder="Optional" />
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="input" name="kind" defaultValue="focus">
            {SESSION_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="note-actions form-wide">
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Add time
          </button>
        </div>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}

export function HistoryList({ sessions }: { sessions: StudySession[] }) {
  const { pending, reply, run } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="card" aria-label="Session history">
      <h2 className="card-title">History</h2>
      {sessions.length === 0 ? <p className="track-empty">Your finished sessions will show here.</p> : null}
      <div className="track-list">
        {sessions.map((s) => {
          const start = new Date(s.started_at).getTime();
          return editing === s.id ? (
            <form
              key={s.id}
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(
                  () =>
                    editSession(s.id, {
                      subject: String(f.get("subject")),
                      topic: String(f.get("topic") || ""),
                      minutes: Number(f.get("minutes")),
                      notes: String(f.get("notes") || ""),
                      external: f.get("external") === "on",
                    }),
                  () => setEditing(null),
                );
              }}
            >
              <label className="field">
                <span className="field-label">Subject</span>
                <SubjectSelect emptyLabel={null} defaultValue={s.subject} />
              </label>
              <label className="field">
                <span className="field-label">Topic</span>
                <input className="input" name="topic" defaultValue={s.topic ?? ""} maxLength={120} />
              </label>
              <label className="field">
                <span className="field-label">Minutes counted</span>
                <input className="input" name="minutes" inputMode="numeric" defaultValue={Math.round((s.counted_seconds ?? 0) / 60)} />
              </label>
              <label className="field">
                <span className="field-label">Notes</span>
                <input className="input" name="notes" defaultValue={s.notes ?? ""} maxLength={300} />
              </label>
              <label className="paste-replace form-wide">
                <input type="checkbox" name="external" defaultChecked={s.counts_as_external} />
                <span>Counts as external study (outside timetabled lessons)</span>
              </label>
              <div className="note-actions form-wide">
                <button type="submit" className="btn btn-dark" disabled={pending}>
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="task" key={s.id}>
              <div className="task-body">
                <span className="task-title">
                  {hoursText(s.counted_seconds ?? 0)} · {s.subject}
                  {s.topic ? ` · ${s.topic}` : ""}
                </span>
                <span className="task-sub">
                  {[
                    `${formatDayKey(dayKey(start))} ${formatTime(start)}`,
                    s.source === "manual" ? "Manual" : s.source === "siri" ? "Siri" : s.source === "voice" ? "Voice" : s.source === "planner" ? "From planner" : null,
                    s.status === "auto_closed" ? "Closed for you at the planned end" : null,
                    s.counts_as_external ? null : "Not counted",
                    s.notes,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {s.source === "manual" ? <span className="chip chip-outline">MANUAL</span> : null}
              <div className="row-actions">
                <button type="button" className="btn btn-small" onClick={() => setEditing(s.id)} aria-label={`Edit the ${s.subject} session`}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={pending}
                  aria-label={`Delete the ${s.subject} session`}
                  onClick={() => {
                    if (window.confirm("Delete this session?")) run(() => deleteSession(s.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <ReplyLine reply={reply} />
    </section>
  );
}

type SettingsRow = Record<string, unknown> | null;

export function SettingsForm({ row }: { row: SettingsRow }) {
  const { pending, reply, run } = useAction();
  const v = (k: string, d: unknown = "") => String(row?.[k] ?? d ?? "");
  return (
    <section className="card" aria-label="Timer settings">
      <details>
        <summary className="card-title" style={{ cursor: "pointer" }}>
          Timer settings
        </summary>
        <form
          className="form-grid"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => saveStudySettings(f));
          }}
        >
          <label className="field">
            <span className="field-label">HSC goal (total hours)</span>
            <input className="input" name="target_total_hours" inputMode="numeric" defaultValue={v("target_total_hours")} placeholder="Optional, e.g. 600" />
          </label>
          <label className="field">
            <span className="field-label">Weekly goal (hours)</span>
            <input className="input" name="weekly_target_hours" inputMode="numeric" defaultValue={v("weekly_target_hours")} placeholder="Optional" />
          </label>
          <label className="field">
            <span className="field-label">Default length (min)</span>
            <input className="input" name="default_minutes" inputMode="numeric" defaultValue={v("default_minutes", 25)} />
          </label>
          <label className="field">
            <span className="field-label">Suggest a break after (min)</span>
            <input className="input" name="break_reminder_minutes" inputMode="numeric" defaultValue={v("break_reminder_minutes", 90)} />
          </label>
          <label className="field">
            <span className="field-label">Pomodoro focus (min)</span>
            <input className="input" name="pomodoro_focus" inputMode="numeric" defaultValue={v("pomodoro_focus", 25)} />
          </label>
          <label className="field">
            <span className="field-label">Short break (min)</span>
            <input className="input" name="pomodoro_short" inputMode="numeric" defaultValue={v("pomodoro_short", 5)} />
          </label>
          <label className="field">
            <span className="field-label">Long break (min)</span>
            <input className="input" name="pomodoro_long" inputMode="numeric" defaultValue={v("pomodoro_long", 15)} />
          </label>
          <div className="form-wide" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <label className="paste-replace">
              <input type="checkbox" name="pomodoro" defaultChecked={!!row?.pomodoro} />
              <span>Start in Pomodoro mode</span>
            </label>
            <label className="paste-replace">
              <input type="checkbox" name="sound" defaultChecked={row?.sound !== false} />
              <span>Chime when time&apos;s up</span>
            </label>
            <label className="paste-replace">
              <input type="checkbox" name="vibration" defaultChecked={row?.vibration !== false} />
              <span>Vibrate (Android only)</span>
            </label>
          </div>
          <div className="note-actions form-wide">
            <button type="submit" className="btn btn-dark" disabled={pending}>
              Save settings
            </button>
          </div>
        </form>
        <ReplyLine reply={reply} />
      </details>
    </section>
  );
}
