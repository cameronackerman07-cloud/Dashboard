"use server";

import { revalidatePath } from "next/cache";
import { PUSH_CATEGORIES } from "@/lib/push";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isTimeKey } from "@/lib/time";
import { int, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

export async function saveNotificationSettings(form: FormData): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const start = String(form.get("quiet_start") ?? "");
  const end = String(form.get("quiet_end") ?? "");
  if (!isTimeKey(start) || !isTimeKey(end)) return { ok: false, message: "Pick a start and end time for quiet hours." };
  const categories = Object.fromEntries(PUSH_CATEGORIES.map((c) => [c.id, form.get(`cat_${c.id}`) === "on"]));
  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert(
    {
      user_id: userId,
      enabled: form.get("enabled") === "on",
      quiet_start: start.padStart(5, "0"),
      quiet_end: end.padStart(5, "0"),
      categories,
      hide_details_on_lock_screen: form.get("hide") === "on",
      allow_urgent_at_night: form.get("urgent") === "on",
      max_per_day: int(form.get("max_per_day"), 0, 50, 4),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return SAVE_FAILED;
  revalidatePath("/settings/notifications");
  return { ok: true, message: "Notification settings saved." };
}
