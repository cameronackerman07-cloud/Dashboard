"use client";

import { useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import { formatCents } from "@/lib/money";
import type { Situation } from "@/lib/money-ideas";
import { buildList, findMore, logIdea, saveSituation, setStatus } from "./actions";

export type IdeaRow = {
  id: string;
  type: string;
  title: string;
  summary: string;
  effort: number;
  startup_cost_cents: number;
  hours_per_week: number;
  est_weekly_low_cents: number;
  est_weekly_high_cents: number;
  assumptions: string;
  age_legal_notes: string;
  first_steps: string[];
  links: { label: string; href: string }[];
  score: number;
  status: string;
  verify: boolean;
};

const TRANSPORT: { value: Situation["transport"]; label: string }[] = [
  { value: "licence_car", label: "Licence and car" },
  { value: "learner", label: "Learner licence" },
  { value: "bike", label: "Bike" },
  { value: "public", label: "Public transport / lifts" },
  { value: "none", label: "None" },
];

export function MoneyIdeasClient(props: {
  ready: boolean;
  ideas: IdeaRow[];
  totals: Record<string, { hours: number; cents: number }>;
  situation: Situation;
  basics: string;
  basicsLinks: { label: string; href: string }[];
  today: string;
}) {
  const { pending, reply, run } = useAction();
  const [logId, setLogId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const s = props.situation;
  const visible = props.ideas.filter((i) => (showHidden ? i.status === "dismissed" : i.status !== "dismissed"));

  if (!props.ready) {
    return (
      <section className="card">
        <p className="task-sub">Money ideas aren&apos;t set up yet. Run supabase/agents.sql in Supabase, then come back.</p>
      </section>
    );
  }

  return (
    <>
      <ReplyLine reply={reply} />
      <section className="card" aria-label="Your situation">
        <div className="card-head">
          <h2 className="card-title">Your situation</h2>
          <span className="card-meta">
            {s.hoursPerWeek} h a week · goal {formatCents(s.weeklyGoalCents)}
          </span>
        </div>
        <details>
          <summary className="btn btn-small">Edit</summary>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() => saveSituation(f));
            }}
          >
            <label className="field">
              <span className="field-label">Age and year</span>
              <input name="age" className="input" defaultValue={s.ageBracket} maxLength={40} />
            </label>
            <label className="field">
              <span className="field-label">Town or suburb (no street address)</span>
              <input name="region" className="input" defaultValue={s.region} maxLength={60} />
            </label>
            <label className="field">
              <span className="field-label">Hours a week you could spare</span>
              <input name="hours" className="input" inputMode="decimal" defaultValue={s.hoursPerWeek} />
            </label>
            <label className="field">
              <span className="field-label">Skills and experience (comma separated)</span>
              <input name="skills" className="input" defaultValue={s.skills.join(", ")} placeholder="cleaning, refereeing, AV, maths" />
            </label>
            <label className="field">
              <span className="field-label">Transport</span>
              <select name="transport" className="input" defaultValue={s.transport}>
                {TRANSPORT.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Startup budget ($)</span>
              <input name="budget" className="input" inputMode="decimal" defaultValue={s.startupBudgetCents / 100} />
            </label>
            <label className="field">
              <span className="field-label">Weekly income goal ($)</span>
              <input name="goal" className="input" inputMode="decimal" defaultValue={s.weeklyGoalCents / 100} />
            </label>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              Save and re-rank
            </button>
          </form>
        </details>
        <p className="task-sub">
          {props.basics}{" "}
          {props.basicsLinks.map((l, i) => (
            <span key={l.href}>
              {i ? " · " : ""}
              <a href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </span>
          ))}
        </p>
      </section>

      <div className="row-actions">
        <button type="button" className="btn btn-dark" disabled={pending} onClick={() => run(() => buildList())}>
          {props.ideas.length ? "Re-rank my list" : "Build my list"}
        </button>
        <button type="button" className="btn" onClick={() => setShowHidden((v) => !v)}>
          {showHidden ? "Show my ideas" : "Not for me"}
        </button>
      </div>

      {visible.length === 0 ? (
        <section className="card">
          <p className="task-sub">{showHidden ? "Nothing hidden." : "No ideas yet. Tap “Build my list”."}</p>
        </section>
      ) : null}

      {visible.map((i) => {
        const t = props.totals[i.id];
        return (
          <section className="card" key={i.id} aria-label={i.title}>
            <div className="card-head">
              <h2 className="card-title">{i.title}</h2>
              <span className="card-meta">{i.status === "new" ? `Score ${Math.round(i.score)}` : i.status}</span>
            </div>
            {i.verify ? <p className="task-sub">Idea — verify before acting.</p> : null}
            <p>{i.summary}</p>
            <p className="task-sub">
              Effort {i.effort}/5 · start-up {i.startup_cost_cents ? formatCents(i.startup_cost_cents) : "free"} · about {i.hours_per_week} h a week
              {i.est_weekly_high_cents > 0 ? ` · roughly ${formatCents(i.est_weekly_low_cents)}–${formatCents(i.est_weekly_high_cents)} a week` : ""}
            </p>
            <p className="task-sub">{i.assumptions}</p>
            {i.age_legal_notes ? <p className="task-sub">Age and rules: {i.age_legal_notes}</p> : null}
            {i.first_steps?.length ? (
              <ol className="link-list">
                {i.first_steps.map((x, n) => (
                  <li key={n}>{x}</li>
                ))}
              </ol>
            ) : null}
            {i.links?.length ? (
              <ul className="link-list">
                {i.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {t ? (
              <p className="task-sub">
                Logged: {Math.round(t.hours * 10) / 10} h, {formatCents(t.cents)}
              </p>
            ) : null}
            <div className="row-actions">
              {i.status === "dismissed" ? (
                <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setStatus(i.id, "new"))}>
                  Bring back
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-small" aria-pressed={i.status === "interested"} disabled={pending} onClick={() => run(() => setStatus(i.id, "interested"))}>
                    Interested
                  </button>
                  <button type="button" className="btn btn-small" aria-pressed={i.status === "trying"} disabled={pending} onClick={() => run(() => setStatus(i.id, "trying"))}>
                    Trying
                  </button>
                  <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setStatus(i.id, "dismissed"))}>
                    Not for me
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setLogId(logId === i.id ? null : i.id)}>
                    Log hours and earnings
                  </button>
                  <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => findMore(i.id))}>
                    Find more like this
                  </button>
                </>
              )}
            </div>
            {logId === i.id ? (
              <form
                className="track-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(() => logIdea(i.id, f), () => setLogId(null));
                }}
              >
                <input name="date" type="date" className="input" aria-label="Date" defaultValue={props.today} />
                <input name="hours" className="input" inputMode="decimal" placeholder="Hours" aria-label="Hours" />
                <input name="earned" className="input" inputMode="decimal" placeholder="Earned ($)" aria-label="Earned in dollars" />
                <label className="paste-replace">
                  <input type="checkbox" name="income" defaultChecked />
                  <span>Also add it as income in Pay &amp; budget</span>
                </label>
                <button type="submit" className="btn btn-dark" disabled={pending}>
                  Log
                </button>
              </form>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
