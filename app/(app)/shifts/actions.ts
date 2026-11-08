"use server";

import { revalidatePath } from "next/cache";
import { parseDollars } from "@/lib/money";
import { isJobKind } from "@/lib/shifts";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, isDayKey, isTimeKey, sydneyInstant } from "@/lib/time";
import { int, isUuid, optionalText, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// RLS keeps every row scoped to the signed-in user; the database also refuses a
// shift that points at someone else's job.

function refresh() {
  revalidatePath("/shifts");
  revalidatePath("/pay");
  revalidatePath("/");
}

export async function addJob(form: FormData): Promise<Reply> {
  const name = text(form.get("name"), 60);
  const rate = parseDollars(form.get("rate"), { allowZero: true });
  const kind = form.get("kind");
  if (!name) return { ok: false, message: "Give the job a name." };
  if (rate === null) return { ok: false, message: "Enter the hourly rate in dollars, like 18.50 (or 0)." };
  if (!isJobKind(kind)) return { ok: false, message: "Pick what kind of job it is." };
  if (!(await currentUserId())) return SIGNED_OUT;

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").insert({ name, default_rate_cents: rate, kind });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Added ${name}.` };
}

export async function updateJob(id: string, form: FormData): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const name = text(form.get("name"), 60);
  const rate = parseDollars(form.get("rate"), { allowZero: true });
  const kind = form.get("kind");
  if (!name) return { ok: false, message: "Give the job a name." };
  if (rate === null) return { ok: false, message: "Enter the hourly rate in dollars, like 18.50 (or 0)." };
  if (!isJobKind(kind)) return { ok: false, message: "Pick what kind of job it is." };

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ name, default_rate_cents: rate, kind }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Job saved." };
}

// Deleting a job also deletes its shifts (the confirm box says so).
export async function deleteJob(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Job deleted." };
}

export type ShiftInput = {
  id?: string;
  jobId: string;
  day: string; // YYYY-MM-DD, Sydney
  start: string; // HH:MM
  end: string; // HH:MM; earlier than start means it finishes the next day
  breakMinutes: string;
  rate: string; // dollars, blank = the job's rate
  notes: string;
  repeatWeeks: string; // extra weeks to copy a new shift into
};

export async function saveShift(input: ShiftInput): Promise<Reply> {
  if (!isUuid(input.jobId)) return { ok: false, message: "Pick a job first (add one under Jobs if you need to)." };
  if (!isDayKey(input.day)) return { ok: false, message: "Pick the date." };
  if (!isTimeKey(input.start) || !isTimeKey(input.end)) return { ok: false, message: "Enter a start and finish time." };
  if (input.start === input.end) return { ok: false, message: "The finish time is the same as the start." };

  const breakMinutes = int(input.breakMinutes || 0, 0, 600, -1);
  if (breakMinutes < 0) return { ok: false, message: "The unpaid break should be minutes, like 30." };
  const rateText = String(input.rate ?? "").trim();
  const rate = rateText ? parseDollars(rateText, { allowZero: true }) : null;
  if (rateText && rate === null) return { ok: false, message: "The rate should be dollars, like 21.50, or left blank." };
  const repeat = input.id ? 0 : int(input.repeatWeeks || 0, 0, 26, 0);
  const notes = optionalText(input.notes, 300);
  if (!(await currentUserId())) return SIGNED_OUT;

  const overnight = input.end < input.start;
  const rows = Array.from({ length: repeat + 1 }, (_, week) => {
    const day = addDays(input.day, week * 7);
    const startsAt = sydneyInstant(day, input.start);
    const endsAt = sydneyInstant(overnight ? addDays(day, 1) : day, input.end);
    return {
      job_id: input.jobId,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      unpaid_break_minutes: breakMinutes,
      rate_override_cents: rate,
      notes,
    };
  });

  const length = (new Date(rows[0].ends_at).getTime() - new Date(rows[0].starts_at).getTime()) / 60_000;
  if (breakMinutes >= length) return { ok: false, message: "The break is longer than the shift." };

  const supabase = await createClient();
  if (input.id) {
    if (!isUuid(input.id)) return SAVE_FAILED;
    const { error } = await supabase
      .from("shifts")
      .update({ ...rows[0], updated_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) return SAVE_FAILED;
    refresh();
    return { ok: true, message: "Shift updated." };
  }

  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: rows.length === 1 ? "Shift added." : `Added ${rows.length} shifts, one a week.` };
}

export async function deleteShift(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Shift deleted." };
}
