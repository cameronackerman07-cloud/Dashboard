import { NextResponse } from "next/server";
import { cleanEmail } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// "Forgot your password?": emails a one-time sign-in link to an existing account
// (never creates one). After signing in, set a new password in Settings.
export async function POST(request: Request) {
  if (!supabaseConfigured()) return fail("Supabase isn't connected yet.", 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Something went wrong. Refresh the page and try again.");
  }
  const email = cleanEmail(body.email);
  if (!email) return fail("Enter the email your account uses.");

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?next=/settings` },
  });
  if (error?.status === 429) return fail("Too many emails sent. Wait a few minutes, then try again.", 429);
  // Same reply whether or not the account exists, so this can't be used to
  // check who has an account.
  return NextResponse.json({ ok: true });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
