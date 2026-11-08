import { NextResponse } from "next/server";
import { deleteConnection, listConnections } from "@/lib/oauth-store";
import { currentUserId } from "@/lib/supabase/server";

// Spotify has no token-revoke endpoint: deleting it here stops all access from
// this site. You can also remove the app at spotify.com/account/apps.
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  for (const c of await listConnections(userId, "spotify")) await deleteConnection(userId, c.id);
  return NextResponse.json({ ok: true, message: "Spotify disconnected." });
}
