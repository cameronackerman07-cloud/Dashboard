"use client";

import { useState } from "react";
import { logShiftPay } from "@/app/(app)/pay/actions";
import { ReplyLine, useAction } from "@/components/useAction";
import { centsToInput, formatCents } from "@/lib/money";
import { formatHours, JOB_KINDS, paidMinutes, shiftPayCents, type Job, type Shift } from "@/lib/shifts";
import { addDays, dayKey, formatDayKeyLong, formatTime, timeKey } from "@/lib/time";
import { addJob, deleteJob, deleteShift, saveShift, updateJob } from "./actions";

type Props = {
  jobs: Job[];
  shifts: Shift[];
  clashes: string[];
  monday: string;
  today: string;
  weekPayCents: number;
  payLogged: boolean;
};

export function ShiftsClient({ jobs, shifts, clashes, monday, today, weekPayCents, payLogged }: Props) {
  const { pending, reply, setReply, run } = useAction();
  const [editing, setEditing] = useState<Shift | null>(null);
  const [formKey, setFormKey] = useState(0);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const clashSet = new Set(clashes);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const defaultDay = days.includes(today) ? today : monday;

  function onSaveShift(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    run(
      () =>
        saveShift({
          id: editing?.id,
          jobId: get("job"),
          day: get("day"),
          start: get("start"),
          end: get("end"),
          breakMinutes: get("break"),
          rate: get("rate"),
          notes: get("notes"),
          repeatWeeks: get("repeat"),
        }),
      () => {
        setEditing(null);
        setFormKey((k) => k + 1);
      },
    );
  }

  return (
    <>
      {clashSet.size > 0 ? (
        <p className="ai-error" role="alert">
          Clash: {clashSet.size} shifts this week overlap each other. They&apos;re marked below.
        </p>
      ) : null}

      {weekPayCents > 0 && monday <= today ? (
        <div className="notice">
          <span>
            {payLogged
              ? `This week's estimated pay (${formatCents(weekPayCents)}) is already logged in Pay & budget.`
              : `Log this week's estimated pay (${formatCents(weekPayCents)}) as income in Pay & budget?`}
          </span>
          {payLogged ? null : (
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => logShiftPay(monday))}>
              Log as income
            </button>
          )}
        </div>
      ) : null}

      <section className="card" aria-label="Shifts this week">
        <h2 className="card-title">Shifts by day</h2>
        <div className="week-days">
          {days.map((day) => {
            const list = shifts.filter((s) => dayKey(new Date(s.starts_at).getTime()) === day);
            return (
              <div className={`week-day${day === today ? " is-today" : ""}`} key={day}>
                <div className="week-day-head">
                  <span>{formatDayKeyLong(day)}</span>
                  {day === today ? <span className="chip">TODAY</span> : null}
                </div>
                {list.length === 0 ? (
                  <span className="card-meta">No shifts</span>
                ) : (
                  list.map((s) => {
                    const job = jobById.get(s.job_id);
                    const start = new Date(s.starts_at).getTime();
                    const end = new Date(s.ends_at).getTime();
                    const crossesMidnight = dayKey(end) !== dayKey(start);
                    return (
                      <div className="shift-row" key={s.id}>
                        <div className="task-body">
                          <span className="task-title">
                            {formatTime(start)} – {formatTime(end)}
                            {crossesMidnight ? " (next day)" : ""} · {job?.name ?? "Job"}
                          </span>
                          <span className="task-sub">
                            {[
                              formatHours(paidMinutes(s)),
                              formatCents(shiftPayCents(s, job)),
                              s.unpaid_break_minutes ? `${s.unpaid_break_minutes} min unpaid break` : null,
                              s.notes,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        {clashSet.has(s.id) ? <span className="chip">CLASH</span> : null}
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setEditing(s);
                              setFormKey((k) => k + 1);
                              setReply(null);
                              document.getElementById("shift-form")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={pending}
                            onClick={() => {
                              if (window.confirm("Delete this shift?")) run(() => deleteShift(s.id));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-label={editing ? "Edit shift" : "Add a shift"} id="shift-form">
        <div className="card-head">
          <h2 className="card-title">{editing ? "Edit shift" : "Add a shift"}</h2>
          {editing ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setEditing(null);
                setFormKey((k) => k + 1);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
        {jobs.length === 0 ? (
          <p className="track-empty">Add a job below first, then add its shifts here.</p>
        ) : (
          <form className="form-grid" key={formKey} onSubmit={onSaveShift}>
            <label className="field">
              <span className="field-label">Job</span>
              <select name="job" className="input" defaultValue={editing?.job_id ?? jobs[0].id} required>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Date</span>
              <input
                name="day"
                type="date"
                className="input"
                required
                defaultValue={editing ? dayKey(new Date(editing.starts_at).getTime()) : defaultDay}
              />
            </label>
            <label className="field">
              <span className="field-label">Start</span>
              <input
                name="start"
                type="time"
                className="input"
                required
                defaultValue={editing ? timeKey(new Date(editing.starts_at).getTime()) : "16:00"}
              />
            </label>
            <label className="field">
              <span className="field-label">Finish</span>
              <input
                name="end"
                type="time"
                className="input"
                required
                defaultValue={editing ? timeKey(new Date(editing.ends_at).getTime()) : "20:00"}
              />
            </label>
            <label className="field">
              <span className="field-label">Unpaid break (min)</span>
              <input
                name="break"
                type="number"
                inputMode="numeric"
                min={0}
                max={600}
                className="input"
                defaultValue={editing?.unpaid_break_minutes ?? 0}
              />
            </label>
            <label className="field">
              <span className="field-label">Rate ($/h)</span>
              <input
                name="rate"
                inputMode="decimal"
                className="input"
                placeholder="Job's rate"
                defaultValue={centsToInput(editing?.rate_override_cents)}
              />
            </label>
            <label className="field form-wide">
              <span className="field-label">Notes</span>
              <input name="notes" className="input" maxLength={300} defaultValue={editing?.notes ?? ""} placeholder="Optional" />
            </label>
            {editing ? null : (
              <label className="field">
                <span className="field-label">Repeat</span>
                <select name="repeat" className="input" defaultValue="0">
                  <option value="0">Just this once</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option key={n} value={n}>
                      Weekly for {n + 1} weeks
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="note-actions form-wide">
              <button type="submit" className="btn btn-dark" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save shift" : "Add shift"}
              </button>
              <span className="field-help">A finish time earlier than the start means it ends the next day.</span>
            </div>
          </form>
        )}
        <ReplyLine reply={reply} />
      </section>

      <JobsCard jobs={jobs} />
    </>
  );
}

function JobsCard({ jobs }: { jobs: Job[] }) {
  const { pending, reply, run } = useAction();
  const [editId, setEditId] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);

  const fields = (job?: Job) => (
    <>
      <input name="name" className="input" placeholder="Job name, e.g. Cafe" aria-label="Job name" maxLength={60} required defaultValue={job?.name} />
      <input
        name="rate"
        className="input"
        inputMode="decimal"
        placeholder="Hourly rate, e.g. 18.50"
        aria-label="Hourly rate in dollars"
        required
        defaultValue={job ? centsToInput(job.default_rate_cents) : ""}
      />
      <select name="kind" className="input" aria-label="Kind of job" defaultValue={job?.kind ?? "work"}>
        {JOB_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <section className="card" aria-label="Jobs">
      <div className="card-head">
        <h2 className="card-title">Jobs</h2>
        <span className="card-meta">Pay rates before tax</span>
      </div>
      {jobs.length > 0 ? (
        <div className="track-list">
          {jobs.map((job) =>
            editId === job.id ? (
              <form
                key={job.id}
                className="track-fields job-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(() => updateJob(job.id, f), () => setEditId(null));
                }}
              >
                {fields(job)}
                <button type="submit" className="btn btn-dark" disabled={pending}>
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="task" key={job.id}>
                <div className="task-body">
                  <span className="task-title">{job.name}</span>
                  <span className="task-sub">
                    {formatCents(job.default_rate_cents)}/h · {JOB_KINDS.find((k) => k.value === job.kind)?.label}
                  </span>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-small" onClick={() => setEditId(job.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Delete ${job.name}? This also deletes all of its shifts.`)) run(() => deleteJob(job.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="track-empty">No jobs yet. Add your first one: a part-time job, refereeing, or gigs.</p>
      )}
      <form
        key={addKey}
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => addJob(f), () => setAddKey((k) => k + 1));
        }}
      >
        {fields()}
        <button type="submit" className="btn btn-dark" disabled={pending}>
          Add job
        </button>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}
