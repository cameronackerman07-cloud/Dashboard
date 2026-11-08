"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SubjectOptions } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import type { PlanDraft } from "@/lib/planner/generate";
import { addDays, dayKey, formatDayKey, formatTime, timeKey } from "@/lib/time";
import { addDatedBlock, applyWeekPlan, deleteDatedBlock, previewWeekPlan, setBlockDone, undoPlan, updateDatedBlock } from "./actions";

export type DatedBlock = {
  id: string;
  starts_at: string;
  ends_at: string;
  subject: string | null;
  topic: string | null;
  kind: "study" | "flashcards" | "practice" | "rest";
  source: "ai" | "manual";
  done: boolean;
  notes: string | null;
};

const KIND_LABEL: Record<DatedBlock["kind"], string> = { study: "Study", flashcards: "Flashcards", practice: "Practice", rest: "Rest" };
const ms = (iso: string) => new Date(iso).getTime();
const minutesOf = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60_000);

function BlockForm({ weekStart, block, onDone, submitLabel }: { weekStart: string; block?: DatedBlock; onDone: () => void; submitLabel: string }) {
  const { pending, reply, run } = useAction();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <form
      className="track-form"
      action={(form) => run(() => (block ? updateDatedBlock(block.id, form) : addDatedBlock(form)), onDone)}
    >
      <div className="track-fields">
        <select name="day" className="input" aria-label="Day" defaultValue={block ? dayKey(ms(block.starts_at)) : days[0]}>
          {days.map((d) => (
            <option key={d} value={d}>
              {formatDayKey(d)}
            </option>
          ))}
        </select>
        <input name="time" type="time" className="input" aria-label="Start time" defaultValue={block ? timeKey(ms(block.starts_at)) : "16:00"} required />
        <select name="minutes" className="input" aria-label="Length" defaultValue={String(block ? minutesOf(block.starts_at, block.ends_at) : 45)}>
          {[15, 20, 25, 30, 45, 60, 75, 90, 120, 180, 240].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? "" : "s"}`}
            </option>
          ))}
          {block && ![15, 20, 25, 30, 45, 60, 75, 90, 120, 180, 240].includes(minutesOf(block.starts_at, block.ends_at)) ? (
            <option value={minutesOf(block.starts_at, block.ends_at)}>{minutesOf(block.starts_at, block.ends_at)} min</option>
          ) : null}
        </select>
        <select name="kind" className="input" aria-label="Type" defaultValue={block?.kind ?? "study"}>
          {(Object.keys(KIND_LABEL) as DatedBlock["kind"][]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="track-fields">
        <select name="subject" className="input" aria-label="Subject" defaultValue={block?.subject ?? ""}>
          <option value="">No subject</option>
          {block?.subject ? <option value={block.subject}>{block.subject}</option> : null}
          <SubjectOptions />
        </select>
        <input name="topic" className="input" placeholder="Topic (optional)" aria-label="Topic" maxLength={120} defaultValue={block?.topic ?? ""} />
        <button type="submit" className="btn btn-dark track-add" disabled={pending}>
          {submitLabel}
        </button>
      </div>
      <ReplyLine reply={reply} />
    </form>
  );
}

function PlanPreview({ draft, onClose, onApplied }: { draft: PlanDraft; onClose: () => void; onApplied: (actionId: string | null, message: string) => void }) {
  const [keep, setKeep] = useState<boolean[]>(() => draft.blocks.map(() => true));
  const [editing, setEditing] = useState(false);
  const { pending, reply, setReply } = useAction();
  const [busy, setBusy] = useState(false);
  const chosen = draft.blocks.filter((_, i) => keep[i]);
  const days = [...new Set(draft.blocks.map((b) => dayKey(ms(b.starts_at))))];

  async function apply() {
    setBusy(true);
    try {
      const res = await applyWeekPlan({ ...draft, blocks: chosen });
      if (res.ok) onApplied(res.actionId ?? null, res.message);
      else setReply(res);
    } catch {
      setReply({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Plan preview">
      <div className="card-head">
        <h2 className="card-title">{draft.title}</h2>
        <span className="chip-outline">{draft.byAI ? "AI plan" : "Simple plan"}</span>
      </div>
      {draft.rationale ? <p className="lede" style={{ maxWidth: "none" }}>{draft.rationale}</p> : null}
      {draft.note ? <p className="field-help">{draft.note}</p> : null}
      <p style={{ fontWeight: 600 }}>
        I&apos;ll add {chosen.length} study block{chosen.length === 1 ? "" : "s"} to your Study planner
        . Any earlier AI plan for this week is replaced; blocks you added yourself stay.
      </p>
      <div className="tt-list">
        {days.map((d) => (
          <div key={d}>
            <p className="card-meta" style={{ margin: "8px 0 4px" }}>
              {formatDayKey(d)}
            </p>
            {draft.blocks.map((b, i) =>
              dayKey(ms(b.starts_at)) !== d ? null : (
                <label className="tt-item" key={i} style={{ cursor: editing ? "pointer" : "default" }}>
                  {editing ? (
                    <input type="checkbox" checked={keep[i]} onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))} aria-label={`Keep ${b.subject} at ${formatTime(ms(b.starts_at))}`} />
                  ) : null}
                  <span className="task-body">
                    <span className="task-title" style={keep[i] ? undefined : { textDecoration: "line-through", color: "var(--muted)" }}>
                      {b.kind === "rest" ? "Rest" : b.subject}
                      {b.topic ? ` · ${b.topic}` : ""}
                    </span>
                    <span className="task-sub">
                      {formatTime(ms(b.starts_at))}–{formatTime(ms(b.ends_at))} · {KIND_LABEL[b.kind]}
                    </span>
                  </span>
                </label>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="note-actions">
        <button type="button" className="btn btn-dark" onClick={apply} disabled={busy || pending || chosen.length === 0}>
          {busy ? "Saving…" : "Apply"}
        </button>
        <button type="button" className="btn" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          {editing ? "Done editing" : "Edit"}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
      <ReplyLine reply={reply} />
    </section>
  );
}

export function WeekPlanner({ weekStart, blocks, plan }: { weekStart: string; blocks: DatedBlock[]; plan: { title: string; rationale: string } | null }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const gen = useAction();
  const row = useAction();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const studyMin = blocks.filter((b) => b.kind !== "rest").reduce((s, b) => s + minutesOf(b.starts_at, b.ends_at), 0);
  const doneCount = blocks.filter((b) => b.done).length;

  function regenerate() {
    setDraft(null);
    setUndoId(null);
    gen.run(async () => {
      const res = await previewWeekPlan(weekStart);
      if (res.draft) setDraft(res.draft);
      return { ok: res.ok, message: res.message };
    });
  }

  return (
    <>
      <section className="card" aria-label="This week's plan">
        <div className="card-head">
          <h2 className="card-title">{plan?.title ?? "This week"}</h2>
          <span className="card-meta">
            {blocks.length ? `${blocks.length} blocks · ${(studyMin / 60).toFixed(1)} h study · ${doneCount} done` : "Nothing planned yet"}
          </span>
        </div>
        {plan?.rationale ? <p className="lede" style={{ maxWidth: "none" }}>{plan.rationale}</p> : null}
        <div className="note-actions">
          <button type="button" className="btn btn-dark" onClick={regenerate} disabled={gen.pending}>
            <Icon name="planner" size={16} />
            {gen.pending ? "Planning…" : blocks.some((b) => b.source === "ai") ? "Regenerate this week" : "Plan this week for me"}
          </button>
          <button type="button" className="btn" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            {adding ? "Close" : "Add a block"}
          </button>
        </div>
        <ReplyLine reply={gen.reply} />
        {undoId ? (
          <div className="note-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => row.run(() => undoPlan(undoId), () => setUndoId(null))}
              disabled={row.pending}
            >
              Undo
            </button>
          </div>
        ) : null}
        {adding ? <BlockForm weekStart={weekStart} submitLabel="Add" onDone={() => setAdding(false)} /> : null}
      </section>

      {draft ? (
        <PlanPreview
          draft={draft}
          onClose={() => setDraft(null)}
          onApplied={(id, message) => {
            setDraft(null);
            setUndoId(id);
            gen.setReply({ ok: true, message });
          }}
        />
      ) : null}

      <ReplyLine reply={row.reply} />
      <div className="tt-grid">
        {days.map((d) => {
          const list = blocks.filter((b) => dayKey(ms(b.starts_at)) === d);
          return (
            <section className="card tt-col" key={d} aria-label={formatDayKey(d)}>
              <div className="card-head">
                <h2 className="card-title">{formatDayKey(d)}</h2>
              </div>
              {list.length === 0 ? (
                <p className="track-empty" style={{ fontSize: 13 }}>
                  Free.
                </p>
              ) : (
                <div className="tt-list">
                  {list.map((b) =>
                    editId === b.id ? (
                      <div key={b.id}>
                        <BlockForm weekStart={weekStart} block={b} submitLabel="Save" onDone={() => setEditId(null)} />
                        <button type="button" className="btn btn-small" onClick={() => setEditId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="tt-item" key={b.id}>
                        <input
                          type="checkbox"
                          checked={b.done}
                          onChange={(e) => row.run(() => setBlockDone(b.id, e.target.checked))}
                          aria-label={`Mark ${b.subject ?? "block"} done`}
                          style={{ width: 22, height: 22, flex: "none" }}
                        />
                        <div className="task-body">
                          <span className="task-title" style={b.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                            {b.kind === "rest" ? "Rest" : (b.subject ?? "Study")}
                            {b.topic ? ` · ${b.topic}` : ""}
                          </span>
                          <span className="task-sub">
                            {formatTime(ms(b.starts_at))}–{formatTime(ms(b.ends_at))} · {KIND_LABEL[b.kind]}
                            {b.source === "ai" ? " · AI" : ""}
                          </span>
                        </div>
                        <button type="button" className="task-del" aria-label="Edit block" onClick={() => setEditId(b.id)}>
                          <Icon name="edit" size={16} />
                        </button>
                        <button type="button" className="task-del" aria-label="Delete block" onClick={() => row.run(() => deleteDatedBlock(b.id))}>
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
