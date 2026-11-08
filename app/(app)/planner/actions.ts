"use server";

import { revalidatePath } from "next/cache";
import { applyStudyPlan, undoAction } from "@/lib/assistant/apply";
import { draftPlan, type PlanDraft } from "@/lib/planner/generate";
import { BLOCK_KINDS, type BlockKind } from "@/lib/planner/validate";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isDayKey, isTimeKey, mondayOf, sydneyInstant } from "@/lib/time";
import { int, isUuid, optionalText, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// Study planner. Two kinds of block live in study_blocks:
//  - repeating blocks (day_of_week + start_min, the original planner), and
//  - dated blocks (starts_at/ends_at), added by hand or by a study plan.
// RLS keeps every row scoped to the signed-in user.

function refresh() {
  revalidatePath("/planner");
  revalidatePath("/calendar");
  revalidatePath("/");
}

// ---------- Repeating blocks (kept so older rows keep working) ----------

export async function addBlock(formData: FormData) {
  const day = Number(formData.get("day"));
  const time = String(formData.get("time") ?? "");
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!Number.isInteger(day) || day < 1 || day > 7 || !match) return;

  const startMin = Number(match[1]) * 60 + Number(match[2]);
  const duration = Number(formData.get("duration")) || 30;
  const subject = String(formData.get("subject") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  const supabase = await createClient();
  await supabase.from("study_blocks").insert({
    day_of_week: day,
    start_min: startMin,
    duration_min: duration,
    subject: subject || null,
    label: label || null,
  });

  refresh();
}

export async function deleteBlock(id: string) {
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("study_blocks").delete().eq("id", id);
  refresh();
}

// ---------- Dated blocks ----------

function blockFields(form: FormData) {
  const day = String(form.get("day") ?? "");
  const time = String(form.get("time") ?? "");
  if (!isDayKey(day) || !isTimeKey(time)) return null;
  const minutes = int(form.get("minutes"), 10, 240, 45);
  const kind = (BLOCK_KINDS as string[]).includes(String(form.get("kind"))) ? (String(form.get("kind")) as BlockKind) : "study";
  const start = sydneyInstant(day, time);
  return {
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + minutes * 60_000).toISOString(),
    subject: text(form.get("subject"), 80) || (kind === "rest" ? "Rest" : "Study"),
    topic: optionalText(form.get("topic"), 120),
    notes: optionalText(form.get("notes"), 500),
    kind,
  };
}

export async function addDatedBlock(form: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const f = blockFields(form);
  if (!f) return { ok: false, message: "Pick a day and a start time." };
  const supabase = await createClient();
  const { error } = await supabase.from("study_blocks").insert({ ...f, source: "manual" });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Block added." };
}

export async function updateDatedBlock(id: string, form: FormData): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const f = blockFields(form);
  if (!f) return { ok: false, message: "Pick a day and a start time." };
  const supabase = await createClient();
  const { error } = await supabase.from("study_blocks").update(f).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Block saved." };
}

export async function setBlockDone(id: string, done: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("study_blocks").update({ done: !!done }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: done ? "Nice work." : "Marked as not done." };
}

export async function deleteDatedBlock(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("study_blocks").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Block deleted." };
}

// ---------- Plans ----------

export type PreviewReply = Reply & { draft?: PlanDraft };

export async function previewWeekPlan(week: string, model?: string): Promise<PreviewReply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isDayKey(week)) return { ok: false, message: "That week doesn't look right." };
  try {
    const draft = await draftPlan(userId, mondayOf(week), { model });
    if (!draft.blocks.length) return { ok: false, message: "There's no free time left in that week to plan." };
    return { ok: true, message: `Here's a plan with ${draft.blocks.length} blocks. Nothing is saved until you press Apply.`, draft };
  } catch {
    return { ok: false, message: "Couldn't make a plan right now. Try again in a minute." };
  }
}

export type ApplyReply = Reply & { actionId?: string | null };

export async function applyWeekPlan(draft: PlanDraft): Promise<ApplyReply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const res = await applyStudyPlan({ weekStart: draft.weekStart, title: String(draft.title ?? ""), rationale: String(draft.rationale ?? ""), blocks: draft.blocks, byAI: !!draft.byAI });
  if (res.ok) refresh();
  return res;
}

export async function undoPlan(actionId: string): Promise<Reply> {
  if (!isUuid(actionId)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const res = await undoAction(actionId);
  refresh();
  return res;
}
