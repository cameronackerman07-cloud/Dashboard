"use server";

import { revalidatePath } from "next/cache";
import { optionalSubject } from "@/lib/subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isDayKey } from "@/lib/time";
import { int, isUuid, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// RLS keeps every row scoped to the signed-in user.

function refresh() {
  revalidatePath("/todo");
  revalidatePath("/");
}

function fields(form: FormData) {
  const due = String(form.get("due") ?? "").trim();
  return {
    title: text(form.get("title"), 200),
    due_on: isDayKey(due) ? due : null,
    badDate: !!due && !isDayKey(due),
    subject: optionalSubject(form.get("subject")),
    priority: int(form.get("priority") || 2, 1, 3, 2),
  };
}

export async function addTodo(form: FormData): Promise<Reply> {
  const { title, due_on, badDate, subject, priority } = fields(form);
  if (!title) return { ok: false, message: "Type what you need to do." };
  if (badDate) return { ok: false, message: "That date doesn't look right." };
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("todos").insert({ title, due_on, subject, priority });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Added." };
}

export async function updateTodo(id: string, form: FormData): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const { title, due_on, badDate, subject, priority } = fields(form);
  if (!title) return { ok: false, message: "The to-do needs a title." };
  if (badDate) return { ok: false, message: "That date doesn't look right." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("todos")
    .update({ title, due_on, subject, priority, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Saved." };
}

export async function setTodoDone(id: string, done: boolean): Promise<boolean> {
  if (!isUuid(id)) return false;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("todos")
    .update({ done: !!done, done_at: done ? now : null, updated_at: now })
    .eq("id", id);
  if (error) return false;
  refresh();
  return true;
}

export async function deleteTodo(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted." };
}

export async function clearDone(): Promise<Reply> {
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("done", true);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Cleared finished to-dos." };
}
