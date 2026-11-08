import "server-only";
import { normKey } from "@/lib/flashcards";
import { cleanSubject, optionalSubject } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, isDayKey, sydneyInstant } from "@/lib/time";
import type { BlockKind, ValidBlock } from "@/lib/planner/validate";

// The only code that changes a user's data on their behalf. Each function
// re-checks its input, writes with the user's own (RLS) client, and records
// exactly which rows it made so Undo can remove them and nothing else.

type Created = Record<string, string[]>;

async function record(action: string, summary: string, created: Created): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("assistant_actions").insert({ action, summary: summary.slice(0, 300), created_ids: created }).select("id").single();
  return (data?.id as string) ?? null;
}

const KINDS: BlockKind[] = ["study", "flashcards", "practice", "rest"];

export function checkBlocks(blocks: unknown, weekStart: string): ValidBlock[] | null {
  if (!Array.isArray(blocks) || blocks.length > 40 || !isDayKey(weekStart)) return null;
  const from = sydneyInstant(weekStart);
  const to = sydneyInstant(addDays(weekStart, 7));
  const out: ValidBlock[] = [];
  for (const b of blocks) {
    const o = b as Record<string, unknown>;
    const s = new Date(String(o.starts_at)).getTime();
    const e = new Date(String(o.ends_at)).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 4 * 3_600_000 || s < from || e > to) return null;
    out.push({
      starts_at: new Date(s).toISOString(),
      ends_at: new Date(e).toISOString(),
      subject: String(o.subject ?? "Study").slice(0, 80),
      topic: typeof o.topic === "string" ? o.topic.slice(0, 120) : null,
      kind: KINDS.includes(o.kind as BlockKind) ? (o.kind as BlockKind) : "study",
    });
  }
  return out;
}

// Saves a plan, replacing the AI blocks of any earlier plan for that week
// (blocks you added yourself are never touched).
export async function applyStudyPlan(p: { weekStart: string; title: string; rationale: string; blocks: unknown; byAI: boolean }): Promise<{ ok: boolean; message: string; actionId?: string | null }> {
  const blocks = checkBlocks(p.blocks, p.weekStart);
  if (!blocks) return { ok: false, message: "That plan didn't check out. Make it again." };
  const supabase = await createClient();
  const { data: old } = await supabase.from("study_plans").select("id").eq("week_start", p.weekStart).eq("status", "active");
  const { data: plan, error } = await supabase
    .from("study_plans")
    .insert({ week_start: p.weekStart, title: p.title.slice(0, 80) || "Study plan", rationale: p.rationale.slice(0, 600), created_by: p.byAI ? "ai" : "manual" })
    .select("id")
    .single();
  if (error || !plan) return { ok: false, message: "Couldn't save the plan." };
  const { data: rows, error: e2 } = await supabase
    .from("study_blocks")
    .insert(blocks.map((b) => ({ ...b, plan_id: plan.id, source: p.byAI ? "ai" : "manual" })))
    .select("id");
  if (e2) {
    await supabase.from("study_plans").delete().eq("id", plan.id);
    return { ok: false, message: "Couldn't save the plan's blocks." };
  }
  const oldIds = ((old ?? []) as { id: string }[]).map((o) => o.id);
  if (oldIds.length) {
    await supabase.from("study_blocks").delete().in("plan_id", oldIds).eq("source", "ai");
    await supabase.from("study_plans").update({ status: "replaced" }).in("id", oldIds);
  }
  const actionId = await record("create_study_plan", `Added ${blocks.length} study blocks for the week of ${p.weekStart}`, {
    study_plans: [plan.id as string],
    study_blocks: ((rows ?? []) as { id: string }[]).map((r) => r.id),
  });
  return { ok: true, message: `Added ${blocks.length} study blocks to your Study planner.`, actionId };
}

export async function applyAddBlock(b: { day: string; start: string; minutes: number; subject: string; topic?: string | null; kind?: string }) {
  if (!isDayKey(b.day) || !/^\d{2}:\d{2}$/.test(b.start)) return { ok: false, message: "Pick a day and time." };
  const minutes = Math.min(240, Math.max(10, Math.round(Number(b.minutes) || 30)));
  const s = sydneyInstant(b.day, b.start);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_blocks")
    .insert({
      starts_at: new Date(s).toISOString(),
      ends_at: new Date(s + minutes * 60_000).toISOString(),
      subject: String(b.subject ?? "Study").slice(0, 80),
      topic: b.topic ? String(b.topic).slice(0, 120) : null,
      kind: KINDS.includes(b.kind as BlockKind) ? b.kind : "study",
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn't add the block." };
  const actionId = await record("add_study_block", `Added a study block on ${b.day} at ${b.start}`, { study_blocks: [data.id as string] });
  return { ok: true, message: "Study block added.", actionId };
}

export async function applyAddTodo(t: { title: string; due_on?: string | null; subject?: string | null; priority?: number }) {
  const title = String(t.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, message: "The to-do needs a title." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todos")
    .insert({ title, due_on: isDayKey(t.due_on) ? t.due_on : null, subject: optionalSubject(t.subject), priority: [1, 2, 3].includes(Number(t.priority)) ? Number(t.priority) : 2 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn't add the to-do." };
  const actionId = await record("add_todo", `Added to-do: ${title}`, { todos: [data.id as string] });
  return { ok: true, message: `Added "${title}" to your to-do list.`, actionId };
}

export async function applyAddNote(n: { title: string; body: string; subject?: string | null }) {
  const title = String(n.title ?? "").trim().slice(0, 200) || "Note";
  const supabase = await createClient();
  const { data, error } = await supabase.from("notes").insert({ title, body: String(n.body ?? "").slice(0, 20_000), subject: optionalSubject(n.subject) }).select("id").single();
  if (error || !data) return { ok: false, message: "Couldn't save the note." };
  const actionId = await record("add_note", `Saved note: ${title}`, { notes: [data.id as string] });
  return { ok: true, message: `Saved "${title}" to Notes.`, actionId };
}

export async function applyCreateFlashcards(c: { subject: string; module?: string | null; topic?: string | null; cards: { front: string; back: string }[] }) {
  const subject = cleanSubject(c.subject);
  const drafts = (Array.isArray(c.cards) ? c.cards : [])
    .slice(0, 30)
    .map((x) => ({ front: String(x.front ?? "").trim().slice(0, 500), back: String(x.back ?? "").trim().slice(0, 1500) }))
    .filter((x) => x.front && x.back)
    .map((x) => ({ ...x, key: normKey(x.front) }));
  if (!drafts.length) return { ok: false, message: "There were no cards to add." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("flashcards").select("norm_key").in("norm_key", drafts.map((d) => d.key).slice(0, 30));
  const have = new Set(((existing ?? []) as { norm_key: string }[]).map((r) => r.norm_key));
  const fresh = drafts.filter((d) => !have.has(d.key));
  if (!fresh.length) return { ok: true, message: "You already have all of those cards.", actionId: null };
  const { data, error } = await supabase
    .from("flashcards")
    .insert(fresh.map((d) => ({ subject, module: c.module?.slice(0, 120) ?? null, topic: c.topic?.slice(0, 120) ?? null, front: d.front, back: d.back, norm_key: d.key, due_at: new Date().toISOString() })))
    .select("id");
  if (error) return { ok: false, message: "Couldn't save the cards." };
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const actionId = await record("create_flashcards", `Made ${ids.length} ${subject} flashcards`, { flashcards: ids });
  return { ok: true, message: `Made ${ids.length} flashcards${drafts.length > fresh.length ? ` (${drafts.length - fresh.length} skipped as duplicates)` : ""}.`, actionId };
}

export async function applyLogHabit(h: { habit: string }) {
  const name = String(h.habit ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { data: habits } = await supabase.from("habits").select("id, name").eq("archived", false);
  const list = (habits ?? []) as { id: string; name: string }[];
  const habit = list.find((x) => x.name.toLowerCase() === name) ?? list.find((x) => name && x.name.toLowerCase().includes(name));
  if (!habit) return { ok: false, message: "I couldn't find that habit." };
  const { data, error } = await supabase.from("habit_logs").insert({ habit_id: habit.id, day: dayKey(Date.now()) }).select("id").single();
  if (error) return error.code === "23505" ? { ok: true, message: `${habit.name} was already ticked today.`, actionId: null } : { ok: false, message: "Couldn't log it." };
  const actionId = await record("log_habit", `Ticked ${habit.name}`, { habit_logs: [data!.id as string] });
  return { ok: true, message: `Ticked ${habit.name} for today.`, actionId };
}

// Removes exactly the rows an action made.
const UNDO_TABLES = new Set(["study_plans", "study_blocks", "todos", "notes", "flashcards", "habit_logs", "budget_plans", "study_guides"]);
export async function undoAction(id: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("assistant_actions").select("created_ids, undone_at, summary").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Nothing to undo." };
  if (data.undone_at) return { ok: true, message: "Already undone." };
  const created = (data.created_ids ?? {}) as Created;
  // Children before parents.
  for (const table of ["study_blocks", "habit_logs", "flashcards", "todos", "notes", "study_plans", "budget_plans", "study_guides"]) {
    const ids = (created[table] ?? []).filter((x) => typeof x === "string").slice(0, 200);
    if (ids.length && UNDO_TABLES.has(table)) await supabase.from(table).delete().in("id", ids);
  }
  await supabase.from("assistant_actions").update({ undone_at: new Date().toISOString() }).eq("id", id);
  return { ok: true, message: `Undone: ${data.summary}` };
}
