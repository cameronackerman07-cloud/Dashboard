import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson } from "@/lib/ai";
import { hasUsableKey } from "@/lib/ai-keys";
import { sanitizeForAI } from "@/lib/agents/sanitize";
import { SHIFT_PAY_CATEGORY } from "@/lib/budget";
import { formatCents } from "@/lib/money";
import { formatHours, paidMinutes, shiftPayCents, shiftPayNote, type Job, type Shift } from "@/lib/shifts";
import { addDays, sydneyInstant } from "@/lib/time";
import {
  codePlan,
  factsForAI,
  MAX_QUESTIONS,
  normalizePlan,
  parseQuestion,
  type BudgetAnswer,
  type BudgetFacts,
  type BudgetPlan,
  type BudgetQuestion,
} from "./budget-plan-core";

// Works with the user's own RLS client (pages, assistant) or the service-role
// client (Siri, agents): every query also filters by user_id.

export async function gatherFacts(db: SupabaseClient, userId: string, weekStart: string): Promise<BudgetFacts> {
  const weekEnd = addDays(weekStart, 7);
  const fourWeeksAgo = addDays(weekStart, -28);
  const [{ data: jobs }, { data: shifts }, { data: tx }, { data: limits }, { data: goals }] = await Promise.all([
    db.from("jobs").select("id, name, default_rate_cents, kind").eq("user_id", userId),
    db
      .from("shifts")
      .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents, notes")
      .eq("user_id", userId)
      .gte("starts_at", new Date(sydneyInstant(weekStart)).toISOString())
      .lt("starts_at", new Date(sydneyInstant(weekEnd)).toISOString()),
    db.from("transactions").select("type, amount_cents, category, note, occurred_on").eq("user_id", userId).gte("occurred_on", fourWeeksAgo).lt("occurred_on", weekEnd).limit(2000),
    db.from("budget_limits").select("category, monthly_limit_cents, weekly_limit_cents").eq("user_id", userId),
    db.from("savings_goals").select("target_cents, saved_cents").eq("user_id", userId).limit(10),
  ]);

  const jobById = new Map(((jobs ?? []) as Job[]).map((j) => [j.id, j]));
  const shiftList = (shifts ?? []) as Shift[];
  const estimate = shiftList.reduce((a, s) => a + shiftPayCents(s, jobById.get(s.job_id)), 0);
  const minutes = shiftList.reduce((a, s) => a + paidMinutes(s), 0);
  const rows = (tx ?? []) as { type: string; amount_cents: number; category: string; note: string | null; occurred_on: string }[];
  const thisWeek = rows.filter((t) => t.occurred_on >= weekStart && t.type === "income");
  const loggedShift = thisWeek.filter((t) => t.note === shiftPayNote(weekStart) || t.category === SHIFT_PAY_CATEGORY).reduce((a, t) => a + t.amount_cents, 0);
  const otherIncome = thisWeek.filter((t) => !(t.note === shiftPayNote(weekStart) || t.category === SHIFT_PAY_CATEGORY)).reduce((a, t) => a + t.amount_cents, 0);
  const shiftPart = Math.max(estimate, loggedShift);
  const basis = [
    shiftList.length ? `${shiftList.length} shift${shiftList.length === 1 ? "" : "s"} (${formatHours(minutes)}) at your saved rates, before tax: about ${formatCents(estimate)}` : "no shifts entered for this week",
    loggedShift ? `${formatCents(loggedShift)} shift pay already logged` : null,
    otherIncome ? `${formatCents(otherIncome)} other income already logged` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const avg: Record<string, number> = {};
  for (const t of rows) if (t.type === "expense" && t.occurred_on < weekStart) avg[t.category] = (avg[t.category] ?? 0) + t.amount_cents;
  for (const k of Object.keys(avg)) avg[k] = Math.round(avg[k] / 4);

  const weeklyLimits: Record<string, number> = {};
  const monthlyLimits: Record<string, number> = {};
  for (const l of (limits ?? []) as { category: string; monthly_limit_cents: number | null; weekly_limit_cents: number | null }[]) {
    if (l.weekly_limit_cents != null) weeklyLimits[l.category] = l.weekly_limit_cents;
    if (l.monthly_limit_cents != null) monthlyLimits[l.category] = l.monthly_limit_cents;
  }

  return {
    weekStart,
    expectedIncomeCents: shiftPart + otherIncome,
    incomeBasis: basis,
    avgWeeklyByCategory: avg,
    weeklyLimits,
    monthlyLimits,
    goals: ((goals ?? []) as { target_cents: number; saved_cents: number }[]).map((g) => ({ targetCents: g.target_cents, savedCents: g.saved_cents })),
  };
}

const TOPICS = "transport and fuel, food and lunches, school costs, bills and subscriptions, planned outings, gifts, gear for work/refereeing/gigs, anything unusual";

function answersText(answers: BudgetAnswer[]): string {
  return answers.length ? answers.map((a, i) => `Q${i + 1}: ${a.q}\nA${i + 1}: ${a.a}`).join("\n") : "No answers yet.";
}

export async function nextQuestion(userId: string, facts: BudgetFacts, answers: BudgetAnswer[], model?: string): Promise<BudgetQuestion | null> {
  if (answers.length >= MAX_QUESTIONS || !(await hasUsableKey(userId))) return null;
  const { value } = await aiJson(
    [{ role: "user", content: sanitizeForAI(`${factsForAI(facts)}\n\nAnswers so far:\n${answersText(answers)}`) }],
    parseQuestion,
    {
      userId,
      model,
      purpose: "budget_question",
      temperature: 0.3,
      budgetMs: 25_000,
      system: `You help a NSW high-school student plan this week's budget. Ask ONE short follow-up question about what they need to budget for this week (${TOPICS}). Don't ask about anything the facts already show, and don't repeat a question. Offer 2-5 short multiple-choice options when you can. Ask at most ${MAX_QUESTIONS} questions in total; stop sooner once you know enough. Never ask for names, bank or account details. Reply with ONLY JSON: {"question": {"text": string, "options": [string]}} or {"done": true}.`,
    },
  );
  return value.done ? null : value.question;
}

export async function buildPlan(userId: string, facts: BudgetFacts, answers: BudgetAnswer[], model?: string): Promise<BudgetPlan> {
  if (!(await hasUsableKey(userId))) return codePlan(facts);
  try {
    const { value } = await aiJson(
      [{ role: "user", content: sanitizeForAI(`${factsForAI(facts)}\n\nThe student's answers:\n${answersText(answers)}`) }],
      (v) => normalizePlan(v, facts, true),
      {
        userId,
        model,
        purpose: "budget_plan",
        temperature: 0.3,
        budgetMs: 40_000,
        system: `You make a simple weekly budget for a NSW high-school student. This is general budgeting help, not financial advice. Use their answers and the facts. Amounts are in Australian dollars. Keep spending within expected income where possible, keep a small buffer, and suggest a realistic amount towards savings goals. Reply with ONLY JSON: {"fixed": [{"label": string, "amount": number}], "allowance": [{"category": string, "amount": number}], "buffer": number, "savings": number, "tips": [3-5 short practical tips]}. Fixed = costs that must be paid this week (bills, subscriptions, school costs). Allowance = flexible spending by category (Food, Transport, Entertainment, Gifts, ...).`,
      },
    );
    return value;
  } catch {
    return codePlan(facts);
  }
}

// Saves a plan as the week's active plan (earlier ones for that week are kept as "replaced").
export async function savePlan(db: SupabaseClient, userId: string, weekStart: string, answers: BudgetAnswer[], plan: BudgetPlan): Promise<string | null> {
  await db.from("budget_plans").update({ status: "replaced" }).eq("user_id", userId).eq("week_start", weekStart).eq("status", "active");
  const { data } = await db.from("budget_plans").insert({ user_id: userId, week_start: weekStart, answers, plan, status: "active" }).select("id").single();
  return (data?.id as string) ?? null;
}

export async function activePlan(db: SupabaseClient, userId: string, weekStart: string): Promise<{ id: string; plan: BudgetPlan } | null> {
  const { data } = await db
    .from("budget_plans")
    .select("id, plan")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, plan: data.plan as BudgetPlan } : null;
}
