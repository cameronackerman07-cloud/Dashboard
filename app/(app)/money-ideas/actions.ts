"use server";

import { revalidatePath } from "next/cache";
import { aiErrorMessage, aiJson } from "@/lib/ai";
import { hasUsableKey } from "@/lib/ai-keys";
import { sanitizeForAI } from "@/lib/agents/sanitize";
import { parseDollars } from "@/lib/money";
import { CATALOGUE, estimate, parseAiIdeas, parseSituation, scoreIdea, slugKey, type Situation, type Transport } from "@/lib/money-ideas";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { dayKey, isDayKey } from "@/lib/time";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// RLS keeps ideas, logs and the agent's settings to the signed-in user.

const NOT_READY: Reply = { ok: false, message: "Money ideas aren't set up yet. Run supabase/agents.sql in Supabase first." };
const STATUSES = ["new", "interested", "trying", "done", "dismissed"];

function refresh() {
  revalidatePath("/money-ideas");
}

async function situation(): Promise<{ id: string; config: Record<string, unknown>; s: Situation } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("agents").select("id, config").eq("slug", "opportunities").maybeSingle();
  if (!data) return null;
  const config = (data.config ?? {}) as Record<string, unknown>;
  return { id: data.id as string, config, s: parseSituation(config.situation) };
}

// Builds (or re-scores) the list from the starter catalogue. No AI.
export async function buildList(): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const sit = await situation();
  const s = sit?.s ?? parseSituation({});
  const { data: existing, error: e } = await supabase.from("money_ideas").select("dedupe_key, status");
  if (e) return NOT_READY;
  const status = new Map(((existing ?? []) as { dedupe_key: string; status: string }[]).map((r) => [r.dedupe_key, r.status]));
  const rows = CATALOGUE.map((seed) => {
    const est = estimate(seed, s.hoursPerWeek);
    return {
      type: seed.type,
      title: seed.title,
      summary: seed.summary,
      effort: seed.effort,
      startup_cost_cents: seed.startupCents,
      hours_per_week: seed.hours,
      est_weekly_low_cents: est.low,
      est_weekly_high_cents: est.high,
      assumptions: est.assumptions,
      age_legal_notes: seed.ageLegal,
      first_steps: seed.firstSteps,
      links: seed.links,
      score: scoreIdea(seed, s, status.get(seed.key) ?? "new"),
      dedupe_key: seed.key,
      verify: false,
    };
  });
  const { error } = await supabase.from("money_ideas").upsert(rows, { onConflict: "user_id,dedupe_key" });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Your list is ranked for your situation." };
}

export async function setStatus(id: string, next: string): Promise<Reply> {
  if (!isUuid(id) || !STATUSES.includes(next)) return SAVE_FAILED;
  const supabase = await createClient();
  const { data, error } = await supabase.from("money_ideas").select("score, status").eq("id", id).maybeSingle();
  if (error || !data) return SAVE_FAILED;
  // Same nudges as the agent's scoring, so the order updates straight away.
  const bonus = (st: string) => (st === "interested" ? 10 : st === "trying" ? 15 : 0);
  const score = next === "dismissed" ? 0 : Math.max(0, Number(data.score) - bonus(data.status as string) + bonus(next));
  const { error: e } = await supabase.from("money_ideas").update({ status: next, score }).eq("id", id);
  if (e) return SAVE_FAILED;
  refresh();
  return { ok: true, message: next === "dismissed" ? "Hidden. You can bring it back from “Not for me”." : "Saved." };
}

export async function logIdea(id: string, form: FormData): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const date = String(form.get("date") ?? "") || dayKey(Date.now());
  const hours = Number(String(form.get("hours") ?? "0").trim() || 0);
  const earned = parseDollars(form.get("earned") ?? "0", { allowZero: true });
  if (!isDayKey(date)) return { ok: false, message: "Pick a valid date." };
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) return { ok: false, message: "Hours should be between 0 and 24." };
  if (earned === null) return { ok: false, message: "Enter what you earned in dollars, like 25 (or 0)." };
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { data: idea } = await supabase.from("money_ideas").select("title").eq("id", id).maybeSingle();
  if (!idea) return SAVE_FAILED;
  const { error } = await supabase.from("money_idea_log").insert({ idea_id: id, date, hours, earned_cents: earned });
  if (error) return SAVE_FAILED;
  if (form.get("income") === "on" && earned > 0) {
    await supabase.from("transactions").insert({ type: "income", amount_cents: earned, category: "Other", note: `Money idea: ${String(idea.title).slice(0, 80)}`, occurred_on: date });
    revalidatePath("/pay");
  }
  refresh();
  return { ok: true, message: "Logged." };
}

export async function saveSituation(form: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const sit = await situation();
  if (!sit) return { ok: false, message: "Open AI Agents once so your Money ideas agent is set up, then try again." };
  const budget = parseDollars(form.get("budget") ?? "0", { allowZero: true });
  const goal = parseDollars(form.get("goal") ?? "0", { allowZero: true });
  if (budget === null || goal === null) return { ok: false, message: "Enter amounts in dollars, like 50." };
  const next = parseSituation({
    ageBracket: String(form.get("age") ?? ""),
    region: String(form.get("region") ?? ""),
    hoursPerWeek: Number(form.get("hours") ?? 0),
    skills: String(form.get("skills") ?? "").split(","),
    transport: String(form.get("transport") ?? "") as Transport,
    startupBudgetCents: budget,
    weeklyGoalCents: goal,
  });
  const supabase = await createClient();
  const { error } = await supabase.from("agents").update({ config: { ...sit.config, situation: next } }).eq("id", sit.id);
  if (error) return SAVE_FAILED;
  return buildList();
}

// "Find more like this": one AI call for up to 3 similar ideas, labelled "verify".
export async function findMore(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!(await hasUsableKey(userId))) return { ok: false, message: "Add a free AI key in Settings → AI keys to find more ideas." };
  const supabase = await createClient();
  const { data: idea } = await supabase.from("money_ideas").select("title, summary, type").eq("id", id).maybeSingle();
  if (!idea) return SAVE_FAILED;
  const s = (await situation())?.s ?? parseSituation({});
  try {
    const { value } = await aiJson(
      [{ role: "user", content: sanitizeForAI(`Similar to: ${idea.title} — ${idea.summary}\nAge: ${s.ageBracket}\nHours a week: ${s.hoursPerWeek}\nSkills: ${s.skills.join(", ") || "none listed"}`) }],
      parseAiIdeas,
      {
        userId,
        purpose: "money_ideas",
        temperature: 0.5,
        system:
          'Suggest up to 3 realistic, safe, legal earning ideas for an Australian secondary student, similar to the one given. Reply with ONLY JSON {"ideas":[{"type":"job|apprenticeship|gig|service|tutoring|selling|freelance|scholarship|extras","title","summary","effort":1-5,"hours":1-10,"firstSteps":[...]}]}. No gambling, crypto, MLM, pay-to-join, upfront fees or bank-detail requests. Don\'t quote pay rates.',
      },
    );
    if (value.length === 0) return { ok: false, message: "No new safe ideas came back. Try again later." };
    const rows = value.map((i) => ({
      type: i.type,
      title: i.title,
      summary: i.summary,
      effort: i.effort,
      hours_per_week: i.hours,
      assumptions: "Varies — idea from the AI's general knowledge. Check rates and rules before acting.",
      age_legal_notes: "Idea — verify before acting: check age limits, licences and checks you might need.",
      first_steps: i.firstSteps,
      score: Math.max(0, 40 - i.effort * 4),
      dedupe_key: slugKey(i.title),
      verify: true,
    }));
    const { error } = await supabase.from("money_ideas").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    if (error) return SAVE_FAILED;
    refresh();
    return { ok: true, message: `Added ${rows.length} idea${rows.length === 1 ? "" : "s"} to check.` };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}
