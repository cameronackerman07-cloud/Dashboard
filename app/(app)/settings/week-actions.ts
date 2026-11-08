"use server";

import { revalidatePath } from "next/cache";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { int, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// Pay-week start day (Cleaning hours report, Siri "cleaner hours") and the town
// used for the weather in The BRIAN's morning briefing. Only a town or suburb is
// kept, with its location rounded to about 1 km.

async function findTown(name: string): Promise<{ name: string; lat: number; lng: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&countryCode=AU`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!res.ok) throw new Error("lookup failed");
  const data = (await res.json()) as { results?: { name?: string; admin1?: string; latitude?: number; longitude?: number }[] };
  const r = data.results?.[0];
  if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { name: [r.name, r.admin1].filter(Boolean).join(", ").slice(0, 60), lat: round(r.latitude), lng: round(r.longitude) };
}

export async function saveWeekSettings(payWeekStart: number, town: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const start = int(payWeekStart, 1, 7, 3);
  const name = town.trim().replace(/\s+/g, " ").slice(0, 60);
  if (/\d{1,5}\s+\w+\s+(st|street|rd|road|ave|avenue|cres|dr|drive|pl|place|ct|court)\b/i.test(name)) {
    return { ok: false, message: "Just the town or suburb, please, not your street address." };
  }

  let place: { name: string; lat: number; lng: number } | null = null;
  if (name) {
    try {
      place = await findTown(name);
    } catch {
      return { ok: false, message: "Couldn't look up that town right now. Try again in a minute." };
    }
    if (!place) return { ok: false, message: `Couldn't find "${name}" in Australia. Check the spelling.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, pay_week_start: start, region: place?.name ?? null, lat: place?.lat ?? null, lng: place?.lng ?? null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return SAVE_FAILED;
  revalidatePath("/settings");
  return { ok: true, message: place ? `Saved. Weather will be for ${place.name}.` : "Saved. No weather town set." };
}
