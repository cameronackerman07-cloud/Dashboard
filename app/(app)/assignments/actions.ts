"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server actions for the due-date tracker. Every write goes through the signed-in
// Supabase client, so Row Level Security guarantees a user only ever touches their
// own rows (user_id defaults to auth.uid() on insert). After each change we
// revalidate the pages that show tasks so they re-render with fresh data.

function refresh() {
  revalidatePath("/assignments");
  revalidatePath("/");
}

export async function addTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const course = String(formData.get("course") ?? "").trim();
  const due = String(formData.get("due") ?? "").trim();

  const supabase = await createClient();
  await supabase.from("tasks").insert({
    source: "manual",
    title,
    course: course || null,
    // Store the picked calendar date at UTC midnight so it reads back as the
    // same day in the user's timezone.
    due_at: due ? `${due}T00:00:00Z` : null,
    done: false,
  });

  refresh();
}

export async function setTaskDone(id: string, done: boolean) {
  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", id);

  refresh();
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", id);

  refresh();
}
