"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ReplyLine, useAction } from "@/components/useAction";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type BudgetLimit,
  type SavingsGoal,
  type Transaction,
} from "@/lib/budget";
import { centsToInput, formatCents } from "@/lib/money";
import { formatDayKey } from "@/lib/time";
import {
  addGoal,
  addToGoal,
  addTransaction,
  deleteGoal,
  deleteTransaction,
  logShiftPay,
  setBudgetLimit,
} from "./actions";

export type ShiftWeek = { monday: string; label: string; cents: number; logged: boolean; future: boolean };

type Props = {
  transactions: Transaction[];
  limits: BudgetLimit[];
  goals: SavingsGoal[];
  shiftWeeks: ShiftWeek[];
  defaultDay: string;
};

export function PayClient({ transactions, limits, goals, shiftWeeks, defaultDay }: Props) {
  return (
    <>
      {shiftWeeks.length > 0 ? <ShiftPayCard weeks={shiftWeeks} /> : null}
      <AddTransaction defaultDay={defaultDay} />
      <Spending transactions={transactions} limits={limits} />
      <TransactionList transactions={transactions} />
      <Goals goals={goals} />
    </>
  );
}

function ShiftPayCard({ weeks }: { weeks: ShiftWeek[] }) {
  const { pending, reply, run } = useAction();
  return (
    <section className="card" aria-label="Estimated shift pay">
      <div className="card-head">
        <h2 className="card-title">Estimated shift pay</h2>
        <span className="card-meta">From Shifts, before tax</span>
      </div>
      <div className="track-list">
        {weeks.map((w) => (
          <div className="task" key={w.monday}>
            <div className="task-body">
              <span className="task-title">{w.label}</span>
              <span className="task-sub">{formatCents(w.cents)}</span>
            </div>
            {w.logged ? (
              <span className="chip-outline">Logged</span>
            ) : w.future ? (
              <span className="card-meta">Upcoming</span>
            ) : (
              <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => logShiftPay(w.monday))}>
                Log as income
              </button>
            )}
          </div>
        ))}
      </div>
      <ReplyLine reply={reply} />
    </section>
  );
}

function AddTransaction({ defaultDay }: { defaultDay: string }) {
  const { pending, reply, run } = useAction();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [key, setKey] = useState(0);
  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <section className="card" aria-label="Add money in or out">
      <h2 className="card-title">Add money in or out</h2>
      <div className="seg" role="group" aria-label="Income or spending">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`seg-btn${type === t ? " is-active" : ""}`}
            aria-pressed={type === t}
            onClick={() => setType(t)}
          >
            {t === "expense" ? "Spent" : "Income"}
          </button>
        ))}
      </div>
      <form
        key={key}
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          f.set("type", type);
          run(() => addTransaction(f), () => setKey((k) => k + 1));
        }}
      >
        <label className="field">
          <span className="field-label">Amount ($)</span>
          <input name="amount" className="input" inputMode="decimal" placeholder="12.50" required />
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <input
            name="category"
            className="input"
            list={`cats-${type}`}
            defaultValue={type === "income" ? "Shift pay" : "Food"}
            maxLength={40}
            required
          />
          <datalist id={`cats-${type}`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">Date</span>
          <input name="day" type="date" className="input" defaultValue={defaultDay} required />
        </label>
        <label className="field">
          <span className="field-label">Note</span>
          <input name="note" className="input" maxLength={200} placeholder="Optional" />
        </label>
        <div className="note-actions form-wide">
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? "Saving…" : type === "income" ? "Add income" : "Add spending"}
          </button>
        </div>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}

function Spending({ transactions, limits }: { transactions: Transaction[]; limits: BudgetLimit[] }) {
  const { pending, reply, run } = useAction();
  const [key, setKey] = useState(0);
  const spentBy = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "expense") spentBy.set(t.category, (spentBy.get(t.category) ?? 0) + t.amount_cents);
  }
  const limitBy = new Map(limits.map((l) => [l.category, l.monthly_limit_cents]));
  const categories = [...new Set([...spentBy.keys(), ...limitBy.keys()])].sort(
    (a, b) => (spentBy.get(b) ?? 0) - (spentBy.get(a) ?? 0) || a.localeCompare(b),
  );
  const scale = Math.max(1, ...categories.map((c) => Math.max(spentBy.get(c) ?? 0, limitBy.get(c) ?? 0)));

  return (
    <section className="card" aria-label="Spending by category">
      <div className="card-head">
        <h2 className="card-title">Spending by category</h2>
        <span className="card-meta">Line = monthly limit</span>
      </div>
      {categories.length === 0 ? (
        <p className="track-empty">No spending this month yet.</p>
      ) : (
        <div className="bars">
          {categories.map((c) => {
            const spent = spentBy.get(c) ?? 0;
            const limit = limitBy.get(c);
            const over = limit !== undefined && spent > limit;
            return (
              <div className="bar-row" key={c}>
                <div className="bar-label">
                  <span>{c}</span>
                  <span className="card-meta">
                    {formatCents(spent)}
                    {limit !== undefined ? ` of ${formatCents(limit)}` : ""}
                    {over ? ` · over by ${formatCents(spent - limit)}` : ""}
                  </span>
                </div>
                <div
                  className="bar-track"
                  role="img"
                  aria-label={`${c}: ${formatCents(spent)} spent${limit !== undefined ? ` of a ${formatCents(limit)} limit` : ""}`}
                >
                  <div className={`bar-fill${over ? " is-over" : ""}`} style={{ width: `${(spent / scale) * 100}%` }} />
                  {limit !== undefined ? <div className="bar-limit" style={{ left: `${(limit / scale) * 100}%` }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <form
        key={key}
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => setBudgetLimit(f), () => setKey((k) => k + 1));
        }}
      >
        <input name="category" className="input" list="cats-limit" placeholder="Category, e.g. Food" aria-label="Category" maxLength={40} required />
        <datalist id="cats-limit">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input name="limit" className="input" inputMode="decimal" placeholder="Monthly limit ($), 0 to remove" aria-label="Monthly limit in dollars" />
        <button type="submit" className="btn" disabled={pending}>
          Set limit
        </button>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}

function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const { pending, reply, run } = useAction();
  return (
    <section className="card" aria-label="This month's money">
      <div className="card-head">
        <h2 className="card-title">This month</h2>
        <span className="card-meta">{transactions.length}</span>
      </div>
      {transactions.length === 0 ? (
        <p className="track-empty">Nothing added for this month.</p>
      ) : (
        <div className="track-list">
          {transactions.map((t) => (
            <div className="task" key={t.id}>
              <div className="task-body">
                <span className="task-title">{t.note || t.category}</span>
                <span className="task-sub">
                  {formatDayKey(t.occurred_on)} · {t.category}
                </span>
              </div>
              <span className="task-due">
                {t.type === "income" ? "+" : "−"}
                {formatCents(t.amount_cents)}
              </span>
              <button
                type="button"
                className="task-del"
                aria-label={`Delete ${t.note || t.category}, ${formatCents(t.amount_cents)}`}
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Delete this entry?")) run(() => deleteTransaction(t.id));
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <ReplyLine reply={reply} />
    </section>
  );
}

function Goals({ goals }: { goals: SavingsGoal[] }) {
  const { pending, reply, run } = useAction();
  const [key, setKey] = useState(0);
  return (
    <section className="card" aria-label="Savings goals">
      <h2 className="card-title">Savings goals</h2>
      {goals.length === 0 ? <p className="track-empty">No goals yet. What are you saving for?</p> : null}
      {goals.map((g) => {
        const pct = Math.min(100, Math.round((g.saved_cents / g.target_cents) * 100));
        return (
          <div className="goal" key={`${g.id}-${g.saved_cents}`}>
            <div className="bar-label">
              <span className="task-title">{g.name}</span>
              <span className="card-meta">
                {formatCents(g.saved_cents)} of {formatCents(g.target_cents)} · {pct}%
              </span>
            </div>
            <div className="bar-track" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <form
              className="track-fields"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = String(new FormData(e.currentTarget).get("amount") ?? "");
                run(() => addToGoal(g.id, amount));
              }}
            >
              <input
                name="amount"
                className="input"
                inputMode="decimal"
                placeholder={g.saved_cents >= g.target_cents ? "Reached!" : `Add $, e.g. ${centsToInput(Math.min(2000, g.target_cents - g.saved_cents))}`}
                aria-label={`Amount to add to ${g.name}`}
                required
              />
              <button type="submit" className="btn" disabled={pending}>
                Add to goal
              </button>
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Delete the goal “${g.name}”?`)) run(() => deleteGoal(g.id));
                }}
              >
                Delete
              </button>
            </form>
          </div>
        );
      })}
      <form
        key={key}
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => addGoal(f), () => setKey((k) => k + 1));
        }}
      >
        <input name="name" className="input" placeholder="New goal, e.g. Car" aria-label="Goal name" maxLength={60} required />
        <input name="target" className="input" inputMode="decimal" placeholder="Target ($)" aria-label="Target in dollars" required />
        <button type="submit" className="btn btn-dark" disabled={pending}>
          Add goal
        </button>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}
