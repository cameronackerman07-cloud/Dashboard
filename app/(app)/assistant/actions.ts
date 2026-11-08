"use server";

import { revalidatePath } from "next/cache";
import { AiError, aiJson, NO_KEY_MESSAGE } from "@/lib/ai";
import { hasUsableKey } from "@/lib/ai-keys";
import { sanitizeForAI } from "@/lib/agents/sanitize";
import { applyAddBlock, applyAddNote, applyAddTodo, applyCreateFlashcards, applyLogHabit, applyStudyPlan, undoAction } from "@/lib/assistant/apply";
import { ACTION_GUIDE, parseAction, parseAssistantReply, TINY_ACTIONS, type AssistantAction, type AssistantMode } from "@/lib/assistant/schema";
import { buildPlan, gatherFacts, savePlan } from "@/lib/budget-plan";
import { isBudgetPlan, normalizePlan, planTotals, type BudgetPlan } from "@/lib/budget-plan-core";
import { formatCents } from "@/lib/money";
import { ALL_ITEMS, COURSES } from "@/lib/nav";
import { draftPlan, type PlanDraft } from "@/lib/planner/generate";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKeyLong, mondayOf, timeKey } from "@/lib/time";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";
import { renameAgent } from "../ai-agents/actions";

// "Ask The BRIAN". The model only ever sees the student's own typed message
// (plus a short list of subject, agent, habit and page names), never text
// from Canvas, web pages or uploads, so nothing else can trigger an action.
// It replies in JSON; every action is re-checked against the allowlist in
// lib/assistant/schema.ts and shown as a preview before it changes anything.

export type Proposal = {
  key: string;
  action: AssistantAction;
  summary: string;
  tiny: boolean;
  plan?: PlanDraft;
  budget?: BudgetPlan;
  agentId?: string;
  href?: string;
  unavailable?: string;
};

export type Applied = { summary: string; ok: boolean; message: string; actionId: string | null };

export type AskReply = {
  ok: boolean;
  message: string;
  mode?: AssistantMode;
  reply?: string;
  proposals?: Proposal[];
  applied?: Applied[];
  model?: string;
};

type Turn = { role: "user" | "assistant"; text: string };

const PAGES = ALL_ITEMS.map((i) => i.slug).filter(Boolean).concat(["settings", "settings/ai-keys", "settings/notifications", "settings/iphone"]);

function pageLabel(slug: string): string {
  return ALL_ITEMS.find((i) => i.slug === slug)?.label ?? slug.replace(/^settings\/?/, "Settings ").trim();
}

async function prepare(userId: string, action: AssistantAction, agents: { id: string; name: string }[]): Promise<Proposal> {
  const key = Math.random().toString(36).slice(2, 10);
  const tiny = TINY_ACTIONS.has(action.type);
  switch (action.type) {
    case "create_study_plan": {
      const today = dayKey(Date.now());
      const week = action.week === "next" ? addDays(mondayOf(today), 7) : mondayOf(today);
      const plan = await draftPlan(userId, week, { focus: action.focus ?? undefined });
      if (!plan.blocks.length) return { key, action, tiny, summary: "Make a study plan", unavailable: "There's no free time left in that week to plan." };
      return { key, action, tiny, plan, summary: `I'll add ${plan.blocks.length} study blocks to your Study planner for the week of ${formatDayKeyLong(week)}.` };
    }
    case "add_study_block":
      return { key, action, tiny, summary: `Add a ${action.minutes}-minute ${action.subject} block on ${formatDayKeyLong(action.day)} at ${action.start}.` };
    case "add_todo":
      return { key, action, tiny, summary: `Add "${action.title}" to your to-do list${action.due_on ? `, due ${formatDayKeyLong(action.due_on)}` : ""}.` };
    case "add_note":
      return { key, action, tiny, summary: `Save a note called "${action.title}".` };
    case "create_flashcards":
      return { key, action, tiny, summary: `Make ${action.cards.length} ${action.subject} flashcards${action.topic ? ` on ${action.topic}` : ""}.` };
    case "log_habit":
      return { key, action, tiny, summary: `Tick "${action.habit}" for today.` };
    case "create_budget_plan": {
      const supabase = await createClient();
      const week = mondayOf(dayKey(Date.now()));
      const facts = await gatherFacts(supabase, userId, week);
      const budget = await buildPlan(userId, facts, action.note ? [{ q: "Anything to plan for this week?", a: action.note }] : []);
      const t = planTotals(budget);
      return {
        key,
        action,
        tiny,
        budget,
        summary: `I'll save a budget plan for this week: about ${formatCents(budget.income.cents)} in, ${formatCents(t.spend)} flexible spending, ${formatCents(budget.savingsCents)} to savings.`,
      };
    }
    case "research_topic":
      return { key, action, tiny, summary: `Research "${action.topic}"`, unavailable: "Research isn't ready yet. It's coming with the Coach agent soon." };
    case "rename_agent":
    case "run_agent": {
      const want = action.agent.toLowerCase();
      const agent = agents.find((a) => a.name.toLowerCase() === want) ?? agents.find((a) => a.name.toLowerCase().includes(want));
      if (!agent) return { key, action, tiny, summary: action.type === "rename_agent" ? "Rename an agent" : "Run an agent", unavailable: `I couldn't find an agent called "${action.agent}".` };
      return action.type === "rename_agent"
        ? { key, action, tiny, agentId: agent.id, summary: `Rename ${agent.name} to ${action.new_name}.` }
        : { key, action, tiny, agentId: agent.id, summary: `Run ${agent.name} now.` };
    }
    case "open_page":
      return { key, action, tiny, href: `/${action.page}`, summary: `Open ${pageLabel(action.page)}.` };
  }
}

export async function applyProposal(p: Proposal): Promise<Applied> {
  const summary = String(p?.summary ?? "").slice(0, 300);
  if (!(await currentUserId())) return { summary, ...SIGNED_OUT, actionId: null };
  const action = parseAction(p?.action, PAGES);
  if (!action) return { summary, ok: false, message: "That action isn't allowed.", actionId: null };
  let res: { ok: boolean; message: string; actionId?: string | null };
  switch (action.type) {
    case "create_study_plan":
      if (!p.plan) return { summary, ok: false, message: "That plan is missing. Ask again.", actionId: null };
      res = await applyStudyPlan({ weekStart: p.plan.weekStart, title: String(p.plan.title ?? ""), rationale: String(p.plan.rationale ?? ""), blocks: p.plan.blocks, byAI: !!p.plan.byAI });
      break;
    case "add_study_block":
      res = await applyAddBlock(action);
      break;
    case "add_todo":
      res = await applyAddTodo(action);
      break;
    case "add_note":
      res = await applyAddNote(action);
      break;
    case "create_flashcards":
      res = await applyCreateFlashcards(action);
      break;
    case "log_habit":
      res = await applyLogHabit(action);
      break;
    case "create_budget_plan":
      res = await applyBudgetPlan(p.budget);
      break;
    case "rename_agent":
      if (!isUuid(p.agentId)) return { summary, ...SAVE_FAILED, actionId: null };
      res = await renameAgent(p.agentId, action.new_name);
      break;
    default:
      // run_agent and open_page happen in the browser; the rest aren't ready yet.
      return { summary, ok: false, message: "That can't be done from here yet.", actionId: null };
  }
  revalidatePath("/planner");
  revalidatePath("/");
  return { summary, ok: res.ok, message: res.message, actionId: res.actionId ?? null };
}

async function applyBudgetPlan(budget: unknown): Promise<{ ok: boolean; message: string; actionId?: string | null }> {
  const userId = await currentUserId();
  if (!userId || !isBudgetPlan(budget)) return { ok: false, message: "That plan is missing. Ask again." };
  const supabase = await createClient();
  const week = mondayOf(dayKey(Date.now()));
  // Recompute from the facts rather than trusting numbers sent back from the browser.
  const facts = await gatherFacts(supabase, userId, week);
  const plan =
    normalizePlan(
      {
        fixed: budget.fixed.map((f) => ({ label: f.label, amount: f.cents / 100 })),
        allowance: budget.allowance.map((a) => ({ category: a.category, amount: a.cents / 100 })),
        buffer: budget.bufferCents / 100,
        savings: budget.savingsCents / 100,
        tips: budget.tips,
      },
      facts,
      budget.byAI,
    ) ?? budget;
  const id = await savePlan(supabase, userId, week, [], plan);
  if (!id) return { ok: false, message: "Couldn't save the plan." };
  const { data } = await supabase.from("assistant_actions").insert({ action: "create_budget_plan", summary: `Budget plan for the week of ${week}`, created_ids: { budget_plans: [id] } }).select("id").single();
  revalidatePath("/pay");
  return { ok: true, message: "Saved. See it on Pay & budget.", actionId: (data?.id as string) ?? null };
}

export async function undoAssistantAction(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const res = await undoAction(id);
  revalidatePath("/planner");
  revalidatePath("/");
  return res;
}

export async function setAskBeforeChanges(on: boolean): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ask_before_changes: !!on }, { onConflict: "user_id" });
  if (error) return SAVE_FAILED;
  return { ok: true, message: on ? "I'll ask before changing anything." : "Small things (one to-do, one habit tick) will now happen straight away." };
}

export async function askAssistant(message: string, history: Turn[], model?: string): Promise<AskReply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const text = String(message ?? "").trim().slice(0, 4000);
  if (!text) return { ok: false, message: "Type a message first." };
  if (!(await hasUsableKey(userId))) return { ok: false, message: NO_KEY_MESSAGE };

  const supabase = await createClient();
  const [{ data: agents }, { data: habits }, { data: settings }] = await Promise.all([
    supabase.from("agents").select("id, name").limit(40),
    supabase.from("habits").select("name").eq("archived", false).limit(30),
    supabase.from("user_settings").select("ask_before_changes").maybeSingle(),
  ]);
  const agentList = (agents ?? []) as { id: string; name: string }[];
  const now = Date.now();
  const today = dayKey(now);

  const past = (Array.isArray(history) ? history : [])
    .slice(-6)
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
    .map((t) => ({ role: t.role, content: sanitizeForAI(t.text.slice(0, 2000)) }));

  const system = `You are The BRIAN, the helper inside a NSW Year 11/12 student's study dashboard. Today is ${formatDayKeyLong(today)} (${today}), ${timeKey(now)} Sydney time.
Pick ONE mode from the student's message:
- "tutor": they want to learn or solve something. Give hints and guiding questions first. Only give a full worked solution if they clearly ask for it.
- "chat": anything else to talk about.
- "action": they asked you to DO something in the site. Only use actions they asked for.
${ACTION_GUIDE}
Their subjects: ${COURSES.join(", ")}. Agents: ${agentList.map((a) => a.name).join(", ") || "none"}. Habits: ${((habits ?? []) as { name: string }[]).map((h) => h.name).join(", ") || "none"}. Pages: ${PAGES.join(", ")}.
For a study plan just use create_study_plan; never work out times yourself. Never ask for or repeat passwords, keys, tokens or phone numbers.
Reply with ONLY JSON: {"mode": "tutor"|"chat"|"action", "reply": string (plain text, short paragraphs), "actions": [ ... ]}. "actions" is [] unless mode is "action".`;

  let parsed;
  let modelLabel = "";
  try {
    const { value, result } = await aiJson([...past, { role: "user", content: sanitizeForAI(text) }], (v) => parseAssistantReply(v, PAGES), {
      userId,
      model,
      system,
      purpose: "assistant",
      temperature: 0.3,
      budgetMs: 45_000,
    });
    parsed = value;
    modelLabel = result.modelLabel;
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "The AI didn't answer. Try again in a minute." };
  }

  let proposals: Proposal[] = [];
  try {
    proposals = await Promise.all(parsed.actions.map((a) => prepare(userId, a, agentList)));
  } catch {
    return { ok: true, message: "", mode: parsed.mode, reply: `${parsed.reply}\n\n(I couldn't get those changes ready. Try again.)`, proposals: [], model: modelLabel };
  }

  // "Ask before changing things" off: tiny, ready actions happen now.
  const askFirst = settings?.ask_before_changes !== false;
  const applied: Applied[] = [];
  if (!askFirst) {
    for (const p of proposals.filter((x) => x.tiny && !x.unavailable && x.action.type !== "open_page")) {
      applied.push(await applyProposal(p));
    }
    proposals = proposals.filter((x) => !(x.tiny && !x.unavailable && x.action.type !== "open_page"));
  }

  return {
    ok: true,
    message: parsed.dropped ? `${parsed.dropped} request${parsed.dropped === 1 ? " wasn't" : "s weren't"} allowed and ${parsed.dropped === 1 ? "was" : "were"} skipped.` : "",
    mode: parsed.mode,
    reply: parsed.reply,
    proposals,
    applied,
    model: modelLabel,
  };
}
