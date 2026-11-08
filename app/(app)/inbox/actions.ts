"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid, SAVE_FAILED, type Reply } from "@/lib/validate";

export async function markAllRead(): Promise<Reply> {
  const supabase = await createClient();
  const { error } = await supabase.from("reports").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) return SAVE_FAILED;
  revalidatePath("/", "layout");
  return { ok: true, message: "All caught up." };
}

export async function markRead(id: string): Promise<void> {
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("reports").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/", "layout");
}
