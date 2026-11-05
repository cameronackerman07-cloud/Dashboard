import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for the server (Server Components, Route Handlers, Server Actions).
// Reads and writes the auth cookies so the signed-in session is available on the server.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session cookie instead, so this is safe to ignore.
          }
        },
      },
    },
  );
}

// For server actions that spend something other than the database (like the AI
// keys), where Row Level Security can't protect them.
export async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}
