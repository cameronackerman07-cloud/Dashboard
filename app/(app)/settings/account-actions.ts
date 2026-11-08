"use server";

import { revalidatePath } from "next/cache";
import { cleanName, MIN_PASSWORD } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AccountReply = { ok: boolean; message: string };

export async function updateDisplayName(raw: string): Promise<AccountReply> {
  const name = cleanName(raw);
  if (!name) return { ok: false, message: "Add a name first." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You've been signed out. Refresh and sign in again." };

  const { error } = await supabase.from("profiles").update({ display_name: name, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return { ok: false, message: "Couldn't save your name. Try again." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Name saved." };
}

// Works for a signed-in user, including one who came in through the emailed
// "forgot your password?" link.
export async function updatePassword(password: string): Promise<AccountReply> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return { ok: false, message: `Use at least ${MIN_PASSWORD} characters.` };
  }
  if (password.length > 72) return { ok: false, message: "Use 72 characters or fewer." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if ((error as { code?: string }).code === "same_password") return { ok: false, message: "That's already your password." };
    if ((error as { code?: string }).code === "weak_password") return { ok: false, message: "Pick a stronger password." };
    return { ok: false, message: "Couldn't change your password. Sign out and in again, then retry." };
  }
  return { ok: true, message: "Password changed. Use it next time you sign in." };
}
