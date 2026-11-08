import { createBrowserClient } from "@supabase/ssr";
import { NOT_CONNECTED, SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

// Supabase client for the browser (Client Components). Uses the publishable key,
// which is safe to expose — Row Level Security decides what each user can read.
export function createClient() {
  if (!supabaseConfigured()) throw new Error(NOT_CONNECTED);
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
