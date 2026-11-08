import { NextResponse } from "next/server";
import { deleteConnection } from "@/lib/oauth-store";
import { revokeGoogle } from "@/lib/sources/google";
import { currentUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";

// Revokes the token at Google, then deletes the saved connection.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!isUuid(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const row = await deleteConnection(userId, id);
  if (row?.refreshToken) await revokeGoogle(row.refreshToken);
  return NextResponse.json({ ok: true, message: "Disconnected." });
}
