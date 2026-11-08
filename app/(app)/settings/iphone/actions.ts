"use server";

import { revalidatePath } from "next/cache";
import { newToken } from "@/lib/device-tokens";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid, SAVE_FAILED, SIGNED_OUT, text } from "@/lib/validate";

// The full token is returned ONCE to show on screen; only its hash is stored.
export async function createDeviceToken(label: string, scope: string): Promise<{ ok: boolean; message: string; token?: string }> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const name = text(label, 40) || "iPhone";
  const { token, hash } = newToken("dash");
  const supabase = await createClient();
  const { error } = await supabase.from("device_tokens").insert({ label: name, token_hash: hash, scope: scope === "write" ? "write" : "read" });
  if (error) return SAVE_FAILED;
  revalidatePath("/settings/iphone");
  return { ok: true, message: "Copy it now: it won't be shown again.", token };
}

export async function revokeDeviceToken(id: string): Promise<{ ok: boolean; message: string }> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("device_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/settings/iphone");
  return { ok: true, message: "Revoked. Shortcuts using it stop working." };
}

// A new calendar address (the old one stops working).
export async function regenerateCalendarToken(): Promise<{ ok: boolean; message: string; token?: string }> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const { token, hash } = newToken("cal");
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_tokens").upsert({ user_id: userId, token_hash: hash, created_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return SAVE_FAILED;
  revalidatePath("/settings/iphone");
  return { ok: true, message: "New calendar address made. Subscribe with it now: it's only shown once.", token };
}

export async function stopCalendarFeed(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  await supabase.from("calendar_tokens").delete().neq("token_hash", "");
  revalidatePath("/settings/iphone");
  return { ok: true, message: "Calendar feed turned off." };
}
