// Weekly budget plan: shapes, the facts the app already knows, and the checks
// that keep the AI's numbers honest. No server-only imports so tests can load it.
// General budgeting help only, not financial advice.

import { addDays } from "@/lib/time";

export type BudgetFacts = {
  weekStart: string;
  expectedIncomeCents: number;
  incomeBasis: string;
  avgWeeklyByCategory: Record<string, number>; // last 4 weeks of spending
  weeklyLimits: Record<string, number>;
  monthlyLimits: Record<string, number>;
  goals: { targetCents: number; savedCents: number }[];
};

export type BudgetQuestion = { text: string; options: string[] };
export type BudgetAnswer = { q: string; a: string };

export type BudgetPlan = {
  income: { cents: number; basis: string };
  fixed: { label: string; cents: number }[];
  allowance: { category: string; cents: number }[];
  byDay: { day: string; cents: number }[];
  bufferCents: number;
  savingsCents: number;
  tips: string[];
  note: string | null;
  byAI: boolean;
};

export const MAX_QUESTIONS = 5;
const MAX_ITEM_CENTS = 100_000; // $1,000 for any one line

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function dollarsToCents(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_ITEM_CENTS, Math.round(n * 100));
}

export function centsToDollars(c: number): number {
  return Math.round(c) / 100;
}

// What the AI is told: categories and amounts only (no names, merchants or notes).
export function factsForAI(f: BudgetFacts): string {
  const d = (c: number) => `$${centsToDollars(c).toFixed(2)}`;
  const lines = [
    `Week starting ${f.weekStart}.`,
    `Expected income: ${d(f.expectedIncomeCents)} (${f.incomeBasis}).`,
    `Average weekly spending (last 4 weeks): ${Object.entries(f.avgWeeklyByCategory).map(([k, v]) => `${k} ${d(v)}`).join(", ") || "nothing logged"}.`,
    `Weekly limits: ${Object.entries(f.weeklyLimits).map(([k, v]) => `${k} ${d(v)}`).join(", ") || "none"}.`,
    `Monthly limits: ${Object.entries(f.monthlyLimits).map(([k, v]) => `${k} ${d(v)}`).join(", ") || "none"}.`,
    `Savings goals: ${f.goals.map((g, i) => `goal ${i + 1}: ${d(g.savedCents)} of ${d(g.targetCents)}`).join("; ") || "none"}.`,
  ];
  return lines.join("\n");
}

export function parseQuestion(value: unknown): { done: true } | { done: false; question: BudgetQuestion } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.done === true || o.question === null) return { done: true };
  const q = o.question as Record<string, unknown> | undefined;
  const text = str(q?.text, 200);
  if (!text) return null;
  const options = (Array.isArray(q?.options) ? q!.options : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 5);
  return { done: false, question: { text, options } };
}

export function cleanAnswers(raw: unknown): BudgetAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_QUESTIONS)
    .map((x) => ({ q: str((x as BudgetAnswer)?.q, 200), a: str((x as BudgetAnswer)?.a, 200) }))
    .filter((x) => x.q);
}

function spreadByDay(weekStart: string, total: number): { day: string; cents: number }[] {
  const base = Math.floor(total / 7);
  let rest = total - base * 7;
  return Array.from({ length: 7 }, (_, i) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { day: addDays(weekStart, i), cents: base + extra };
  });
}

// Turns whatever the AI sent into a plan whose sums add up. Income always
// comes from the facts (never the AI). If the plan spends more than the
// expected income, savings go first, then the buffer, then the allowance shrinks.
export function normalizePlan(value: unknown, facts: BudgetFacts, byAI: boolean): BudgetPlan | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const fixed = (Array.isArray(o.fixed) ? o.fixed : [])
    .slice(0, 10)
    .map((x) => ({ label: str((x as Record<string, unknown>)?.label, 40), cents: dollarsToCents((x as Record<string, unknown>)?.amount) }))
    .filter((x) => x.label && x.cents > 0);
  const seen = new Set<string>();
  const allowance = (Array.isArray(o.allowance) ? o.allowance : [])
    .slice(0, 12)
    .map((x) => ({ category: str((x as Record<string, unknown>)?.category, 40), cents: dollarsToCents((x as Record<string, unknown>)?.amount) }))
    .filter((x) => x.category && x.cents > 0 && !seen.has(x.category.toLowerCase()) && seen.add(x.category.toLowerCase()));
  const tips = (Array.isArray(o.tips) ? o.tips : []).map((t) => str(t, 200)).filter(Boolean).slice(0, 5);
  if (!allowance.length && !fixed.length) return null;

  let buffer = dollarsToCents(o.buffer);
  let savings = dollarsToCents(o.savings);
  const income = facts.expectedIncomeCents;
  const notes: string[] = [];
  const fixedTotal = fixed.reduce((a, x) => a + x.cents, 0);
  let allowTotal = allowance.reduce((a, x) => a + x.cents, 0);

  if (income > 0) {
    let over = fixedTotal + allowTotal + buffer + savings - income;
    if (over > 0) {
      const cut = Math.min(savings, over);
      savings -= cut;
      over -= cut;
    }
    if (over > 0) {
      const cut = Math.min(buffer, over);
      buffer -= cut;
      over -= cut;
    }
    if (over > 0 && allowTotal > 0) {
      const target = Math.max(0, allowTotal - over);
      const scale = target / allowTotal;
      for (const a of allowance) a.cents = Math.floor(a.cents * scale);
      allowTotal = allowance.reduce((s, x) => s + x.cents, 0);
      notes.push("The suggested spending was more than your expected income, so it was trimmed to fit.");
    }
    if (fixedTotal > income) notes.push("Your fixed costs are more than this week's expected income, so you'll be dipping into savings.");
  } else {
    savings = 0;
    notes.push("No income is expected this week, so this plan spends from money you already have.");
  }

  return {
    income: { cents: income, basis: facts.incomeBasis },
    fixed,
    allowance: allowance.filter((a) => a.cents > 0),
    byDay: spreadByDay(facts.weekStart, allowTotal),
    bufferCents: buffer,
    savingsCents: savings,
    tips: tips.length ? tips : defaultTips(),
    note: notes.join(" ") || null,
    byAI,
  };
}

function defaultTips(): string[] {
  return [
    "Take lunch from home on at least two school days.",
    "Check subscriptions you don't use and cancel one.",
    "Move the savings amount as soon as you're paid, not at the end of the week.",
  ];
}

// No AI: last month's habits, a 10% buffer and 20% of what's left to savings.
export function codePlan(facts: BudgetFacts): BudgetPlan {
  const avg = Object.entries(facts.avgWeeklyByCategory).filter(([, c]) => c > 0);
  const allowance = (avg.length ? avg : [["Food", 4000], ["Transport", 2000], ["Entertainment", 2000]] as [string, number][])
    .map(([category, cents]) => ({ category, amount: centsToDollars(facts.weeklyLimits[category] ?? cents) }));
  const allowCents = allowance.reduce((a, x) => a + Math.round(x.amount * 100), 0);
  const buffer = Math.round(facts.expectedIncomeCents * 0.1);
  const savings = Math.max(0, Math.round((facts.expectedIncomeCents - allowCents - buffer) * 0.2));
  return normalizePlan({ fixed: [], allowance, buffer: centsToDollars(buffer), savings: centsToDollars(savings), tips: defaultTips() }, facts, false)!;
}

export function planTotals(p: BudgetPlan): { spend: number; fixed: number; out: number } {
  const fixed = p.fixed.reduce((a, x) => a + x.cents, 0);
  const spend = p.allowance.reduce((a, x) => a + x.cents, 0);
  return { spend, fixed, out: fixed + spend + p.bufferCents + p.savingsCents };
}

// Re-checks a stored or client-sent plan before it's used.
export function isBudgetPlan(v: unknown): v is BudgetPlan {
  if (!v || typeof v !== "object") return false;
  const p = v as BudgetPlan;
  return !!p.income && Number.isFinite(p.income.cents) && Array.isArray(p.allowance) && Array.isArray(p.fixed) && Array.isArray(p.byDay) && Array.isArray(p.tips);
}
