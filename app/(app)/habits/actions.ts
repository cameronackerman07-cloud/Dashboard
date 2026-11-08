"use server";

import { revalidatePath } from "next/cache";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { dayKey, daysBetween, isDayKey } from "@/lib/time";
import { isUuid, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// RLS keeps every row scoped to the signed-in user; a log can only point at
// one of your own habits.

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function addHabit(form: FormData): Promise<Reply> {
  const name = text(form.get("name"), 60);
  if (!name) return { ok: false, message: "Name the habit, like “Read 20 minutes”." };
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("habits").insert({ name });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Added ${name}.` };
}

export async function setArchived(id: string, archived: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("habits").update({ archived: !!archived }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: archived ? "Archived. Its history is kept." : "Back on your list." };
}

export async function deleteHabit(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted, with its history." };
}

// Ticks or unticks a habit for a day in the last two weeks (Sydney time).
export async function toggleHabit(habitId: string, day: string, done: boolean): Promise<boolean> {
  if (!isUuid(habitId) || !isDayKey(day)) return false;
  const age = daysBetween(day, dayKey(Date.now()));
  if (age < 0 || age > 13) return false;
  if (!(await currentUserId())) return false;

  const supabase = await createClient();
  if (done) {
    const { error } = await supabase.from("habit_logs").insert({ habit_id: habitId, day });
    // Already ticked (e.g. on another device) counts as success.
    if (error && error.code !== "23505") return false;
  } else {
    const { error } = await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("day", day);
    if (error) return false;
  }
  refresh();
  return true;
}
