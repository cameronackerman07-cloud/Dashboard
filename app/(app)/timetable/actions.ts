"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Weekly timetable: classes added by hand or pasted in from Atlantis or Sentral.
// RLS scopes every row to the signed-in user via the user_id default.

export async function addClass(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim();
  const day = Number(formData.get("day"));
  if (!subject || !Number.isInteger(day) || day < 1 || day > 7) return;

  const period = String(formData.get("period") ?? "").trim();
  const room = String(formData.get("room") ?? "").trim();
  const week = String(formData.get("week") ?? "all").trim();

  const supabase = await createClient();
  await supabase.from("timetable").insert({
    day_of_week: day,
    subject,
    period: period || null,
    room: room || null,
    week: week === "A" || week === "B" ? week : "all",
  });

  revalidatePath("/timetable");
}

export async function deleteClass(id: string) {
  const supabase = await createClient();
  await supabase.from("timetable").delete().eq("id", id);
  revalidatePath("/timetable");
}

export type ImportRow = { day: number; week: string; period: string | null; subject: string; room: string | null };

// Saves classes read from a pasted timetable. With `replace`, the classes already
// saved are removed, but only after the new ones are safely in.
export async function importClasses(rows: ImportRow[], replace: boolean): Promise<{ ok: boolean; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, message: "Tick at least one class to save." };
  if (rows.length > 200) return { ok: false, message: "That's more than 200 classes. Paste one week or fortnight at a time." };

  const clean = rows
    .map((r, i) => ({
      day_of_week: Number(r.day),
      subject: String(r.subject ?? "").trim().slice(0, 80),
      period: String(r.period ?? "").trim().slice(0, 40) || null,
      room: String(r.room ?? "").trim().slice(0, 40) || null,
      week: r.week === "A" || r.week === "B" ? r.week : "all",
      sort_order: i + 1,
    }))
    .filter((r) => r.subject && Number.isInteger(r.day_of_week) && r.day_of_week >= 1 && r.day_of_week <= 7);
  if (clean.length === 0) return { ok: false, message: "None of those rows had a subject and a day." };

  const supabase = await createClient();
  const { data: old } = replace ? await supabase.from("timetable").select("id") : { data: [] };
  const { error } = await supabase.from("timetable").insert(clean);
  if (error) return { ok: false, message: "Couldn't save those classes. Try again." };

  const oldIds = (old ?? []).map((r: { id: string }) => r.id);
  if (oldIds.length) await supabase.from("timetable").delete().in("id", oldIds);

  revalidatePath("/timetable");
  revalidatePath("/");
  return {
    ok: true,
    message: `Saved ${clean.length} ${clean.length === 1 ? "class" : "classes"}${oldIds.length ? `, replacing ${oldIds.length}` : ""}.`,
  };
}
