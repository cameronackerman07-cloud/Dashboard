import { NextResponse } from "next/server";
import { siteUrl, startState } from "@/lib/oauth";
import { oauthStorageReady } from "@/lib/oauth-store";
import { GOOGLE_SCOPES, googleConfigured } from "@/lib/sources/google";
import { currentUserId } from "@/lib/supabase/server";

// Starts connecting a Google account (read-only scopes the user ticked).
export async function GET(request: Request) {
  const userId = await currentUserId();
  const url = new URL(request.url);
  if (!userId) return NextResponse.redirect(new URL("/login", url));
  if (!googleConfigured() || !oauthStorageReady()) return NextResponse.redirect(new URL("/settings?google=not-set-up", url));

  const label = (url.searchParams.get("label") ?? "Personal").replace(/[^\w\s-]/g, "").trim().slice(0, 30) || "Personal";
  const wanted = (url.searchParams.get("scopes") ?? "calendar").split(",").filter((s) => s in GOOGLE_SCOPES);
  const scopes = wanted.length ? wanted : ["calendar"];
  const state = await startState({ userId, provider: "google", label, scopes, returnTo: "/settings" });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${siteUrl(request)}/api/google/callback`,
    response_type: "code",
    scope: ["openid", "email", ...scopes.map((s) => GOOGLE_SCOPES[s])].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const hint = url.searchParams.get("login_hint");
  if (hint && /^[^\s@]+@[^\s@]+$/.test(hint)) params.set("login_hint", hint);
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
