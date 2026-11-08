import { NextResponse } from "next/server";
import { control, spotifyToken } from "@/lib/sources/spotify";
import { currentUserId } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "play" && action !== "pause" && action !== "next") return NextResponse.json({ ok: false }, { status: 400 });
  const t = await spotifyToken(userId);
  if (!t) return NextResponse.json({ ok: false, message: "Connect Spotify in Settings." });
  return NextResponse.json(await control(t.token, action));
}
