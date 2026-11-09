"use server";

import { revalidatePath } from "next/cache";
import { MAX_OWN_EVENTS, MINE_SOURCE, parseEvent, type EventInput } from "@/lib/calendar-edit";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// Your own events. Row Level Security keeps every row to the signed-in person,
// and only rows with source "mine" can be changed here, so school, Google and
// imported events stay as they came.

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function addEvent(input: EventInput): Promise<Reply> {
  const parsed = parseEvent(input);
  if (!parsed.ok) return parsed;
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("source", MINE_SOURCE);
  if ((count ?? 0) >= MAX_OWN_EVENTS) return { ok: false, message: "You've got a lot of events. Delete some old ones first." };
  const { error } = await supabase.from("events").insert({ ...parsed.row, source: MINE_SOURCE });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Added." };
}

export async function updateEvent(id: string, input: EventInput): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const parsed = parseEvent(input);
  if (!parsed.ok) return parsed;
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ ...parsed.row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("source", MINE_SOURCE)
    .select("id");
  if (error) return SAVE_FAILED;
  if (!data?.length) return { ok: false, message: "That event isn't there any more. Refresh the page." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteEvent(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id).eq("source", MINE_SOURCE);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted." };
}
