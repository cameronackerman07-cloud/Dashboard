import { NextResponse } from "next/server";
import { syncGoogle } from "@/lib/sources/google";
import { currentUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";

export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  const results = await syncGoogle(userId, { onlyId: isUuid(id) ? id : undefined });
  if (results.length === 0) return NextResponse.json({ ok: false, message: "Nothing to sync." });
  return NextResponse.json({ ok: results.every((r) => r.ok), message: results.map((r) => r.message).join(" ") });
}
