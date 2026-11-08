"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { optionalSubject } from "@/lib/subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// Notes CRUD. RLS keeps every row scoped to the signed-in user.

const MAX_BODY = 100_000;

// "New note": makes an empty note and opens it.
export async function createNote(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("notes").insert({ title: "Untitled", body: "" }).select("id").single();
  revalidatePath("/notes");
  redirect(data?.id ? `/notes/${data.id}` : "/notes");
}

// Used by Summaries' "Save to Notes" button.
export async function createNoteWith(title: string, body: string, subject: string | null = null): Promise<string | null> {
  if (!(await currentUserId())) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .insert({ title: text(title, 200) || "Untitled", body: String(body ?? "").slice(0, MAX_BODY), subject: optionalSubject(subject) })
    .select("id")
    .single();
  revalidatePath("/notes");
  return data?.id ?? null;
}

export async function saveNote(id: string, fields: { title: string; body: string; subject: string }): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (typeof fields.body !== "string" || fields.body.length > MAX_BODY) {
    return { ok: false, message: "That note is too long to save. Split it into two notes." };
  }
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .update({
      title: text(fields.title, 200) || "Untitled",
      body: fields.body,
      subject: optionalSubject(fields.subject),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: true, message: "Saved." };
}

export async function setPinned(id: string, pinned: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("notes").update({ pinned: !!pinned }).eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: true, message: pinned ? "Pinned to the top." : "Unpinned." };
}

export async function deleteNote(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/notes");
  redirect("/notes");
}
