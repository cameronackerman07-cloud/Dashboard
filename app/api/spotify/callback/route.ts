import { NextResponse } from "next/server";
import { finishState, safeReturn, siteUrl } from "@/lib/oauth";
import { getConnections, saveConnection, updateConnection } from "@/lib/oauth-store";
import { isPremium, SPOTIFY_SCOPES } from "@/lib/sources/spotify";
import { currentUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", url));
  const saved = await finishState(url.searchParams.get("state"), userId);
  const back = (q: string) => NextResponse.redirect(new URL(`${safeReturn(saved?.returnTo)}?spotify=${q}`, url));
  if (!saved || saved.provider !== "spotify" || !saved.verifier) return back("expired");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${siteUrl(request)}/api/spotify/callback`, code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string };
  if (!res.ok || !body.refresh_token) return back(res.status === 403 ? "not-allowed" : "failed");
  // Development-mode apps only work for people the owner added by email: Spotify answers 403 for anyone else.
  const me = body.access_token ? await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${body.access_token}` }, signal: AbortSignal.timeout(6000), cache: "no-store" }).catch(() => null) : null;
  if (me && me.status === 403) return back("not-allowed");
  await saveConnection(userId, { provider: "spotify", label: "Spotify", accountHint: null, scopes: SPOTIFY_SCOPES, refreshToken: body.refresh_token });
  const premium = body.access_token ? await isPremium(body.access_token) : null;
  const [conn] = await getConnections(userId, "spotify");
  if (conn) await updateConnection(userId, conn.id, { cached: { premium } });
  return back("connected");
}
