"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Weekly study planner. Blocks recur each week (day + start time + duration).

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

  revalidatePath("/planner");
}

export async function deleteBlock(id: string) {
  const supabase = await createClient();
  await supabase.from("study_blocks").delete().eq("id", id);
  revalidatePath("/planner");
}
