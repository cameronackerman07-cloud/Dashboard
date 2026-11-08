"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import { Report } from "@/app/(app)/inbox/InboxClient";
import type { Schedule, Weekday } from "@/lib/agents/schedule";
import type { ReportSection } from "@/lib/agents/types";
import type { Reply } from "@/lib/validate";
import { createAgent, deleteAgent, renameAgent, resetAgent, setAgentEnabled, updateAgent } from "./actions";

export type HubAgent = {
  id: string;
  slug: string;
  role: "specialist" | "chief";
  name: string;
  description: string;
  enabled: boolean;
  kind: "builtin" | "custom";
  schedule: Schedule;
  scheduleLabel: string;
  instructions: string;
  sources: string[];
  importanceMin: number;
  dailyAiBudget: number;
  webSources: string[];
  briefingAt: string;
  resetAt: string;
  tone: string;
  status: "ok" | "running" | "error" | "disabled";
  active: boolean;
  unread: number;
  lastRun: string | null;
  nextRun: string | null;
  runs: { when: string; status: string; error: string | null; findings: number }[];
  findings: { id: string; title: string; importance: number; when: string }[];
};

type HubReport = { id: string; title: string; headline: string; sections: ReportSection[]; when: string; unread: boolean; kind: string };
type Source = { id: string; label: string; sensitive?: boolean };

const monogram = (name: string) =>
  name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

const DAYS: { id: Weekday; label: string }[] = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

function InlineName({ agent }: { agent: HubAgent }) {
  const [value, setValue] = useState(agent.name);
  const { reply, run } = useAction();
  useEffect(() => setValue(agent.name), [agent.name]);
  const save = () => {
    const v = value.trim();
    if (v && v !== agent.name) run(() => renameAgent(agent.id, v));
    else setValue(agent.name);
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={`name-${agent.id}`}>
        Name
      </label>
      <input
        id={`name-${agent.id}`}
        className="input agent-name-input"
        value={value}
        maxLength={24}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") setValue(agent.name);
        }}
      />
      <ReplyLine reply={reply?.ok ? null : reply} />
    </div>
  );
}

function ScheduleFields({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  return (
    <div className="track-fields">
      <select
        className="input"
        aria-label="How often"
        value={value.type}
        onChange={(e) => {
          const t = e.target.value;
          onChange(t === "every" ? { type: "every", minutes: 120 } : t === "weekly" ? { type: "weekly", day: "mon", at: "07:00" } : { type: "daily", at: "07:00" });
        }}
      >
        <option value="every">Every few hours</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      {value.type === "every" ? (
        <select className="input" aria-label="Interval" value={value.minutes} onChange={(e) => onChange({ type: "every", minutes: Number(e.target.value) })}>
          {[30, 60, 120, 180, 240, 360, 720].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `Every ${m} minutes` : `Every ${m / 60} hour${m === 60 ? "" : "s"}`}
            </option>
          ))}
        </select>
      ) : null}
      {value.type === "weekly" ? (
        <select className="input" aria-label="Day" value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value as Weekday })}>
          {DAYS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      ) : null}
      {value.type !== "every" ? <input type="time" className="input" aria-label="Time" value={value.at} onChange={(e) => onChange({ ...value, at: e.target.value })} /> : null}
    </div>
  );
}

function Drawer({ agent, reports, sources, onClose }: { agent: HubAgent; reports: HubReport[]; sources: Source[]; onClose: () => void }) {
  const save = useAction();
  const other = useAction();
  const [schedule, setSchedule] = useState<Schedule>(agent.schedule);
  const [sel, setSel] = useState<string[]>(agent.sources);
  const [runMsg, setRunMsg] = useState<Reply | null>(null);
  const [running, setRunning] = useState(false);
  const chief = agent.role === "chief";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    const res = await fetch("/api/agents/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent.id }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Couldn't reach the server." }));
    setRunMsg({ ok: !!res.ok, message: res.message ?? "Done." });
    setRunning(false);
  }

  return (
    <>
      <button type="button" className="drawer-scrim" aria-label="Close" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={agent.name}>
        <div className="card-head">
          <h2 className="card-title">{agent.name}</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="track-empty">{agent.description}</p>
        <InlineName agent={agent} />
        <label className="paste-replace">
          <input type="checkbox" checked={agent.enabled} onChange={(e) => other.run(() => setAgentEnabled(agent.id, e.target.checked))} /> On
        </label>
        <p className="card-meta">
          {agent.lastRun ? `Last ran ${agent.lastRun}` : "Hasn't run yet"}
          {agent.nextRun ? ` · next ${agent.nextRun}` : ""}
        </p>
        <div className="note-actions">
          <button type="button" className="btn btn-dark" disabled={running} onClick={runNow}>
            {running ? "Running…" : "Run now"}
          </button>
        </div>
        <ReplyLine reply={runMsg} />

        {chief ? (
          <section className="drawer-section">
            <h3 className="field-label">Recent reports</h3>
            {reports.length === 0 ? <p className="track-empty">None yet.</p> : null}
            {reports.slice(0, 3).map((r) => (
              <details className="upload" key={r.id}>
                <summary>
                  <span className="task-title">{r.title}</span>
                  <span className="task-sub">{r.when}</span>
                </summary>
                <div className="upload-body">
                  <Report report={r} />
                </div>
              </details>
            ))}
            <Link href="/assistant" className="btn">
              Ask {agent.name}
            </Link>
          </section>
        ) : null}

        <form
          className="track-form drawer-section"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.run(() =>
              updateAgent(agent.id, {
                schedule,
                instructions: String(f.get("instructions") ?? ""),
                sources: sel,
                importanceMin: Number(f.get("importance")),
                dailyAiBudget: Number(f.get("budget")),
                webSources: String(f.get("web") ?? "")
                  .split(/\s+/)
                  .filter(Boolean),
                briefingAt: String(f.get("briefing_at") ?? ""),
                resetAt: String(f.get("reset_at") ?? ""),
                tone: String(f.get("tone") ?? ""),
              }),
            );
          }}
        >
          {chief ? (
            <>
              <div className="track-fields">
                <label className="field">
                  <span className="field-label">Briefing time</span>
                  <input type="time" name="briefing_at" className="input" defaultValue={agent.briefingAt} />
                </label>
                <label className="field">
                  <span className="field-label">Sunday reset</span>
                  <input type="time" name="reset_at" className="input" defaultValue={agent.resetAt} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Tone</span>
                <input name="tone" className="input" defaultValue={agent.tone} maxLength={60} placeholder="e.g. warm and direct" />
              </label>
            </>
          ) : (
            <div className="field">
              <span className="field-label">Schedule</span>
              <ScheduleFields value={schedule} onChange={setSchedule} />
            </div>
          )}
          <label className="field">
            <span className="field-label">{agent.kind === "custom" ? "What it should do" : "Extra instructions"}</span>
            <textarea name="instructions" className="input" rows={3} maxLength={2000} defaultValue={agent.instructions} />
          </label>
          <fieldset className="mcq-fieldset">
            <legend className="field-label">It may read</legend>
            {sources.map((s) => (
              <label className="paste-replace" key={s.id}>
                <input
                  type="checkbox"
                  checked={sel.includes(s.id)}
                  onChange={(e) => setSel((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                />
                {s.label}
                {s.sensitive ? <span className="chip-outline">sensitive</span> : null}
              </label>
            ))}
          </fieldset>
          <div className="track-fields">
            <label className="field">
              <span className="field-label">Notify me from importance</span>
              <select name="importance" className="input" defaultValue={agent.importanceMin}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 5 ? "(urgent only)" : n === 1 ? "(everything)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">AI calls a day</span>
              <input type="number" name="budget" className="input" min={0} max={100} defaultValue={agent.dailyAiBudget} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Web pages or RSS feeds (one per line)</span>
            <textarea name="web" className="input" rows={2} defaultValue={agent.webSources.join("\n")} placeholder="https://…" />
          </label>
          <div className="note-actions">
            <button type="submit" className="btn btn-dark" disabled={save.pending}>
              Save
            </button>
            {agent.kind === "builtin" ? (
              <button
                type="button"
                className="btn"
                disabled={other.pending}
                onClick={() => window.confirm("Reset this agent's name and settings to the defaults?") && other.run(() => resetAgent(agent.id))}
              >
                Reset to defaults
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={other.pending}
                onClick={() => {
                  if (window.confirm(`Delete ${agent.name}?`)) other.run(() => deleteAgent(agent.id), onClose);
                }}
              >
                Delete
              </button>
            )}
          </div>
          <ReplyLine reply={save.reply} />
          <ReplyLine reply={other.reply} />
        </form>

        <section className="drawer-section">
          <h3 className="field-label">Latest findings</h3>
          {agent.findings.length === 0 ? <p className="track-empty">Nothing yet.</p> : null}
          <ul className="summary-points">
            {agent.findings.map((f) => (
              <li key={f.id}>
                {f.title} <span className="card-meta">· {f.when}</span>
              </li>
            ))}
          </ul>
          <h3 className="field-label">Run history</h3>
          {agent.runs.length === 0 ? <p className="track-empty">No runs yet.</p> : null}
          <ul className="summary-points">
            {agent.runs.map((r, i) => (
              <li key={i}>
                {r.when}: {r.status === "ok" ? `finished, ${r.findings} new` : r.status === "skipped" ? `skipped — ${r.error ?? ""}` : r.status === "error" ? `didn't finish — ${r.error ?? "something went wrong"}` : "running"}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  );
}

function CreateAgent({ sources, onClose }: { sources: Source[]; onClose: () => void }) {
  const { pending, reply, run } = useAction();
  const [schedule, setSchedule] = useState<Schedule>({ type: "daily", at: "08:00" });
  const [sel, setSel] = useState<string[]>(["todos"]);
  return (
    <>
      <button type="button" className="drawer-scrim" aria-label="Close" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Add an agent">
        <div className="card-head">
          <h2 className="card-title">Add an agent</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <form
          className="track-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                createAgent({
                  name: String(f.get("name") ?? ""),
                  instructions: String(f.get("instructions") ?? ""),
                  sources: sel,
                  schedule,
                  importanceMin: Number(f.get("importance")),
                }),
              onClose,
            );
          }}
        >
          <label className="field">
            <span className="field-label">Name</span>
            <input name="name" className="input" maxLength={24} required placeholder="e.g. Exam countdown" />
          </label>
          <label className="field">
            <span className="field-label">What it should do, in your own words</span>
            <textarea name="instructions" className="input" rows={4} maxLength={2000} required placeholder="e.g. Each morning, tell me which assignment I should start first and why." />
          </label>
          <fieldset className="mcq-fieldset">
            <legend className="field-label">It may read</legend>
            {sources.map((s) => (
              <label className="paste-replace" key={s.id}>
                <input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))} />
                {s.label}
                {s.sensitive ? <span className="chip-outline">sensitive</span> : null}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <span className="field-label">Schedule</span>
            <ScheduleFields value={schedule} onChange={setSchedule} />
          </div>
          <label className="field">
            <span className="field-label">Notify me from importance</span>
            <select name="importance" className="input" defaultValue={3}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="field-help">It can only read what you tick and only writes findings. It never changes your data or contacts anyone.</p>
          <div className="note-actions">
            <button type="submit" className="btn btn-dark" disabled={pending}>
              Create agent
            </button>
          </div>
          <ReplyLine reply={reply} />
        </form>
      </aside>
    </>
  );
}

function Node({ agent, onOpen, style }: { agent: HubAgent; onOpen: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      className={`agent-node is-${agent.status}`}
      style={style}
      onClick={onOpen}
      aria-label={`${agent.name}${agent.status === "error" ? ", last run had a problem" : ""}${agent.status === "disabled" ? ", switched off" : ""}${agent.unread ? `, ${agent.unread} new findings` : ""}`}
    >
      <span className="agent-mono">
        {monogram(agent.name)}
        {agent.status === "error" ? <span className="agent-flag">!</span> : null}
        {agent.unread ? <span className="agent-badge">{agent.unread}</span> : null}
      </span>
      <span className="agent-label">{agent.name}</span>
    </button>
  );
}

export function AgentsHub({ agents, reports, sources, brianStatus }: { agents: HubAgent[]; reports: HubReport[]; sources: Source[]; brianStatus: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"orbit" | "list">("orbit");
  const [paused, setPaused] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const brian = agents.find((a) => a.role === "chief");
  const others = agents.filter((a) => a.role !== "chief");
  const ringMax = narrow ? 8 : 14;
  const onRing = others.slice(0, ringMax);
  const overflow = others.slice(ringMax);
  const open = agents.find((a) => a.id === openId) ?? null;

  // Positions: one ring up to 8 nodes (plus the Add node), two rings beyond.
  const slots = onRing.length + 1;
  const twoRings = slots > 9;
  const place = (i: number) => {
    const inner = twoRings && i % 2 === 1;
    const r = inner ? 27 : 41;
    const angle = (i / slots) * Math.PI * 2 - Math.PI / 2;
    return { left: `${50 + r * Math.cos(angle)}%`, top: `${50 + r * Math.sin(angle)}%` };
  };

  return (
    <>
      <div className="note-actions">
        <div className="seg" role="group" aria-label="View">
          {(["orbit", "list"] as const).map((v) => (
            <button key={v} type="button" className={`seg-btn${view === v ? " is-active" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "orbit" ? "Orbit" : "List"}
            </button>
          ))}
        </div>
        {view === "orbit" ? (
          <button type="button" className="btn btn-small" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume motion" : "Pause motion"}
          </button>
        ) : null}
      </div>

      {view === "orbit" ? (
        <section className={`orbit${paused ? " is-paused" : ""}`} aria-label="Your agents around The BRIAN">
          <svg className="orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <circle cx="50" cy="50" r="41" className="orbit-ring" />
            {twoRings ? <circle cx="50" cy="50" r="27" className="orbit-ring" /> : null}
            {onRing.map((a, i) => {
              const p = place(i);
              return <line key={a.id} x1="50" y1="50" x2={parseFloat(p.left)} y2={parseFloat(p.top)} className={a.active ? "orbit-line is-active" : "orbit-line"} />;
            })}
          </svg>
          {brian ? (
            <button type="button" className="brian-node" onClick={() => setOpenId(brian.id)} aria-label={`${brian.name}. ${brianStatus}`}>
              <span className="brian-name">{brian.name}</span>
              <span className="brian-status">{brianStatus}</span>
            </button>
          ) : null}
          {onRing.map((a, i) => (
            <div className="agent-slot" key={a.id} style={{ ...place(i), animationDelay: `${(i % 5) * -1.3}s` }}>
              <Node agent={a} onOpen={() => setOpenId(a.id)} />
            </div>
          ))}
          <div className="agent-slot" style={place(onRing.length)}>
            <button type="button" className="agent-node is-add" onClick={() => setCreating(true)} aria-label="Add agent">
              <span className="agent-mono">+</span>
              <span className="agent-label">Add agent</span>
            </button>
          </div>
        </section>
      ) : null}

      {view === "list" || overflow.length > 0 ? (
        <section className="card" aria-label="All agents">
          <div className="card-head">
            <h2 className="card-title">{view === "list" ? "All agents" : "More agents"}</h2>
            {view === "list" ? (
              <button type="button" className="btn btn-small" onClick={() => setCreating(true)}>
                Add agent
              </button>
            ) : null}
          </div>
          <div className="track-list">
            {(view === "list" ? agents : overflow).map((a) => (
              <button type="button" className="note-link agent-row" key={a.id} onClick={() => setOpenId(a.id)}>
                <span className="task-title">
                  {a.name}
                  {a.unread ? <span className="chip pin-chip" style={{ marginLeft: 8 }}>{a.unread}</span> : null}
                </span>
                <span className="task-sub">
                  {a.status === "disabled" ? "Off" : a.status === "error" ? "Last run had a problem" : a.scheduleLabel}
                  {a.lastRun ? ` · last ran ${a.lastRun}` : ""}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {open ? <Drawer key={open.id} agent={open} reports={reports} sources={sources} onClose={() => setOpenId(null)} /> : null}
      {creating ? <CreateAgent sources={sources} onClose={() => setCreating(false)} /> : null}
    </>
  );
}
