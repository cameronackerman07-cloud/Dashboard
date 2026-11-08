import { NextResponse } from "next/server";
import { cleanEmail } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Sign in with email + password. The session cookies are set on this response.
export async function POST(request: Request) {
  if (!supabaseConfigured()) return fail("Supabase isn't connected yet, so nobody can sign in.", 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Something went wrong. Refresh the page and try again.");
  }

  const email = cleanEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("Enter your email and password.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) return fail("Too many tries. Wait a few minutes, then try again.", 429);
    return fail("Wrong email or password.", 401);
  }
  return NextResponse.json({ ok: true });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
