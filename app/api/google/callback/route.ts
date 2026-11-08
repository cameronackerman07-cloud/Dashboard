import { NextResponse } from "next/server";
import { finishState, safeReturn, siteUrl } from "@/lib/oauth";
import { saveConnection } from "@/lib/oauth-store";
import { syncGoogle } from "@/lib/sources/google";
import { currentUserId } from "@/lib/supabase/server";

// Google sends the user back here. Checks the state cookie, swaps the code for a
// refresh token, stores it encrypted, then returns to an allowed page only.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", url));
  const saved = await finishState(url.searchParams.get("state"), userId);
  const back = (q: string) => NextResponse.redirect(new URL(`${safeReturn(saved?.returnTo)}?google=${q}`, url));
  if (!saved || saved.provider !== "google") return back("expired");

  const error = url.searchParams.get("error");
  if (error === "access_denied") return back("cancelled"); // they pressed Cancel: no error page
  if (error) return back(error === "admin_policy_enforced" ? "blocked" : "failed");

  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${siteUrl(request)}/api/google/callback`,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; error?: string };
  if (!res.ok || !body.refresh_token) return back(body.error === "admin_policy_enforced" ? "blocked" : "failed");

  let email: string | null = null;
  try {
    const payload = JSON.parse(Buffer.from((body.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    email = payload.email ?? null;
  } catch {
    /* no email: fine */
  }
  await saveConnection(userId, { provider: "google", label: saved.label ?? "Personal", accountHint: email, scopes: saved.scopes ?? ["calendar"], refreshToken: body.refresh_token });
  await syncGoogle(userId).catch(() => []);
  return back("connected");
}
