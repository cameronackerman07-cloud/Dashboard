import { createBrowserClient } from "@supabase/ssr";

// Supabase client for the browser (Client Components). Uses the public anon key,
// which is safe to expose — Row Level Security decides what each user can read.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
