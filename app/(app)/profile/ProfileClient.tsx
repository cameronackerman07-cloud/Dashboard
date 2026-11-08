"use client";

import { useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import { FACT_CATEGORIES, type Questionnaire, type StyleStats } from "@/lib/about-me";
import { addFact, addSample, analyseNow, deleteFact, deleteSample, editFact, forgetEverything, saveQuestionnaire, saveSwitches, setFactStatus, setSampleAi } from "./actions";

export type FactRow = { id: string; category: string; text: string; source: "user" | "computed" | "ai"; origin: string | null; confidence: number; status: "suggested" | "confirmed" | "rejected"; created_at: string };
export type SampleRow = { id: string; title: string; include_in_ai: boolean; created_at: string; words?: number };
export type Switches = { use_behaviour: boolean; use_samples: boolean; include_notes: boolean; use_style: boolean; ai_pass: boolean };

const SOURCE: Record<FactRow["source"], string> = { user: "You wrote this", computed: "Worked out from your activity (no AI)", ai: "AI guess — may be wrong" };

const SWITCH_TEXT: { key: keyof Switches; label: string; help: string }[] = [
  { key: "use_behaviour", label: "Learn from my activity", help: "When you study, topics you miss, habit consistency, how early you finish tasks. Worked out in code, no AI." },
  { key: "use_samples", label: "Use my writing samples", help: "Only samples you paste below." },
  { key: "include_notes", label: "Also use my Notes and To-do titles", help: "Titles only, for writing-style stats." },
  { key: "use_style", label: "Work out my writing style", help: "Sentence length, vocabulary, punctuation, spelling, formality. In code, no AI." },
  { key: "ai_pass", label: "Let my AI suggest working notes", help: "Sends only samples marked “Can go to AI” to the AI provider you chose (your own key). Free tiers may use prompts for training." },
];

export function ProfileClient(props: {
  ready: boolean;
  facts: FactRow[];
  samples: SampleRow[];
  switches: Switches;
  questionnaire: Partial<Questionnaire>;
  questions: { key: keyof Questionnaire; label: string }[];
  stats: StyleStats | null;
}) {
  const { pending, reply, run } = useAction();
  const [editId, setEditId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  if (!props.ready) {
    return (
      <section className="card">
        <p className="task-sub">About me isn&apos;t set up yet. Run supabase/agents.sql in Supabase, then come back.</p>
      </section>
    );
  }
  const suggested = props.facts.filter((f) => f.status === "suggested");
  const confirmed = props.facts.filter((f) => f.status === "confirmed");
  const rejected = props.facts.filter((f) => f.status === "rejected");

  const factList = (list: FactRow[]) => (
    <div className="track-list">
      {list.map((f) => (
        <div className="task" key={f.id}>
          <div className="task-body">
            {editId === f.id ? (
              <form
                className="track-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() => editFact(f.id, fd), () => setEditId(null));
                }}
              >
                <input name="text" className="input" defaultValue={f.text} maxLength={300} aria-label="Fact" required />
                <button type="submit" className="btn btn-dark" disabled={pending}>
                  Save
                </button>
              </form>
            ) : (
              <span className="task-title">{f.text}</span>
            )}
            <span className="task-sub">
              {f.category} · {SOURCE[f.source]}
            </span>
          </div>
          <div className="row-actions">
            {f.status !== "confirmed" ? (
              <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setFactStatus(f.id, "confirmed"))}>
                Confirm
              </button>
            ) : null}
            <button type="button" className="btn btn-small" onClick={() => setEditId(editId === f.id ? null : f.id)}>
              Edit
            </button>
            {f.status !== "rejected" ? (
              <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setFactStatus(f.id, "rejected"))}>
                Reject
              </button>
            ) : null}
            <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => deleteFact(f.id))}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <ReplyLine reply={reply} />

      <section className="card" aria-label="Questionnaire">
        <div className="card-head">
          <h2 className="card-title">A few questions</h2>
          <span className="card-meta">Your answers are saved as confirmed facts</span>
        </div>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => saveQuestionnaire(fd));
          }}
        >
          {props.questions.map((q) => (
            <label className="field" key={q.key}>
              <span className="field-label">{q.label}</span>
              <input name={q.key} className="input" maxLength={200} defaultValue={props.questionnaire[q.key] ?? ""} />
            </label>
          ))}
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Save answers
          </button>
        </form>
      </section>

      <section className="card" aria-label="What I may use">
        <div className="card-head">
          <h2 className="card-title">What I may use</h2>
          <span className="card-meta">All off until you switch them on</span>
        </div>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => saveSwitches(fd));
          }}
        >
          {SWITCH_TEXT.map((s) => (
            <label className="paste-replace" key={s.key}>
              <input type="checkbox" name={s.key} defaultChecked={props.switches[s.key]} />
              <span>
                <strong>{s.label}</strong> — {s.help}
              </span>
            </label>
          ))}
          <div className="row-actions">
            <button type="submit" className="btn btn-dark" disabled={pending}>
              Save switches
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => analyseNow())}>
              Look for suggestions now
            </button>
          </div>
        </form>
        <p className="task-sub">Never gathered: anything from the web or other apps, other people&apos;s data, or sensitive topics like health, beliefs or family.</p>
      </section>

      {suggested.length ? (
        <section className="card" aria-label="To review">
          <div className="card-head">
            <h2 className="card-title">To review ({suggested.length})</h2>
            <span className="card-meta">Guesses — they may be wrong</span>
          </div>
          {factList(suggested)}
        </section>
      ) : null}

      <section className="card" aria-label="Confirmed facts">
        <div className="card-head">
          <h2 className="card-title">What agents know about you</h2>
          <span className="card-meta">Only these are used</span>
        </div>
        {confirmed.length ? factList(confirmed) : <p className="task-sub">Nothing yet. Answer the questions above or add a fact.</p>}
        <form
          key={formKey}
          className="track-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => addFact(fd), () => setFormKey((k) => k + 1));
          }}
        >
          <select name="category" className="input" aria-label="Category" defaultValue="preferences">
            {FACT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input name="text" className="input" placeholder="e.g. Prefers short answers" aria-label="Fact" maxLength={300} required />
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Add
          </button>
        </form>
      </section>

      <section className="card" aria-label="Writing samples">
        <div className="card-head">
          <h2 className="card-title">Writing samples</h2>
          <span className="card-meta">{props.samples.length} saved</span>
        </div>
        <form
          key={`s${formKey}`}
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => addSample(fd), () => setFormKey((k) => k + 1));
          }}
        >
          <input name="title" className="input" placeholder="Title, e.g. English essay draft" aria-label="Sample title" maxLength={120} required />
          <textarea name="text" className="input" rows={5} placeholder="Paste something you wrote. Leave out names and contact details." aria-label="Sample text" required />
          <label className="paste-replace">
            <input type="checkbox" name="include_in_ai" />
            <span>Can go to AI</span>
          </label>
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Save sample
          </button>
        </form>
        <div className="track-list">
          {props.samples.map((s) => (
            <div className="task" key={s.id}>
              <div className="task-body">
                <span className="task-title">{s.title}</span>
                <span className="task-sub">
                  {s.words ?? 0} words · {s.include_in_ai ? "Can go to AI" : "Stays out of AI"}
                </span>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setSampleAi(s.id, !s.include_in_ai))}>
                  {s.include_in_ai ? "Keep out of AI" : "Allow AI"}
                </button>
                <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => deleteSample(s.id))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        {props.stats ? (
          <p className="task-sub">
            Style: about {props.stats.avgSentence} words a sentence · vocabulary range {props.stats.vocabRange} · {props.stats.commasPer100} commas per 100 words · {props.stats.spelling} spelling ·{" "}
            {props.stats.formality}
            {props.stats.phrases.length ? ` · common phrases: ${props.stats.phrases.join(", ")}` : ""}
          </p>
        ) : null}
      </section>

      {rejected.length ? (
        <section className="card" aria-label="Rejected">
          <details>
            <summary className="btn btn-small">Rejected ({rejected.length})</summary>
            {factList(rejected)}
          </details>
        </section>
      ) : null}

      <section className="card" aria-label="Your data">
        <div className="card-head">
          <h2 className="card-title">Your data</h2>
        </div>
        <div className="row-actions">
          <a className="btn" href="/api/profile/export" download>
            Download my data
          </a>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => confirm("Delete every fact, sample and setting in About me? This can't be undone.") && run(() => forgetEverything())}
          >
            Forget everything
          </button>
        </div>
      </section>
    </>
  );
}
