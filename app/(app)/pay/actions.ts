"use server";

import { revalidatePath } from "next/cache";
import { cleanCategory, SHIFT_PAY_CATEGORY } from "@/lib/budget";
import { formatCents, parseDollars } from "@/lib/money";
import { shiftPayNote, totals, type Job, type Shift } from "@/lib/shifts";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, isDayKey, mondayOf, sydneyInstant } from "@/lib/time";
import { isUuid, optionalText, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// RLS keeps every row scoped to the signed-in user.

function refresh() {
  revalidatePath("/pay");
  revalidatePath("/shifts");
}

export async function addTransaction(form: FormData): Promise<Reply> {
  const type = form.get("type");
  const amount = parseDollars(form.get("amount"));
  const day = form.get("day");
  if (type !== "income" && type !== "expense") return { ok: false, message: "Pick income or spending." };
  if (amount === null) return { ok: false, message: "Enter an amount in dollars, like 12.50." };
  if (!isDayKey(day)) return { ok: false, message: "Pick the date." };
  if (!(await currentUserId())) return SIGNED_OUT;

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    type,
    amount_cents: amount,
    category: cleanCategory(form.get("category")),
    note: optionalText(form.get("note"), 200),
    occurred_on: day,
  });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `${type === "income" ? "Income" : "Spending"} of ${formatCents(amount)} added.` };
}

export async function deleteTransaction(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted." };
}

// A monthly limit for a spending category. 0 or blank removes the limit.
export async function setBudgetLimit(form: FormData): Promise<Reply> {
  const category = cleanCategory(form.get("category"));
  const raw = String(form.get("limit") ?? "").trim();
  const limit = raw ? parseDollars(raw, { allowZero: true }) : 0;
  if (limit === null) return { ok: false, message: "Enter the limit in dollars, like 100." };
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;

  const supabase = await createClient();
  if (limit === 0) {
    const { error } = await supabase.from("budget_limits").delete().eq("category", category);
    if (error) return SAVE_FAILED;
    refresh();
    return { ok: true, message: `Removed the limit for ${category}.` };
  }
  const { error } = await supabase
    .from("budget_limits")
    .upsert({ user_id: userId, category, monthly_limit_cents: limit }, { onConflict: "user_id,category" });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `${category}: ${formatCents(limit)} a month.` };
}

export async function addGoal(form: FormData): Promise<Reply> {
  const name = text(form.get("name"), 60);
  const target = parseDollars(form.get("target"));
  if (!name) return { ok: false, message: "Name the goal, like “New phone”." };
  if (target === null) return { ok: false, message: "Enter the target in dollars, like 500." };
  if (!(await currentUserId())) return SIGNED_OUT;

  const supabase = await createClient();
  const { error } = await supabase.from("savings_goals").insert({ name, target_cents: target });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Goal added: ${name}.` };
}

// Adds money to a goal (a negative amount, like -20, takes it back out).
export async function addToGoal(id: string, amountText: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const raw = String(amountText ?? "").trim();
  const negative = raw.startsWith("-");
  const amount = parseDollars(negative ? raw.slice(1) : raw);
  if (amount === null) return { ok: false, message: "Enter an amount in dollars, like 20 (or -20 to take some out)." };

  const supabase = await createClient();
  const { data: goal } = await supabase.from("savings_goals").select("saved_cents, name").eq("id", id).maybeSingle();
  if (!goal) return SAVE_FAILED;
  const saved = Math.max(0, (goal.saved_cents as number) + (negative ? -amount : amount));
  const { error } = await supabase.from("savings_goals").update({ saved_cents: saved }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `${goal.name}: ${formatCents(saved)} saved.` };
}

export async function deleteGoal(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Goal deleted." };
}

// Logs one week's estimated shift pay (Monday to Sunday) as an income
// transaction, once. Dated the Sunday, or today if the week isn't over yet.
export async function logShiftPay(mondayInput: string): Promise<Reply> {
  if (!isDayKey(mondayInput)) return SAVE_FAILED;
  const monday = mondayOf(mondayInput);
  const today = dayKey(Date.now());
  if (monday > today) return { ok: false, message: "That week hasn't started yet. Log it once you've worked it." };
  if (!(await currentUserId())) return SIGNED_OUT;

  const supabase = await createClient();
  const note = shiftPayNote(monday);
  const { data: existing } = await supabase.from("transactions").select("id").eq("note", note).limit(1);
  if ((existing ?? []).length > 0) return { ok: false, message: `Already logged: ${note}.` };

  const [{ data: jobs }, { data: shifts }] = await Promise.all([
    supabase.from("jobs").select("id, name, default_rate_cents, kind"),
    supabase
      .from("shifts")
      .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents, notes")
      .gte("starts_at", new Date(sydneyInstant(monday)).toISOString())
      .lt("starts_at", new Date(sydneyInstant(addDays(monday, 7))).toISOString()),
  ]);
  const { cents } = totals((shifts ?? []) as Shift[], (jobs ?? []) as Job[]);
  if (cents <= 0) return { ok: false, message: `No paid shifts in the week of ${formatDayKey(monday)}.` };

  const sunday = addDays(monday, 6);
  const { error } = await supabase.from("transactions").insert({
    type: "income",
    amount_cents: cents,
    category: SHIFT_PAY_CATEGORY,
    note,
    occurred_on: sunday < today ? sunday : today,
  });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Logged ${formatCents(cents)} of shift pay. It's an estimate before tax, so swap it for the real amount when you're paid.` };
}
