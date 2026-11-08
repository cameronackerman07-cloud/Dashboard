import { NextResponse } from "next/server";
import { pkcePair, siteUrl, startState } from "@/lib/oauth";
import { oauthStorageReady } from "@/lib/oauth-store";
import { SPOTIFY_SCOPES, spotifyConfigured } from "@/lib/sources/spotify";
import { currentUserId } from "@/lib/supabase/server";

// Authorization code with PKCE. For local testing Spotify only allows a
// loopback address such as http://127.0.0.1:3000 (not "localhost").
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", url));
  if (!spotifyConfigured() || !oauthStorageReady()) return NextResponse.redirect(new URL("/settings?spotify=not-set-up", url));
  const { verifier, challenge } = pkcePair();
  const state = await startState({ userId, provider: "spotify", verifier, returnTo: "/settings" });
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${siteUrl(request)}/api/spotify/callback`,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
