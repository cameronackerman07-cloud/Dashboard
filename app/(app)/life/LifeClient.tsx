"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReplyLine, useAction } from "@/components/useAction";
import { CATEGORIES, type LifeCategory, type LifeItem, type LifePrefs } from "@/lib/life";
import type { Balance } from "@/lib/planner/balance";
import { VERDICT_TEXT, type Option } from "@/lib/life/evaluate";
import { formatTime, timeKey, dayKey } from "@/lib/time";
import { undoAssistantAction } from "../assistant/actions";
import { applyDecision, checkLife, deleteLifeItem, previewDecision, quickAddLife, resetLifePrefs, saveLifeItem, saveLifePrefs, setLifeStatus, type CheckReply, type DraftFields } from "./actions";

export type WeekRow = { key: string; kind: "life" | "shift" | "study" | "event"; id: string; title: string; start: number; end: number; category?: LifeCategory; status?: string };
type Day = { day: string; label: string; classes: string[]; rows: WeekRow[] };

const KIND_LABEL: Record<WeekRow["kind"], string> = { life: "Plan", shift: "Shift", study: "Study", event: "Calendar" };
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function LifeClient({ days, items, balance, prefs, hasPrefs, today, checkId }: { days: Day[]; items: LifeItem[]; balance: Balance; prefs: LifePrefs; hasPrefs: boolean; today: string; checkId: string | null }) {
  const quick = useAction();
  const rowAct = useAction();
  const [quickText, setQuickText] = useState("");
  const [editing, setEditing] = useState<LifeItem | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [check, setCheck] = useState<CheckReply | null>(null);
  const [checking, startCheck] = useTransition();

  function runCheck(input: Parameters<typeof checkLife>[0]) {
    setCheck(null);
    startCheck(async () => {
      try {
        setCheck(await checkLife(input));
      } catch {
        setCheck({ ok: false, message: "Couldn't reach the server. Try again." });
      }
      document.getElementById("advice")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    if (checkId) runCheck({ itemId: checkId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId]);

  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <>
      <section className="card" aria-label="Quick add">
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            quick.run(() => quickAddLife(quickText), () => setQuickText(""));
          }}
        >
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Quick add</span>
            <input className="input" value={quickText} onChange={(e) => setQuickText(e.target.value)} placeholder="Gym Tue and Thu 6pm for 1 hour" maxLength={200} />
          </label>
          <button type="submit" className="btn btn-dark" disabled={quick.pending || !quickText.trim()}>
            Add
          </button>
        </form>
        <ReplyLine reply={quick.reply} />
      </section>

      <ShouldIGo today={today} onCheck={runCheck} pending={checking} />

      <div id="advice">{checking ? <p className="card-meta" role="status">Checking your week…</p> : check ? <AdvicePanel reply={check} onClose={() => setCheck(null)} /> : null}</div>

      <div className="life-layout">
        <section className="card" aria-label="Your week">
          <h2 className="card-title">Your week</h2>
          <div className="life-days">
            {days.map((d) => (
              <div className={`life-day${d.day === today ? " is-today" : ""}`} key={d.day}>
                <div className="week-day-head">
                  <span>{d.label}</span>
                  {d.day === today ? <span className="chip">TODAY</span> : null}
                </div>
                {d.classes.length ? <span className="card-meta">Classes: {d.classes.join(", ")}</span> : null}
                {d.rows.length === 0 ? <span className="card-meta">Nothing planned</span> : null}
                {d.rows.map((r) => {
                  const item = r.kind === "life" ? byId.get(r.id) : undefined;
                  return (
                    <div className={`life-row life-${r.kind}`} key={r.key}>
                      <div className="task-body">
                        <span className="task-title" style={r.status === "skipped" ? { textDecoration: "line-through" } : undefined}>
                          {formatTime(r.start)}–{formatTime(r.end)} · {r.title}
                        </span>
                        <span className="task-sub">{[KIND_LABEL[r.kind], r.category ? CAT_LABEL[r.category] : null, item?.kind === "recurring" ? "Every week" : null, item?.flexibility === "fixed" ? "Fixed" : null].filter(Boolean).join(" · ")}</span>
                      </div>
                      {item ? (
                        <div className="row-actions">
                          <button type="button" className="btn btn-small" onClick={() => runCheck({ itemId: item.id })} aria-label={`Check whether to go to ${item.title}`}>
                            Check this
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setEditing(item);
                              setFormKey((k) => k + 1);
                              document.getElementById("life-form")?.scrollIntoView({ behavior: "smooth" });
                            }}
                            aria-label={`Edit ${item.title}`}
                          >
                            Edit
                          </button>
                          {item.kind === "one_off" ? (
                            <button type="button" className="btn btn-small" disabled={rowAct.pending} onClick={() => rowAct.run(() => setLifeStatus(item.id, item.status === "skipped" ? "planned" : "skipped"))} aria-label={`${item.status === "skipped" ? "Unskip" : "Skip"} ${item.title}`}>
                              {item.status === "skipped" ? "Unskip" : "Skip"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={rowAct.pending}
                            onClick={() => {
                              if (window.confirm(`Delete ${item.title}${item.kind === "recurring" ? " (every week)" : ""}?`)) rowAct.run(() => deleteLifeItem(item.id));
                            }}
                            aria-label={`Delete ${item.title}`}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <ReplyLine reply={rowAct.reply} />
        </section>

        <BalancePanel balance={balance} />
      </div>

      <LifeForm key={formKey} editing={editing} today={today} onDone={() => setEditing(null)} />
      <PrefsForm prefs={prefs} hasPrefs={hasPrefs} />
    </>
  );
}

function Bar({ label, value, target, unit, max }: { label: string; value: number; target: number; unit: string; max?: boolean }) {
  const top = Math.max(value, target, 0.01);
  return (
    <div className="hbar balance-bar">
      <span className="hbar-label">{label}</span>
      <span className="hbar-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (value / top) * 100)}%` }} />
      </span>
      <span className="hbar-value">
        {value}
        {unit} {max ? "of max" : "of"} {target}
        {unit}
      </span>
    </div>
  );
}

function BalancePanel({ balance }: { balance: Balance }) {
  const t = balance.totals;
  return (
    <section className="card" aria-label="Weekly balance">
      <h2 className="card-title">Weekly balance</h2>
      <div className="hbars">
        <Bar label="Sleep (avg a night)" value={t.sleepAvg} target={balance.targets.sleep} unit=" h" />
        <Bar label="Study" value={Math.round(t.studyMin / 6) / 10} target={Math.round(balance.targets.studyMax / 6) / 10} unit=" h" max />
        <Bar label="Exercise sessions" value={t.movement} target={balance.targets.movement} unit="" />
        <Bar label="Social and family" value={Math.round(t.socialMin / 6) / 10} target={Math.round(balance.targets.socialMin / 6) / 10} unit=" h" />
        <Bar label="Downtime (avg a day)" value={t.downtimeAvg} target={balance.targets.downtime} unit=" min" />
        <Bar label="Rest blocks" value={t.restBlocks} target={1} unit="" />
      </div>
      {balance.violations.length ? (
        <ul className="summary-points" aria-label="Needs fixing">
          {balance.violations.map((v, i) => (
            <li key={i}>
              <strong>Needs fixing:</strong> {v.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-meta">Sleep, study limits and rest all look fine this week.</p>
      )}
      {balance.warnings.map((w) => (
        <p className="card-meta" key={w}>
          {w}
        </p>
      ))}
    </section>
  );
}

function ShouldIGo({ today, onCheck, pending }: { today: string; onCheck: (i: Parameters<typeof checkLife>[0]) => void; pending: boolean }) {
  return (
    <section className="card" aria-label="Should I go?">
      <h2 className="card-title">Should I go?</h2>
      <p className="card-meta">Checks your real week (sleep, study, deadlines, shifts) and gives honest advice. You make the call.</p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onCheck({
            what: String(f.get("what") ?? ""),
            category: String(f.get("category")) as LifeCategory,
            day: String(f.get("day")),
            start: String(f.get("start")),
            minutes: Math.round(Number(f.get("hours")) * 60),
            travel: Number(f.get("travel")),
            want: Number(f.get("want")),
          });
        }}
      >
        <label className="field">
          <span className="field-label">What</span>
          <input className="input" name="what" maxLength={120} placeholder="e.g. Party at Sam's" />
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="input" name="category" defaultValue="social">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Day</span>
          <input className="input" type="date" name="day" required defaultValue={today} />
        </label>
        <label className="field">
          <span className="field-label">Starts</span>
          <input className="input" type="time" name="start" required defaultValue="19:00" />
        </label>
        <label className="field">
          <span className="field-label">How long (hours)</span>
          <input className="input" name="hours" inputMode="decimal" defaultValue="3" />
        </label>
        <label className="field">
          <span className="field-label">Travel each way (min)</span>
          <input className="input" name="travel" inputMode="numeric" defaultValue="20" />
        </label>
        <label className="field">
          <span className="field-label">How much you want to go (1–5)</span>
          <input className="input" type="number" name="want" min={1} max={5} defaultValue={4} />
        </label>
        <div className="note-actions form-wide">
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? "Checking…" : "Check"}
          </button>
          <span className="field-help">The name stays in your account: only numbers and the kind of plan go to the AI.</span>
        </div>
      </form>
    </section>
  );
}


function AdvicePanel({ reply, onClose }: { reply: CheckReply; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ choice: "go" | "alt" | "skip"; option: Option | null; lines: string[] } | null>(null);
  const [applied, setApplied] = useState<{ message: string; actionId: string | null } | null>(null);
  const [pending, start] = useTransition();
  const [undoMsg, setUndoMsg] = useState<string | null>(null);
  if (!reply.ok) {
    return (
      <section className="card">
        {reply.support ? <p className="support-note">{reply.support}</p> : null}
        <p className="ai-error" role="alert">
          {reply.message}
        </p>
      </section>
    );
  }
  const { advice, draft } = reply;
  const firstAlt = advice.alternatives[0]?.option ?? null;

  function ask(choice: "go" | "alt" | "skip", option: Option | null) {
    start(async () => {
      const p = await previewDecision(choice, draft as DraftFields, option);
      setPreview({ choice, option, lines: p.lines });
    });
  }

  return (
    <section className="card advice" aria-label="Advice" role="status">
      <div className="card-head">
        <h2 className="card-title">
          {draft.title} · {formatTime(draft.start)}
        </h2>
        <button type="button" className="btn btn-small" onClick={onClose} aria-label="Close advice">
          Close
        </button>
      </div>
      {reply.support ? <p className="support-note">{reply.support}</p> : null}
      <p className="advice-verdict">{VERDICT_TEXT[advice.verdict] ?? advice.verdict}</p>
      <ul className="summary-points">
        {advice.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {advice.alternatives.length ? (
        <div>
          <p className="field-label">Options that fit your calendar</p>
          <ul className="summary-points">
            {advice.alternatives.map((a) => (
              <li key={a.id}>
                {a.label}{" "}
                <button type="button" className="btn btn-small" disabled={pending} onClick={() => ask("alt", a.option)}>
                  Choose
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p>{reply.closing}</p>
      {applied ? (
        <div className="note-actions">
          <span className="mark-cards">{applied.message}</span>
          {applied.actionId ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                start(async () => {
                  const r = await undoAssistantAction(applied.actionId!);
                  setUndoMsg(r.message);
                  router.refresh();
                })
              }
            >
              Undo
            </button>
          ) : null}
          {undoMsg ? <span className="card-meta">{undoMsg}</span> : null}
        </div>
      ) : preview ? (
        <div className="estimate">
          <p className="field-label">This will:</p>
          <ul className="summary-points">
            {preview.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="note-actions">
            <button
              type="button"
              className="btn btn-dark"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await applyDecision(advice.decisionId, preview.choice, draft as DraftFields, preview.option);
                  setApplied({ message: r.message, actionId: "actionId" in r ? (r.actionId ?? null) : null });
                  router.refresh();
                })
              }
            >
              Apply
            </button>
            <button type="button" className="btn" onClick={() => setPreview(null)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="note-actions">
          <button type="button" className="btn btn-dark" disabled={pending} onClick={() => ask("go", null)}>
            Go and plan around it
          </button>
          {firstAlt ? (
            <button type="button" className="btn" disabled={pending} onClick={() => ask("alt", firstAlt)}>
              Take the alternative
            </button>
          ) : null}
          <button type="button" className="btn" disabled={pending} onClick={() => ask("skip", null)}>
            Skip it
          </button>
        </div>
      )}
      <p className="card-meta">{advice.byAI ? "Advice from your AI, using numbers only." : "Advice worked out on this site (no AI)."}</p>
    </section>
  );
}

function LifeForm({ editing, today, onDone }: { editing: LifeItem | null; today: string; onDone: () => void }) {
  const { pending, reply, run } = useAction();
  const [recurring, setRecurring] = useState(editing?.kind === "recurring");
  const r = editing?.recurrence;
  const s = editing?.starts_at ? new Date(editing.starts_at).getTime() : null;
  const e = editing?.ends_at ? new Date(editing.ends_at).getTime() : null;
  return (
    <section className="card" id="life-form" aria-label={editing ? "Edit a plan" : "Add a plan"}>
      <div className="card-head">
        <h2 className="card-title">{editing ? `Edit ${editing.title}` : "Add a plan"}</h2>
        {editing ? (
          <button type="button" className="btn btn-small" onClick={onDone}>
            Cancel
          </button>
        ) : null}
      </div>
      <form
        className="form-grid"
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          if (editing) f.set("id", editing.id);
          run(() => saveLifeItem(f), onDone);
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" name="title" required maxLength={120} defaultValue={editing?.title ?? ""} placeholder="e.g. Footy training" />
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="input" name="category" defaultValue={editing?.category ?? "fitness"}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="form-wide seg-wrap" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">When</legend>
          <label className="paste-replace">
            <input type="radio" name="kind" value="one_off" checked={!recurring} onChange={() => setRecurring(false)} />
            <span>Once</span>
          </label>
          <label className="paste-replace">
            <input type="radio" name="kind" value="recurring" checked={recurring} onChange={() => setRecurring(true)} />
            <span>Every week</span>
          </label>
        </fieldset>
        {recurring ? (
          <fieldset className="form-wide" style={{ border: 0, padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <legend className="field-label">Days</legend>
            {WEEKDAYS.map((d, i) => (
              <label className="paste-replace day-pick" key={d}>
                <input type="checkbox" name="days" value={i + 1} defaultChecked={r?.days.includes(i + 1)} />
                <span>{d}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="field">
            <span className="field-label">Date</span>
            <input className="input" type="date" name="day" defaultValue={s ? dayKey(s) : today} />
          </label>
        )}
        <label className="field">
          <span className="field-label">Starts</span>
          <input className="input" type="time" name="start" required defaultValue={r?.start ?? (s ? timeKey(s) : "18:00")} />
        </label>
        <label className="field">
          <span className="field-label">Finishes</span>
          <input className="input" type="time" name="end" required defaultValue={r?.end ?? (e ? timeKey(e) : "19:00")} />
        </label>
        {recurring ? (
          <label className="field">
            <span className="field-label">Until (optional)</span>
            <input className="input" type="date" name="until" defaultValue={r?.until ?? ""} />
          </label>
        ) : null}
        <label className="field">
          <span className="field-label">Travel there (min)</span>
          <input className="input" name="travel_before" inputMode="numeric" defaultValue={editing?.travel_before_min ?? 0} />
        </label>
        <label className="field">
          <span className="field-label">Travel home (min)</span>
          <input className="input" name="travel_after" inputMode="numeric" defaultValue={editing?.travel_after_min ?? 0} />
        </label>
        <label className="field">
          <span className="field-label">Importance (5 = must keep)</span>
          <input className="input" type="number" min={1} max={5} name="importance" defaultValue={editing?.importance ?? 3} />
        </label>
        <label className="field">
          <span className="field-label">Flexibility</span>
          <select className="input" name="flexibility" defaultValue={editing?.flexibility ?? "movable"}>
            <option value="fixed">Fixed (can&apos;t move)</option>
            <option value="movable">Movable</option>
            <option value="optional">Optional</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Energy</span>
          <select className="input" name="energy" defaultValue={editing?.energy ?? "medium"}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="field form-wide">
          <span className="field-label">Notes (stay private)</span>
          <input className="input" name="notes" maxLength={500} defaultValue={editing?.notes ?? ""} />
        </label>
        <div className="note-actions form-wide">
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {editing ? "Save" : "Add plan"}
          </button>
        </div>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}

function PrefsForm({ prefs, hasPrefs }: { prefs: LifePrefs; hasPrefs: boolean }) {
  const { pending, reply, run } = useAction();
  const [key, setKey] = useState(0);
  return (
    <section className="card" aria-label="Life preferences">
      <details open={!hasPrefs}>
        <summary className="card-title" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
          Preferences{hasPrefs ? "" : " (using the defaults)"}
        </summary>
        <p className="card-meta">The planner books these first, then fits study into what&apos;s left. The advisor uses them too.</p>
        <form
          key={key}
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => saveLifePrefs(f));
          }}
        >
          <Pref label="Sleep target (hours)" help="Teenagers do best on 8–10." name="sleep_hours" value={prefs.sleep_hours} />
          <label className="field">
            <span className="field-label">School-day wake-up</span>
            <input className="input" type="time" name="school_wake" defaultValue={prefs.school_wake} />
          </label>
          <Pref label="Weekend lie-in (min)" help="Extra sleep on Saturday and Sunday." name="weekend_lie_in_min" value={prefs.weekend_lie_in_min} />
          <Pref label="Wind-down before bed (min)" help="No study in this time." name="wind_down_min" value={prefs.wind_down_min} />
          <Pref label="Exercise sessions a week" help="Training, gym, sport, a long walk." name="exercise_per_week" value={prefs.exercise_per_week} />
          <Pref label="Social time a week (hours)" help="Friends and family." name="social_hours_per_week" value={prefs.social_hours_per_week} />
          <Pref label="Downtime a day (min)" help="Time that's just yours." name="downtime_min_per_day" value={prefs.downtime_min_per_day} />
          <Pref label="Most extra study, school day (min)" help="Outside lessons." name="max_study_school_day_min" value={prefs.max_study_school_day_min} />
          <Pref label="Most study, weekend day (min)" help="A bit more is allowed before big assessments." name="max_study_weekend_min" value={prefs.max_study_weekend_min} />
          <Pref label="Rest blocks a week" help="At least one, always protected." name="rest_blocks_per_week" value={prefs.rest_blocks_per_week} />
          <label className="field">
            <span className="field-label">Breakfast</span>
            <input className="input" type="time" name="breakfast" defaultValue={prefs.meal_times.breakfast} />
          </label>
          <label className="field">
            <span className="field-label">Lunch</span>
            <input className="input" type="time" name="lunch" defaultValue={prefs.meal_times.lunch} />
          </label>
          <label className="field">
            <span className="field-label">Dinner</span>
            <input className="input" type="time" name="dinner" defaultValue={prefs.meal_times.dinner} />
          </label>
          <div className="note-actions form-wide">
            <button type="submit" className="btn btn-dark" disabled={pending}>
              Save preferences
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Reset your preferences to the defaults?")) run(() => resetLifePrefs(), () => setKey((k) => k + 1));
              }}
            >
              Reset to defaults
            </button>
          </div>
        </form>
        <ReplyLine reply={reply} />
      </details>
    </section>
  );
}

function Pref({ label, help, name, value }: { label: string; help: string; name: string; value: number }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" name={name} inputMode="decimal" defaultValue={value} />
      <span className="field-help">{help}</span>
    </label>
  );
}
