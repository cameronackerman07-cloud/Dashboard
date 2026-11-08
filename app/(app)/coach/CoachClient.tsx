"use client";

import { useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import { percent, type CoachSettings, type Method } from "@/lib/coach";
import { daysBetween, formatDayKey } from "@/lib/time";
import { addAssessment, deleteAssessment, deleteGuide, guideToFlashcards, makeGuide, saveCoachSettings, setMark, type Guide } from "./actions";

export type AssessmentRow = { id: string; course: string; task: string; date: string | null; weighting: number | null; mark: number | null; max_mark: number | null; rank: string | null; notes: string | null };
export type GuideRow = { id: string; course: string; topic: string; guide: Guide & { links?: { label: string; href: string }[] }; created_at: string };
type Progress = { course: string; average: number | null; trend: "up" | "down" | "steady" | null; marked: number; upcoming: number };

export function CoachClient(props: {
  courses: string[];
  assessments: AssessmentRow[];
  progress: Progress[];
  guides: GuideRow[];
  settings: CoachSettings;
  methods: Method[];
  atarLinks: { label: string; href: string }[];
  today: string;
}) {
  const { pending, reply, run } = useAction();
  const [markId, setMarkId] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);
  const { settings, today } = props;
  const upcomingDates = settings.keyDates.filter((d) => d.date >= today);

  return (
    <>
      <ReplyLine reply={reply} />

      <section className="card" aria-label="Your target">
        <div className="card-head">
          <h2 className="card-title">Target ATAR {settings.targetAtar.toFixed(2)}</h2>
          <span className="card-meta">Honest numbers only</span>
        </div>
        <p className="lede">
          Your ATAR is worked out by UAC from your HSC marks, how each course is scaled that year, and which units count (your best 10, including 2 units of
          English). Scaling changes every year, so this page doesn&apos;t guess an ATAR. Instead it shows a target HSC mark for each course — set them below,
          and use UAC&apos;s pages to check what&apos;s realistic.
        </p>
        <ul className="link-list">
          {props.atarLinks.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <details>
          <summary className="btn btn-small">Edit target, course targets and key dates</summary>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() => saveCoachSettings(f));
            }}
          >
            <label className="field">
              <span className="field-label">Target ATAR</span>
              <input name="target_atar" className="input" inputMode="decimal" defaultValue={settings.targetAtar} required />
            </label>
            {props.courses.map((c) => (
              <label className="field" key={c}>
                <span className="field-label">Target HSC mark: {c}</span>
                <input name={`target:${c}`} className="input" inputMode="decimal" placeholder="e.g. 92" defaultValue={settings.targets[c] ?? ""} />
              </label>
            ))}
            <label className="field">
              <span className="field-label">Key dates</span>
              <span className="field-help">One per line, like 2027-08-02 Trials start</span>
              <textarea name="key_dates" className="input" rows={5} defaultValue={settings.keyDates.map((d) => `${d.date} ${d.label}`).join("\n")} />
            </label>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              Save
            </button>
          </form>
        </details>
      </section>

      <section className="card" aria-label="Progress per course">
        <div className="card-head">
          <h2 className="card-title">Progress</h2>
          <span className="card-meta">From the marks you add</span>
        </div>
        <div className="track-list">
          {props.courses.map((c) => {
            const p = props.progress.find((x) => x.course === c);
            const target = settings.targets[c];
            return (
              <div className="task" key={c}>
                <div className="task-body">
                  <span className="task-title">{c}</span>
                  <span className="task-sub">
                    {p?.average != null ? `Average ${p.average}%` : "No marks yet"}
                    {p?.trend ? ` · trend ${p.trend}` : ""}
                    {target ? ` · target ${target}` : ""}
                    {target && p?.average != null ? ` · ${p.average >= target ? "on track" : `${Math.round((target - p.average) * 10) / 10} to go`}` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-label="Roadmap">
        <div className="card-head">
          <h2 className="card-title">Roadmap</h2>
          <span className="card-meta">Your key dates</span>
        </div>
        {upcomingDates.length ? (
          <div className="track-list">
            {upcomingDates.map((d) => {
              const weeks = Math.floor(daysBetween(today, d.date) / 7);
              return (
                <div className="task" key={`${d.date}${d.label}`}>
                  <div className="task-body">
                    <span className="task-title">{d.label}</span>
                    <span className="task-sub">
                      {formatDayKey(d.date)} · {weeks > 0 ? `${weeks} week${weeks === 1 ? "" : "s"} away` : "this week"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="task-sub">Add your trial exam and HSC dates above (check NESA&apos;s HSC exam timetable) to see how many weeks you have.</p>
        )}
      </section>

      <section className="card" aria-label="Assessments">
        <div className="card-head">
          <h2 className="card-title">Assessments</h2>
          <span className="card-meta">{props.assessments.length} saved</span>
        </div>
        <form
          key={addKey}
          className="track-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => addAssessment(f), () => setAddKey((k) => k + 1));
          }}
        >
          <select name="course" className="input" aria-label="Course" required defaultValue="">
            <option value="" disabled>
              Course
            </option>
            {props.courses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input name="task" className="input" placeholder="Task, e.g. Trig in-class test" aria-label="Task name" required maxLength={120} />
          <input name="date" type="date" className="input" aria-label="Date" />
          <input name="weighting" className="input" inputMode="decimal" placeholder="Weighting %" aria-label="Weighting in percent" />
          <input name="mark" className="input" inputMode="decimal" placeholder="Mark (if back)" aria-label="Mark" />
          <input name="max_mark" className="input" inputMode="decimal" placeholder="Out of" aria-label="Maximum mark" />
          <input name="rank" className="input" placeholder="Rank, e.g. 3/40" aria-label="Class rank" maxLength={40} />
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Add
          </button>
        </form>
        <div className="track-list">
          {props.assessments.map((a) => {
            const pc = percent(a);
            return (
              <div className="task" key={a.id}>
                <div className="task-body">
                  <span className="task-title">
                    {a.task} · {a.course}
                  </span>
                  <span className="task-sub">
                    {a.date ? formatDayKey(a.date) : "No date"}
                    {a.weighting != null ? ` · ${a.weighting}%` : ""}
                    {pc != null ? ` · ${a.mark}/${a.max_mark} (${pc}%)` : " · not marked yet"}
                    {a.rank ? ` · rank ${a.rank}` : ""}
                  </span>
                  {markId === a.id ? (
                    <form
                      className="track-fields"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        run(() => setMark(a.id, f), () => setMarkId(null));
                      }}
                    >
                      <input name="mark" className="input" inputMode="decimal" placeholder="Mark" aria-label="Mark" defaultValue={a.mark ?? ""} required />
                      <input name="max_mark" className="input" inputMode="decimal" placeholder="Out of" aria-label="Maximum mark" defaultValue={a.max_mark ?? ""} required />
                      <input name="rank" className="input" placeholder="Rank" aria-label="Class rank" defaultValue={a.rank ?? ""} />
                      <button type="submit" className="btn btn-dark" disabled={pending}>
                        Save
                      </button>
                    </form>
                  ) : null}
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-small" onClick={() => setMarkId(markId === a.id ? null : a.id)}>
                    Mark
                  </button>
                  <button type="button" className="btn btn-small" disabled={pending} onClick={() => confirm(`Delete ${a.task}?`) && run(() => deleteAssessment(a.id))}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-label="Topic guides">
        <div className="card-head">
          <h2 className="card-title">Topic guides</h2>
          <span className="card-meta">Made by your AI · verify</span>
        </div>
        <form
          className="track-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => makeGuide(String(f.get("course") ?? ""), String(f.get("topic") ?? "")));
          }}
        >
          <select name="course" className="input" aria-label="Course" required defaultValue="">
            <option value="" disabled>
              Course
            </option>
            {props.courses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input name="topic" className="input" placeholder="Topic, e.g. Projectile motion" aria-label="Topic" required maxLength={120} />
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? "Working…" : "Make a guide"}
          </button>
        </form>
        {props.guides.map((g) => (
          <details key={g.id} className="coach-guide">
            <summary>
              {g.topic} · {g.course}
            </summary>
            <p className="task-sub">From the AI&apos;s general knowledge — check it against your syllabus and teacher.</p>
            <h3 className="field-label">What the syllabus expects</h3>
            <p>{g.guide.expects}</p>
            <h3 className="field-label">Best way to learn it</h3>
            <p>{g.guide.approach}</p>
            <h3 className="field-label">Practice sequence</h3>
            <ol>
              {g.guide.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {g.guide.mistakes.length ? (
              <>
                <h3 className="field-label">Common mistakes</h3>
                <ul>
                  {g.guide.mistakes.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {(g.guide.links ?? []).map((l) => (
              <p key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </p>
            ))}
            <div className="row-actions">
              <button type="button" className="btn btn-small" disabled={pending || !g.guide.cards?.length} onClick={() => run(() => guideToFlashcards(g.id))}>
                Add {g.guide.cards?.length ?? 0} flashcards
              </button>
              <button type="button" className="btn btn-small" disabled={pending} onClick={() => confirm("Delete this guide?") && run(() => deleteGuide(g.id))}>
                Delete
              </button>
            </div>
          </details>
        ))}
      </section>

      <section className="card" aria-label="Study methods">
        <div className="card-head">
          <h2 className="card-title">Study methods that work</h2>
          <span className="card-meta">With sources</span>
        </div>
        {props.methods.map((m) => (
          <details key={m.id} className="coach-guide">
            <summary>{m.technique}</summary>
            <p>{m.summary}</p>
            <ul>
              <li>Maths: {m.maths}</li>
              <li>Sciences: {m.sciences}</li>
              <li>English: {m.english}</li>
              <li>Practicals and projects: {m.practical}</li>
            </ul>
            {m.sources.map((s) => (
              <p key={s.href}>
                Source:{" "}
                <a href={s.href} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              </p>
            ))}
          </details>
        ))}
      </section>
    </>
  );
}
