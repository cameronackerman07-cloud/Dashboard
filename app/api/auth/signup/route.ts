import { NextResponse } from "next/server";
import { cleanEmail, cleanName, inviteOk, MIN_PASSWORD } from "@/lib/auth";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Create account. The service-role client makes the account already confirmed,
// so friends don't have to click an email link. If INVITE_CODE is set, the code
// must match, so strangers who find the site can't join.
export async function POST(request: Request) {
  if (!supabaseConfigured() || !adminConfigured()) {
    return fail("Sign-up isn't switched on yet: the Supabase keys haven't been added.", 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Something went wrong. Refresh the page and try again.");
  }

  const name = cleanName(body.displayName);
  const email = cleanEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) return fail("Add your name, so the dashboard knows what to call you.");
  if (!email) return fail("That email doesn't look right.");
  if (password.length < MIN_PASSWORD) return fail(`Use a password of at least ${MIN_PASSWORD} characters.`);
  if (password.length > 72) return fail("That password is too long. Use 72 characters or fewer.");
  if (!inviteOk(body.inviteCode)) return fail("That invite code isn't right. Check it with whoever sent you the link.", 403);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });

  if (error || !data.user) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "email_exists" || /already|registered|exists/i.test(error?.message ?? "")) {
      return fail("That email already has an account. Use Sign in instead.", 409);
    }
    if (code === "weak_password") return fail("Pick a stronger password: longer, and not a common one.");
    console.error(`Sign-up failed: ${code ?? error?.status ?? "unknown"}`);
    return fail("Couldn't create the account. Try again in a minute.", 500);
  }

  // The database trigger makes the profile; this makes sure the name is set.
  await admin.from("profiles").upsert({ id: data.user.id, email, display_name: name }, { onConflict: "id" });

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return NextResponse.json({ ok: true, signedIn: false });
  return NextResponse.json({ ok: true, signedIn: true });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
