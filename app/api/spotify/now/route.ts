import { NextResponse } from "next/server";
import { nowPlaying, spotifyConfigured, spotifyToken } from "@/lib/sources/spotify";
import { currentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ state: "signed-out" }, { status: 401 });
  if (!spotifyConfigured()) return NextResponse.json({ state: "not-set-up" });
  const t = await spotifyToken(userId).catch(() => null);
  if (!t) return NextResponse.json({ state: "not-connected" });
  const track = await nowPlaying(t.token).catch(() => null);
  return NextResponse.json({ state: "connected", premium: t.premium, track });
}
