import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NOT_CONNECTED, SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

// Supabase client for the server (Server Components, Route Handlers, Server Actions).
// Reads and writes the auth cookies so the signed-in session is available on the server.
export async function createClient() {
  // cookies() first: it marks the page as per-request, so the build never tries
  // to pre-render a signed-in page (it would have no Supabase to talk to).
  const cookieStore = await cookies();
  if (!supabaseConfigured()) throw new Error(NOT_CONNECTED);

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookie instead, so this is safe to ignore.
        }
      },
    },
  });
}

// For server actions that spend something other than the database (like the AI
// keys), where Row Level Security can't protect them.
export async function isSignedIn(): Promise<boolean> {
  return !!(await currentUserId());
}

// The signed-in user's id, or null. Never trust an id sent from the browser.
export async function currentUserId(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
