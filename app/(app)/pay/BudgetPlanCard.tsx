"use client";

import { useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import type { BudgetAnswer, BudgetPlan, BudgetQuestion } from "@/lib/budget-plan-core";
import { formatCents } from "@/lib/money";
import { addDays, formatDayKey } from "@/lib/time";
import { applyWeeklyLimits, budgetQuestion, makeBudgetPlan } from "./actions";

type Props = {
  thisWeek: string;
  plan: { id: string; plan: BudgetPlan } | null;
  spentByCategory: Record<string, number>; // this week's expenses
  aiReady: boolean;
};

type Flow = { step: "idle" } | { step: "asking"; answers: BudgetAnswer[]; question: BudgetQuestion | null } | { step: "making" };

function Bar({ used, of }: { used: number; of: number }) {
  const pct = of > 0 ? Math.min(100, Math.round((used / of) * 100)) : used > 0 ? 100 : 0;
  return (
    <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "var(--hover)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: used > of ? "var(--ink)" : "var(--muted)" }} />
    </div>
  );
}

export function BudgetPlanCard({ thisWeek, plan: initialPlan, spentByCategory, aiReady }: Props) {
  const [plan, setPlan] = useState(initialPlan);
  const [flow, setFlow] = useState<Flow>({ step: "idle" });
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const limits = useAction();
  const msg = useAction();

  async function ask(answers: BudgetAnswer[]) {
    setBusy(true);
    try {
      const res = await budgetQuestion(thisWeek, answers);
      if (res.ok && res.question) setFlow({ step: "asking", answers, question: res.question });
      else await make(answers);
    } catch {
      msg.setReply({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
      setFlow({ step: "idle" });
    } finally {
      setBusy(false);
    }
  }

  async function make(answers: BudgetAnswer[]) {
    setFlow({ step: "making" });
    const res = await makeBudgetPlan(thisWeek, answers);
    if (res.ok && res.plan && res.id) setPlan({ id: res.id, plan: res.plan });
    msg.setReply({ ok: res.ok, message: res.message });
    setFlow({ step: "idle" });
  }

  function reply(a: string) {
    if (flow.step !== "asking" || !flow.question) return;
    const answers = [...flow.answers, { q: flow.question.text, a: a.slice(0, 200) }];
    setAnswer("");
    void ask(answers);
  }

  const p = plan?.plan;
  const spendTotal = p ? p.allowance.reduce((a, x) => a + x.cents, 0) : 0;
  const spentTotal = p ? p.allowance.reduce((a, x) => a + (spentByCategory[x.category] ?? 0), 0) : 0;

  return (
    <section className="card" aria-label="This week's budget plan">
      <div className="card-head">
        <h2 className="card-title">This week&apos;s plan</h2>
        <span className="card-meta">
          {formatDayKey(thisWeek)} – {formatDayKey(addDays(thisWeek, 6))}
        </span>
      </div>

      {flow.step === "idle" ? (
        <>
          {!p ? (
            <p className="lede" style={{ maxWidth: "none" }}>
              Answer up to 5 quick questions and get a plan for this week: expected income, fixed costs, spending by category and day, a buffer and an amount to save.
            </p>
          ) : null}
          <div className="note-actions">
            <button type="button" className="btn btn-dark" disabled={busy} onClick={() => ask([])}>
              {busy ? "Starting…" : p ? "Plan my week again" : "Plan my week"}
            </button>
          </div>
          <p className="field-help">
            {aiReady
              ? "Only categories and amounts are sent to your own AI provider (no names, shops or account details). This is general budgeting help, not financial advice."
              : "No AI key yet, so the plan is worked out from your recent spending. This is general budgeting help, not financial advice."}
          </p>
        </>
      ) : null}

      {flow.step === "asking" && flow.question ? (
        <div className="field">
          <span className="card-meta">Question {flow.answers.length + 1} of up to 5</span>
          <p className="field-label" style={{ fontSize: 15 }}>
            {flow.question.text}
          </p>
          {flow.question.options.length ? (
            <div className="note-actions">
              {flow.question.options.map((o) => (
                <button key={o} type="button" className="btn btn-small" disabled={busy} onClick={() => reply(o)}>
                  {o}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="track-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (answer.trim()) reply(answer.trim());
            }}
          >
            <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={200} placeholder="Or type an answer" aria-label="Your answer" />
            <button type="submit" className="btn btn-dark" disabled={busy || !answer.trim()}>
              {busy ? "…" : "Next"}
            </button>
          </form>
          <div className="note-actions">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => make(flow.answers)}>
              Skip the rest and make the plan
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => setFlow({ step: "idle" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {flow.step === "making" ? <p className="card-meta">Making your plan…</p> : null}
      <ReplyLine reply={msg.reply} />

      {p && flow.step === "idle" ? (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Expected in</span>
              <span className="stat-value">{formatCents(p.income.cents)}</span>
              <span className="card-meta">Estimate: {p.income.basis}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Spending</span>
              <span className="stat-value">
                {formatCents(spentTotal)} / {formatCents(spendTotal)}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">To savings</span>
              <span className="stat-value">{formatCents(p.savingsCents)}</span>
              <span className="card-meta">Buffer {formatCents(p.bufferCents)}</span>
            </div>
          </div>
          {p.note ? <p className="field-help">{p.note}</p> : null}

          {p.fixed.length ? (
            <div>
              <h3 className="field-label">Fixed costs</h3>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {p.fixed.map((f) => (
                  <li key={f.label}>
                    {f.label}: {formatCents(f.cents)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 className="field-label">Spending by category</h3>
            {p.allowance.map((a) => {
              const used = spentByCategory[a.category] ?? 0;
              return (
                <div key={a.category} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                    <span>{a.category}</span>
                    <span className="card-meta">
                      {formatCents(used)} of {formatCents(a.cents)}
                      {used > a.cents ? " · over" : ""}
                    </span>
                  </div>
                  <Bar used={used} of={a.cents} />
                </div>
              );
            })}
          </div>

          <p className="card-meta">
            About {formatCents(p.byDay[0]?.cents ?? 0)} a day of flexible spending.
          </p>

          {p.tips.length ? (
            <div>
              <h3 className="field-label">Tips</h3>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {p.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="note-actions">
            <button
              type="button"
              className="btn"
              disabled={limits.pending}
              onClick={() => {
                if (window.confirm(`Set weekly limits for ${p.allowance.map((a) => `${a.category} ${formatCents(a.cents)}`).join(", ")}?`)) limits.run(() => applyWeeklyLimits(plan!.id));
              }}
            >
              Apply as this week&apos;s limits
            </button>
          </div>
          <ReplyLine reply={limits.reply} />
        </>
      ) : null}
    </section>
  );
}
