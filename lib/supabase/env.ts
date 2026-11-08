// The two Supabase values that are safe for the browser. next.config.mjs maps
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY to these names at build time.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// False until the Supabase env vars are added in Vercel. Pages check this and
// show "Supabase isn't connected yet" instead of crashing.
export function supabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}

export const NOT_CONNECTED = "Supabase isn't connected yet.";
