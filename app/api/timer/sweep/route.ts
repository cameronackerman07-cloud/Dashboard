import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/bearer";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { sweepTimers } from "@/lib/timer-sweep";

// "Time's up" pushes and closing forgotten timers. Needs
// "Authorization: Bearer <AGENT_SECRET>". The 30-minute tick calls the same
// code; the README shows an optional per-minute Supabase pg_cron job for this
// route so alerts arrive on time even when the app is closed.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(request: Request) {
  if (!bearerMatches(request, process.env.AGENT_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY isn't set" }, { status: 503 });
  const res = await sweepTimers(createAdminClient());
  return NextResponse.json({ ok: true, ...res });
}

export const GET = handle;
export const POST = handle;
