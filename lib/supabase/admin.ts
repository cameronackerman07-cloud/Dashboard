import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

// Service-role client: skips Row Level Security, so it can do anything. Only for
// creating accounts (sign-up) and the daily cron job. Never import this into a
// client component, and never send what it reads to someone it doesn't belong to.
export function adminConfigured(): boolean {
  return !!SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
