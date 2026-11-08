"use server";

import { revalidatePath } from "next/cache";
import { aiErrorMessage, aiJson } from "@/lib/ai";
import { hasUsableKey } from "@/lib/ai-keys";
import { sanitizeForAI } from "@/lib/agents/sanitize";
import { normKey } from "@/lib/flashcards";
import { pastPaperLinks } from "@/lib/hsc";
import { COURSES } from "@/lib/nav";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isDayKey } from "@/lib/time";
import { isUuid, optionalText, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// RLS keeps every row (assessments, guides, the coach's settings) to the signed-in user.

const NOT_READY: Reply = { ok: false, message: "Coach tables aren't set up yet. Run supabase/agents.sql in Supabase first." };

function num(v: FormDataEntryValue | null, min: number, max: number): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[%\s]/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : NaN;
}

export async function addAssessment(form: FormData): Promise<Reply> {
  const course = text(form.get("course"), 80);
  const task = text(form.get("task"), 120);
  const date = String(form.get("date") ?? "");
  const weighting = num(form.get("weighting"), 0, 100);
  const mark = num(form.get("mark"), 0, 1000);
  const max = num(form.get("max_mark"), 0.01, 1000);
  if (!course || !task) return { ok: false, message: "Pick a course and name the task." };
  if (date && !isDayKey(date)) return { ok: false, message: "Pick a valid date." };
  if ([weighting, mark, max].some((n) => Number.isNaN(n))) return { ok: false, message: "Weighting is 0–100, and marks are numbers like 17 out of 20." };
  if (mark != null && (max == null || mark > max)) return { ok: false, message: "Enter the mark out of a maximum, like 17 out of 20." };
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").insert({
    course,
    task,
    date: date || null,
    weighting,
    mark,
    max_mark: max,
    rank: optionalText(form.get("rank"), 40),
    notes: optionalText(form.get("notes"), 1000),
  });
  if (error) return error.code === "42P01" ? NOT_READY : SAVE_FAILED;
  revalidatePath("/coach");
  return { ok: true, message: `Added ${task}.` };
}

export async function setMark(id: string, form: FormData): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const mark = num(form.get("mark"), 0, 1000);
  const max = num(form.get("max_mark"), 0.01, 1000);
  if (mark == null || max == null || Number.isNaN(mark) || Number.isNaN(max) || mark > max) return { ok: false, message: "Enter the mark out of a maximum, like 17 out of 20." };
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").update({ mark, max_mark: max, rank: optionalText(form.get("rank"), 40) }).eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/coach");
  return { ok: true, message: "Mark saved." };
}

export async function deleteAssessment(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/coach");
  return { ok: true, message: "Deleted." };
}

// Target ATAR, target HSC mark per course, and key dates ("2027-08-02 Trials start", one per line).
export async function saveCoachSettings(form: FormData): Promise<Reply> {
  const atar = num(form.get("target_atar"), 30, 99.95);
  if (atar == null || Number.isNaN(atar)) return { ok: false, message: "Your target ATAR is a number between 30 and 99.95." };
  const targets: Record<string, number> = {};
  for (const c of COURSES) {
    const v = num(form.get(`target:${c}`), 1, 100);
    if (Number.isNaN(v)) return { ok: false, message: `The target for ${c} should be a mark out of 100.` };
    if (v != null) targets[c] = v;
  }
  const keyDates: { label: string; date: string }[] = [];
  for (const line of String(form.get("key_dates") ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 40)) {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(.{1,80})$/.exec(line);
    if (!m || !isDayKey(m[1])) return { ok: false, message: `Write each key date as "2027-08-02 Trials start". This line didn't work: ${line.slice(0, 40)}` };
    keyDates.push({ date: m[1], label: m[2] });
  }
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const supabase = await createClient();
  const { data: row, error: e } = await supabase.from("agents").select("id, config").eq("slug", "school_coach").maybeSingle();
  if (e) return NOT_READY;
  if (!row) return { ok: false, message: "Open AI Agents once so your coach is set up, then try again." };
  const { error } = await supabase
    .from("agents")
    .update({ config: { ...(row.config as Record<string, unknown>), target_atar: atar, targets, key_dates: keyDates } })
    .eq("id", row.id);
  if (error) return SAVE_FAILED;
  revalidatePath("/coach");
  return { ok: true, message: "Coach settings saved." };
}

export type Guide = {
  expects: string;
  approach: string;
  steps: string[];
  mistakes: string[];
  cards: { front: string; back: string }[];
};

function parseGuide(v: unknown): Guide | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const list = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x.map((s) => str(s, max)).filter(Boolean).slice(0, n) : []);
  const cards = Array.isArray(g.cards)
    ? (g.cards as { front?: unknown; back?: unknown }[]).map((c) => ({ front: str(c?.front, 300), back: str(c?.back, 600) })).filter((c) => c.front && c.back).slice(0, 12)
    : [];
  const guide = { expects: str(g.expects, 1200), approach: str(g.approach, 1200), steps: list(g.steps, 8, 300), mistakes: list(g.mistakes, 6, 300), cards };
  return guide.expects && guide.steps.length ? guide : null;
}

export async function makeGuide(course: string, topic: string, model?: string): Promise<Reply> {
  const c = text(course, 80);
  const t = text(topic, 120);
  if (!COURSES.includes(c) || !t) return { ok: false, message: "Pick one of your courses and type a topic." };
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!(await hasUsableKey(userId))) return { ok: false, message: "Add a free AI key in Settings → AI keys to make topic guides." };
  try {
    const { value } = await aiJson(
      [{ role: "user", content: sanitizeForAI(`Course: ${c} (NSW HSC, Stage 6)\nTopic: ${t}`) }],
      parseGuide,
      {
        userId,
        model,
        purpose: "topic_guide",
        temperature: 0.3,
        system:
          'You are a study coach for a NSW HSC student. For the given course and topic, reply with ONLY JSON: {"expects": what the NSW syllabus expects students to know and do for this topic (plain language), "approach": the best evidence-based way to learn it (retrieval practice, spacing, interleaving, worked examples), "steps": a 5-7 step practice sequence from concept → worked examples → flashcards → timed questions → marking against NESA-style guidelines, "mistakes": 3-5 common mistakes, "cards": 6-10 flashcards [{"front","back"}]}. This comes from general knowledge, so be accurate and don\'t quote syllabus codes or exam statistics you are unsure of. Never copy past exam questions.',
      },
    );
    const supabase = await createClient();
    const guide = { ...value, links: pastPaperLinks(c).slice(0, 1), verify: true };
    const { error } = await supabase.from("study_guides").insert({ course: c, topic: t, guide });
    if (error) return error.code === "42P01" ? NOT_READY : SAVE_FAILED;
    revalidatePath("/coach");
    return { ok: true, message: `Guide for ${t} saved below.` };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}

export async function guideToFlashcards(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { data: row } = await supabase.from("study_guides").select("course, topic, guide").eq("id", id).maybeSingle();
  const cards = ((row?.guide as Guide | undefined)?.cards ?? []).filter((c) => c.front && c.back);
  if (!row || cards.length === 0) return { ok: false, message: "This guide has no flashcards to add." };
  const keys = cards.map((c) => normKey(c.front));
  const { data: existing } = await supabase.from("flashcards").select("norm_key").in("norm_key", keys);
  const have = new Set(((existing ?? []) as { norm_key: string | null }[]).map((r) => r.norm_key));
  const fresh = cards.filter((c, i) => !have.has(keys[i]));
  if (fresh.length === 0) return { ok: true, message: "You already have all of these cards." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("flashcards")
    .insert(fresh.map((c) => ({ subject: row.course, module: row.topic, topic: "Coach guide", front: c.front, back: c.back, norm_key: normKey(c.front), due_at: now })));
  if (error) return SAVE_FAILED;
  revalidatePath("/flashcards");
  return { ok: true, message: `Added ${fresh.length} flashcard${fresh.length === 1 ? "" : "s"} to ${row.course}.` };
}

export async function deleteGuide(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("study_guides").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/coach");
  return { ok: true, message: "Guide deleted." };
}
