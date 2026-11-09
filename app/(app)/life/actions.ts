"use server";

import { revalidatePath } from "next/cache";
import { record } from "@/lib/assistant/apply";
import { CATEGORIES, DEFAULT_PREFS, parseQuickAdd, type LifeCategory } from "@/lib/life";
import { advise, CLOSING, draftFrom, type Advice } from "@/lib/life/advisor";
import type { Option } from "@/lib/life/evaluate";
import { soundsDistressed, SUPPORT_MESSAGE } from "@/lib/life/support";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, dayKey, isDayKey, isTimeKey, sydneyInstant, weekdayOfKey } from "@/lib/time";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

const CATS = CATEGORIES.map((c) => c.value);
const FLEX = ["fixed", "movable", "optional"];
const ENERGY = ["low", "medium", "high"];

function refresh() {
  revalidatePath("/life");
  revalidatePath("/planner");
  revalidatePath("/");
}

const num = (v: FormDataEntryValue | null, min: number, max: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

// Add or edit a plan. One-off: date + start + finish. Repeating: weekdays + times.
export async function saveLifeItem(f: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const id = String(f.get("id") ?? "");
  const title = String(f.get("title") ?? "").trim().slice(0, 120);
  if (!title) return { ok: false, message: "Give it a name." };
  const recurring = f.get("kind") === "recurring";
  const start = String(f.get("start") ?? "");
  const end = String(f.get("end") ?? "");
  if (!isTimeKey(start) || !isTimeKey(end)) return { ok: false, message: "Pick a start and finish time." };
  const base = {
    title,
    category: CATS.includes(f.get("category") as LifeCategory) ? f.get("category") : "other",
    travel_before_min: num(f.get("travel_before"), 0, 600, 0),
    travel_after_min: num(f.get("travel_after"), 0, 600, 0),
    importance: num(f.get("importance"), 1, 5, 3),
    flexibility: FLEX.includes(String(f.get("flexibility"))) ? f.get("flexibility") : "movable",
    energy: ENERGY.includes(String(f.get("energy"))) ? f.get("energy") : "medium",
    notes: String(f.get("notes") ?? "").trim().slice(0, 500) || null,
    updated_at: new Date().toISOString(),
  };
  let row: Record<string, unknown>;
  if (recurring) {
    const days = f.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
    if (!days.length) return { ok: false, message: "Tick at least one day." };
    const until = String(f.get("until") ?? "");
    row = { ...base, kind: "recurring", starts_at: null, ends_at: null, recurrence: { days: [...new Set(days)].sort(), start, end, until: isDayKey(until) ? until : null } };
  } else {
    const day = String(f.get("day") ?? "");
    if (!isDayKey(day)) return { ok: false, message: "Pick a date." };
    const s = sydneyInstant(day, start);
    const e = end > start ? sydneyInstant(day, end) : sydneyInstant(addDays(day, 1), end);
    row = { ...base, kind: "one_off", starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), recurrence: null };
  }
  const db = await createClient();
  const { error } = isUuid(id) ? await db.from("life_items").update(row).eq("id", id) : await db.from("life_items").insert(row);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: isUuid(id) ? "Saved." : `Added ${title}.` };
}

// "Gym Tue and Thu 6pm for 1 hour"
export async function quickAddLife(text: string): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const q = parseQuickAdd(String(text ?? ""));
  if (!q) return { ok: false, message: 'Try something like "Gym Tue and Thu 6pm for 1 hour" or "Party Saturday 8pm to 11:30pm".' };
  const [h, m] = q.start.split(":").map(Number);
  const endMin = h * 60 + m + q.minutes;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const db = await createClient();
  let error;
  if (q.recurring) {
    ({ error } = await db.from("life_items").insert({ title: q.title, category: q.category, kind: "recurring", recurrence: { days: q.days, start: q.start, end, until: null } }));
  } else {
    // The next time that weekday comes round (today counts if it's still ahead).
    const today = dayKey(Date.now());
    let day = today;
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      if (weekdayOfKey(d) === q.days[0] && sydneyInstant(d, q.start) > Date.now()) {
        day = d;
        break;
      }
      if (i === 6) day = addDays(today, 7);
    }
    const s = sydneyInstant(day, q.start);
    ({ error } = await db.from("life_items").insert({ title: q.title, category: q.category, kind: "one_off", starts_at: new Date(s).toISOString(), ends_at: new Date(s + q.minutes * 60_000).toISOString() }));
  }
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Added ${q.title}${q.recurring ? " (every week)" : ""}. Edit it to add travel time or importance.` };
}

export async function setLifeStatus(id: string, status: "planned" | "confirmed" | "skipped" | "done"): Promise<Reply> {
  if (!isUuid(id) || !["planned", "confirmed", "skipped", "done"].includes(status)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db.from("life_items").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: status === "skipped" ? "Skipped." : "Saved." };
}

export async function deleteLifeItem(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db.from("life_items").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted." };
}

export async function saveLifePrefs(f: FormData): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const t = (k: string, d: string) => (isTimeKey(String(f.get(k))) ? String(f.get(k)) : d);
  const sleep = Math.min(11, Math.max(6, Number(f.get("sleep_hours")) || DEFAULT_PREFS.sleep_hours));
  const db = await createClient();
  const { error } = await db.from("life_preferences").upsert(
    {
      user_id: userId,
      sleep_hours: Math.round(sleep * 2) / 2,
      school_wake: t("school_wake", DEFAULT_PREFS.school_wake),
      weekend_lie_in_min: num(f.get("weekend_lie_in_min"), 0, 240, 60),
      wind_down_min: num(f.get("wind_down_min"), 0, 120, 45),
      exercise_per_week: num(f.get("exercise_per_week"), 0, 14, 3),
      social_hours_per_week: Math.min(40, Math.max(0, Number(f.get("social_hours_per_week")) || 0)),
      downtime_min_per_day: num(f.get("downtime_min_per_day"), 0, 300, 60),
      max_study_school_day_min: num(f.get("max_study_school_day_min"), 0, 600, 180),
      max_study_weekend_min: num(f.get("max_study_weekend_min"), 0, 720, 300),
      rest_blocks_per_week: num(f.get("rest_blocks_per_week"), 0, 7, 1),
      meal_times: { breakfast: t("breakfast", "07:00"), lunch: t("lunch", "12:30"), dinner: t("dinner", "18:30") },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: sleep < 8 ? "Saved. Teenagers do best on 8–10 hours, so the planner still protects at least 8 before big days." : "Saved." };
}

export async function resetLifePrefs(): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db.from("life_preferences").delete().eq("user_id", userId);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Back to the defaults." };
}

// ---------------------------------------------------------------------------
// "Should I go?"
// ---------------------------------------------------------------------------

export type CheckInput = { itemId?: string; what?: string; category?: LifeCategory; day?: string; start?: string; minutes?: number; travel?: number; want?: number };
export type CheckReply = (Reply & { ok: true; advice: Advice; closing: string; draft: DraftFields; support?: string }) | { ok: false; message: string; support?: string };
export type DraftFields = { itemId: string | null; title: string; category: LifeCategory; start: number; end: number; travelBefore: number; travelAfter: number; want: number };

export async function checkLife(input: CheckInput): Promise<CheckReply> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: SIGNED_OUT.message };
  const db = await createClient();
  // Checked in memory only; nothing about how you're feeling is saved.
  const support = input.what && soundsDistressed(input.what) ? SUPPORT_MESSAGE : undefined;
  let fields: DraftFields;
  if (isUuid(input.itemId)) {
    const { data: item } = await db.from("life_items").select("*").eq("id", input.itemId).maybeSingle();
    if (!item) return { ok: false, message: "That plan wasn't found." };
    let s = item.starts_at ? new Date(item.starts_at as string).getTime() : NaN;
    let e = item.ends_at ? new Date(item.ends_at as string).getTime() : NaN;
    if (item.kind === "recurring" && item.recurrence) {
      // The next time it happens.
      const r = item.recurrence as { days: number[]; start: string; end: string };
      const today = dayKey(Date.now());
      for (let i = 0; i < 8; i++) {
        const d = addDays(today, i);
        if (r.days.includes(weekdayOfKey(d)) && sydneyInstant(d, r.end) > Date.now()) {
          s = sydneyInstant(d, r.start);
          e = r.end > r.start ? sydneyInstant(d, r.end) : sydneyInstant(addDays(d, 1), r.end);
          break;
        }
      }
    }
    if (!Number.isFinite(s) || !Number.isFinite(e)) return { ok: false, message: "That plan has no time set." };
    fields = { itemId: item.id as string, title: item.title as string, category: item.category as LifeCategory, start: s, end: e, travelBefore: (item.travel_before_min as number) ?? 0, travelAfter: (item.travel_after_min as number) ?? 0, want: (item.importance as number) ?? 3 };
  } else {
    if (!isDayKey(input.day) || !isTimeKey(input.start)) return { ok: false, message: "Pick a day and a start time.", support };
    const minutes = Math.min(16 * 60, Math.max(15, Math.round(Number(input.minutes) || 120)));
    const s = sydneyInstant(input.day, input.start);
    const travel = Math.min(300, Math.max(0, Math.round(Number(input.travel) || 0)));
    fields = {
      itemId: null,
      title: String(input.what ?? "").trim().slice(0, 120) || "Plan",
      category: CATS.includes(input.category as LifeCategory) ? (input.category as LifeCategory) : "social",
      start: s,
      end: s + minutes * 60_000,
      travelBefore: travel,
      travelAfter: travel,
      want: Math.min(5, Math.max(1, Math.round(Number(input.want) || 3))),
    };
  }
  try {
    const advice = await advise(db, userId, draftFrom({ id: fields.itemId, ...fields }), { itemId: fields.itemId });
    return { ok: true, message: "", advice, closing: CLOSING, draft: fields, support };
  } catch {
    return { ok: false, message: "Couldn't check that right now. Try again.", support };
  }
}

export type DecisionPreview = { ok: boolean; message: string; lines: string[] };

function describe(choice: "go" | "alt" | "skip", option: Option | null, draft: DraftFields): string[] {
  const lines: string[] = [];
  if (choice === "skip") lines.push(draft.itemId ? `Mark "${draft.title}" as skipped.` : `Don't add "${draft.title}". Nothing changes.`);
  else lines.push(draft.itemId ? `Confirm "${draft.title}".` : `Add "${draft.title}" to My life.`);
  if (option?.kind === "leave_earlier") lines.push(`Finish at ${new Date(option.end).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" })}.`);
  if (option?.kind === "arrive_later") lines.push(`Start at ${new Date(option.start).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" })}.`);
  if (option?.kind === "swap") lines.push("Move the other plan to the free slot shown.");
  if (option?.kind === "move_study") lines.push("Move the study block that clashes to the free slot shown.");
  if (choice !== "skip") lines.push("Your study plan keeps working around it (the planner treats it as busy time).");
  return lines;
}

export async function previewDecision(choice: "go" | "alt" | "skip", draft: DraftFields, option: Option | null): Promise<DecisionPreview> {
  if (!(await currentUserId())) return { ...SIGNED_OUT, lines: [] };
  return { ok: true, message: "", lines: describe(choice, option, draft) };
}

// Apply a decision. Everything it changes is recorded so Undo can put it back.
export async function applyDecision(decisionId: string | null, choice: "go" | "alt" | "skip", draft: DraftFields, option: Option | null): Promise<Reply & { actionId?: string | null }> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!["go", "alt", "skip"].includes(choice)) return SAVE_FAILED;
  const db = await createClient();
  const created: string[] = [];
  const restore: { table: string; id: string; values: Record<string, unknown> }[] = [];
  const isoT = (ms: number) => new Date(ms).toISOString();
  let start = Number(draft.start);
  let end = Number(draft.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return SAVE_FAILED;
  if (choice === "alt" && option?.kind === "leave_earlier" && option.end > start && option.end < end) end = option.end;
  if (choice === "alt" && option?.kind === "arrive_later" && option.start > start && option.start < end) start = option.start;

  if (draft.itemId && isUuid(draft.itemId)) {
    const { data: old } = await db.from("life_items").select("starts_at, ends_at, status, kind").eq("id", draft.itemId).maybeSingle();
    if (!old) return SAVE_FAILED;
    restore.push({ table: "life_items", id: draft.itemId, values: { starts_at: old.starts_at, ends_at: old.ends_at, status: old.status } });
    const patch: Record<string, unknown> = { status: choice === "skip" ? "skipped" : "confirmed", updated_at: new Date().toISOString() };
    if (choice !== "skip" && old.kind === "one_off") Object.assign(patch, { starts_at: isoT(start), ends_at: isoT(end) });
    await db.from("life_items").update(patch).eq("id", draft.itemId);
  } else if (choice !== "skip") {
    const { data: row, error } = await db
      .from("life_items")
      .insert({ title: String(draft.title).slice(0, 120) || "Plan", category: CATS.includes(draft.category) ? draft.category : "other", kind: "one_off", starts_at: isoT(start), ends_at: isoT(end), travel_before_min: Math.max(0, Math.min(600, Number(draft.travelBefore) || 0)), travel_after_min: Math.max(0, Math.min(600, Number(draft.travelAfter) || 0)), importance: Math.min(5, Math.max(1, Number(draft.want) || 3)), status: "confirmed" })
      .select("id")
      .single();
    if (error || !row) return SAVE_FAILED;
    created.push(row.id as string);
  }

  if (choice === "alt" && option?.kind === "swap" && isUuid(option.itemId)) {
    const { data: other } = await db.from("life_items").select("starts_at, ends_at, status, kind").eq("id", option.itemId).maybeSingle();
    if (other && other.kind === "one_off") {
      restore.push({ table: "life_items", id: option.itemId, values: { starts_at: other.starts_at, ends_at: other.ends_at, status: other.status } });
      await db.from("life_items").update({ starts_at: isoT(option.to.start), ends_at: isoT(option.to.end), updated_at: new Date().toISOString() }).eq("id", option.itemId);
    }
  }
  if (choice === "alt" && option?.kind === "move_study" && isUuid(option.blockId)) {
    const { data: b } = await db.from("study_blocks").select("starts_at, ends_at").eq("id", option.blockId).maybeSingle();
    if (b) {
      restore.push({ table: "study_blocks", id: option.blockId, values: { starts_at: b.starts_at, ends_at: b.ends_at } });
      await db.from("study_blocks").update({ starts_at: isoT(option.to.start), ends_at: isoT(option.to.end) }).eq("id", option.blockId);
    }
  }
  if (isUuid(decisionId)) await db.from("schedule_decisions").update({ my_choice: choice === "alt" ? `alt:${option?.kind ?? ""}` : choice }).eq("id", decisionId);
  const changed = created.length || restore.length;
  const actionId = changed ? await record("life_decision", `${choice === "skip" ? "Skipped" : "Planned"} ${String(draft.title).slice(0, 80)}`, { life_items: created, _restore: restore }) : null;
  refresh();
  return { ok: true, message: choice === "skip" ? "Done. Skipped." : "Done. It's in My life, and the planner will work around it.", actionId };
}
