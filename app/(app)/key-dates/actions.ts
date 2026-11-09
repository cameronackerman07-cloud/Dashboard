"use server";

import { revalidatePath } from "next/cache";
import { getMySubjects } from "@/lib/my-subjects";
import { optionalSubject } from "@/lib/subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isDayKey, isTimeKey, sydneyInstant } from "@/lib/time";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

const KINDS = ["exam", "trial", "assessment", "term", "custom"] as const;

function refresh() {
  revalidatePath("/key-dates");
  revalidatePath("/");
  revalidatePath("/planner");
  revalidatePath("/coach");
}

export async function addKeyDate(f: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const title = String(f.get("title") ?? "").trim().slice(0, 120);
  const day = String(f.get("day") ?? "");
  const time = String(f.get("time") ?? "");
  const kind = KINDS.includes(f.get("kind") as (typeof KINDS)[number]) ? (f.get("kind") as string) : "custom";
  if (!title) return { ok: false, message: "Give it a name." };
  if (!isDayKey(day)) return { ok: false, message: "Pick a date." };
  const db = await createClient();
  const { error } = await db.from("key_dates").insert({
    title,
    starts_at: new Date(sydneyInstant(day, isTimeKey(time) ? time : "09:00")).toISOString(),
    kind,
    course: optionalSubject(f.get("course")),
    pinned: f.get("pinned") === "on",
    notes: String(f.get("notes") ?? "").trim().slice(0, 300) || null,
  });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Added ${title}.` };
}

// The "Add my exam dates" form: one date/time per course; blank ones are skipped.
export async function saveExamDates(f: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const db = await createClient();
  const rows: { title: string; starts_at: string; kind: string; course: string }[] = [];
  for (const [i, course] of (await getMySubjects()).entries()) {
    const day = String(f.get(`day-${i}`) ?? "");
    const time = String(f.get(`time-${i}`) ?? "");
    if (!day) continue;
    if (!isDayKey(day)) return { ok: false, message: `Check the date for ${course}.` };
    rows.push({ title: `${course} HSC exam`, starts_at: new Date(sydneyInstant(day, isTimeKey(time) ? time : "09:25")).toISOString(), kind: "exam", course });
  }
  if (!rows.length) return { ok: false, message: "Enter at least one exam date." };
  // Replace any earlier exam date for the same course.
  await db.from("key_dates").delete().eq("kind", "exam").in("course", rows.map((r) => r.course));
  const { error } = await db.from("key_dates").insert(rows);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Saved ${rows.length} exam date${rows.length === 1 ? "" : "s"}.` };
}

export async function deleteKeyDate(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db.from("key_dates").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted." };
}

export async function togglePin(id: string, pinned: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db.from("key_dates").update({ pinned: !!pinned }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: pinned ? "Pinned to Home." : "Unpinned." };
}
