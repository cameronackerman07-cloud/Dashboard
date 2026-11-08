"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ReplyLine, useAction } from "@/components/useAction";
import { formatTime } from "@/lib/time";
import type { Reply } from "@/lib/validate";
import { applyProposal, askAssistant, setAskBeforeChanges, undoAssistantAction, type Applied, type Proposal } from "./actions";

type Status = { state: "waiting" } | { state: "cancelled" } | { state: "done"; ok: boolean; message: string; actionId: string | null; undone?: boolean };

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; mode?: string; note?: string; proposals: Proposal[]; applied: Applied[]; model?: string }
  | { role: "error"; text: string };

const MODE_LABEL: Record<string, string> = { tutor: "Tutor", chat: "Chat", action: "Doing" };
const ms = (iso: string) => new Date(iso).getTime();

function ProposalCard({ p, status, onStatus }: { p: Proposal; status: Status; onStatus: (s: Status) => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Proposal>(p);

  async function apply() {
    setBusy(true);
    try {
      if (draft.action.type === "run_agent") {
        const res = await fetch("/api/agents/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: draft.agentId }) });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        onStatus({ state: "done", ok: !!body.ok, message: body.message ?? "Something went wrong.", actionId: null });
      } else {
        const res = await applyProposal(draft);
        onStatus({ state: "done", ok: res.ok, message: res.message, actionId: res.actionId });
      }
    } catch {
      onStatus({ state: "done", ok: false, message: "Couldn't reach the server. Check your connection and try again.", actionId: null });
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    setBusy(true);
    try {
      const res = await undoAssistantAction(id);
      onStatus({ state: "done", ok: res.ok, message: res.message, actionId: id, undone: res.ok });
    } finally {
      setBusy(false);
    }
  }

  const a = draft.action;
  const editable = a.type === "add_todo" || a.type === "add_note" || a.type === "rename_agent" || (a.type === "create_study_plan" && draft.plan);

  return (
    <div className="card" style={{ padding: 14, gap: 10 }}>
      <p style={{ fontWeight: 600, margin: 0 }}>{draft.summary}</p>

      {draft.unavailable ? <p className="field-help">{draft.unavailable}</p> : null}

      {draft.plan && !editing ? (
        <ul className="tt-list" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {draft.plan.blocks.slice(0, 40).map((b, i) => (
            <li key={i} className="task-sub">
              {new Date(b.starts_at).toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Sydney" })} {formatTime(ms(b.starts_at))}–{formatTime(ms(b.ends_at))} ·{" "}
              {b.kind === "rest" ? "Rest" : b.subject}
              {b.topic ? ` · ${b.topic}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {draft.plan?.note ? <p className="field-help">{draft.plan.note}</p> : null}

      {a.type === "create_flashcards" ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {a.cards.slice(0, 5).map((c, i) => (
            <li key={i} className="task-sub">
              {c.front}
            </li>
          ))}
          {a.cards.length > 5 ? <li className="task-sub">and {a.cards.length - 5} more</li> : null}
        </ul>
      ) : null}

      {editing && a.type === "add_todo" ? (
        <input className="input" aria-label="To-do" value={a.title} maxLength={200} onChange={(e) => setDraft({ ...draft, action: { ...a, title: e.target.value }, summary: `Add "${e.target.value}" to your to-do list.` })} />
      ) : null}
      {editing && a.type === "add_note" ? (
        <>
          <input className="input" aria-label="Note title" value={a.title} maxLength={200} onChange={(e) => setDraft({ ...draft, action: { ...a, title: e.target.value }, summary: `Save a note called "${e.target.value}".` })} />
          <textarea className="input" aria-label="Note" rows={6} value={a.body} onChange={(e) => setDraft({ ...draft, action: { ...a, body: e.target.value } })} />
        </>
      ) : null}
      {editing && a.type === "rename_agent" ? (
        <input className="input" aria-label="New name" value={a.new_name} maxLength={24} onChange={(e) => setDraft({ ...draft, action: { ...a, new_name: e.target.value }, summary: `Rename to ${e.target.value}.` })} />
      ) : null}
      {editing && draft.plan ? (
        <div className="tt-list">
          {draft.plan.blocks.map((b, i) => (
            <div key={i} className="tt-item">
              <span className="task-body">
                <span className="task-title">{b.kind === "rest" ? "Rest" : b.subject}</span>
                <span className="task-sub">
                  {new Date(b.starts_at).toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Sydney" })} {formatTime(ms(b.starts_at))}–{formatTime(ms(b.ends_at))}
                </span>
              </span>
              <button
                type="button"
                className="task-del"
                aria-label="Remove this block"
                onClick={() => {
                  const blocks = draft.plan!.blocks.filter((_, j) => j !== i);
                  setDraft({ ...draft, plan: { ...draft.plan!, blocks }, summary: `I'll add ${blocks.length} study blocks to your Study planner.` });
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {status.state === "waiting" && !draft.unavailable ? (
        draft.href ? (
          <div className="note-actions">
            <Link href={draft.href} className="btn btn-dark">
              Open
            </Link>
          </div>
        ) : (
          <div className="note-actions">
            <button type="button" className="btn btn-dark" onClick={apply} disabled={busy || (draft.plan ? draft.plan.blocks.length === 0 : false)}>
              {busy ? "Working…" : "Apply"}
            </button>
            {editable ? (
              <button type="button" className="btn" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                {editing ? "Done editing" : "Edit"}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => onStatus({ state: "cancelled" })}>
              Cancel
            </button>
          </div>
        )
      ) : null}
      {status.state === "cancelled" ? <p className="field-help">Cancelled. Nothing was changed.</p> : null}
      {status.state === "done" ? (
        <>
          <ReplyLine reply={{ ok: status.ok, message: status.message }} />
          {status.ok && status.actionId && !status.undone ? (
            <div className="note-actions">
              {a.type === "create_study_plan" || a.type === "add_study_block" ? (
                <Link href="/planner" className="btn btn-small">
                  Open Study planner
                </Link>
              ) : null}
              <button type="button" className="btn btn-small" onClick={() => undo(status.actionId!)} disabled={busy}>
                Undo
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function AppliedLine({ a }: { a: Applied }) {
  const { pending, reply, run } = useAction();
  const [undone, setUndone] = useState(false);
  return (
    <div>
      <ReplyLine reply={reply ?? ({ ok: a.ok, message: a.message } as Reply)} />
      {a.ok && a.actionId && !undone ? (
        <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => undoAssistantAction(a.actionId!), () => setUndone(true))}>
          Undo
        </button>
      ) : null}
    </div>
  );
}

export function AssistantClient({ initial, askFirst: initialAskFirst }: { initial: string; askFirst: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [input, setInput] = useState(initial);
  const [pending, setPending] = useState(false);
  const [askFirst, setAskFirst] = useState(initialAskFirst);
  const toggle = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || pending) return;
    const history = messages
      .filter((m): m is Exclude<Msg, { role: "error" }> => m.role !== "error")
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setPending(true);
    try {
      const res = await askAssistant(t, history);
      if (!res.ok) setMessages((m) => [...m, { role: "error", text: res.message }]);
      else {
        const proposals = res.proposals ?? [];
        setStatuses((s) => ({ ...s, ...Object.fromEntries(proposals.map((p) => [p.key, { state: "waiting" } as Status])) }));
        setMessages((m) => [...m, { role: "assistant", text: res.reply ?? "", mode: res.mode, note: res.message || undefined, proposals, applied: res.applied ?? [], model: res.model }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "error", text: "Couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (initial && !sentInitial.current) {
      sentInitial.current = true;
      void send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section className="card" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 ? (
          <div className="track-empty">
            <p style={{ margin: 0 }}>Try:</p>
            <div className="note-actions">
              {["Make me a study plan for this week", "Give me a hint for integrating x·e^x", "Add a to-do: finish Physics prac report by Friday"].map((s) => (
                <button key={s} type="button" className="btn btn-small" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--ink)", color: "#fff", borderRadius: 14, padding: "10px 14px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {m.text}
            </div>
          ) : m.role === "error" ? (
            <p key={i} className="ai-error" role="alert">
              {m.text}
            </p>
          ) : (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="card-meta">
                The BRIAN{m.mode ? ` · ${MODE_LABEL[m.mode] ?? m.mode}` : ""}
                {m.model ? ` · ${m.model}` : ""}
              </span>
              {m.text ? <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55 }}>{m.text}</div> : null}
              {m.note ? <p className="field-help">{m.note}</p> : null}
              {m.applied.map((a, j) => (
                <AppliedLine key={`a${j}`} a={a} />
              ))}
              {m.proposals.map((p) => (
                <ProposalCard key={p.key} p={p} status={statuses[p.key] ?? { state: "waiting" }} onStatus={(s) => setStatuses((all) => ({ ...all, [p.key]: s }))} />
              ))}
            </div>
          ),
        )}
        {pending ? <p className="card-meta">Thinking…</p> : null}
        <div ref={endRef} />
      </section>

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label>
          <Icon name="sparkle" />
          <span className="sr-only">Message The BRIAN</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} type="text" placeholder="Ask anything, or ask it to do something…" maxLength={4000} />
        </label>
        <button type="submit" className="btn btn-dark" style={{ minHeight: 44 }} disabled={pending || !input.trim()}>
          Send
        </button>
      </form>

      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
        <input
          type="checkbox"
          checked={askFirst}
          style={{ width: 22, height: 22 }}
          onChange={(e) => {
            const on = e.target.checked;
            setAskFirst(on);
            toggle.run(() => setAskBeforeChanges(on));
          }}
        />
        <span>
          <span className="field-label">Ask before changing things</span>
          <span className="field-help" style={{ display: "block" }}>
            When this is off, tiny things like adding one to-do happen straight away, with an Undo button.
          </span>
        </span>
      </label>
      <ReplyLine reply={toggle.reply} />
    </>
  );
}
