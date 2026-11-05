"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Notes CRUD. RLS keeps every row scoped to the signed-in user.

export async function createNote(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .insert({ title: "Untitled", body: "" })
    .select("id")
    .single();
  revalidatePath("/notes");
  return data?.id ?? null;
}

// Used by Summaries' "Save to notes" button.
export async function createNoteWith(
  title: string,
  body: string,
  course: string | null = null,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .insert({ title: title.trim() || "Untitled", body, course })
    .select("id")
    .single();
  revalidatePath("/notes");
  return data?.id ?? null;
}

export async function saveNote(
  id: string,
  fields: { title: string; body: string; course: string | null },
) {
  const supabase = await createClient();
  await supabase
    .from("notes")
    .update({
      title: fields.title.trim() || "Untitled",
      body: fields.body,
      course: fields.course,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/notes");
}

export async function deleteNote(id: string) {
  const supabase = await createClient();
  await supabase.from("notes").delete().eq("id", id);
  revalidatePath("/notes");
}
