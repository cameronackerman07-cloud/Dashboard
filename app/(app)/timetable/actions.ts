"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Manual weekly timetable. (Later phases can import this from Atlantis.)
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
