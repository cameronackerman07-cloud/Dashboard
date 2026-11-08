import { NextResponse } from "next/server";
import { runDueForUser, STOP_STARTING_AFTER_MS } from "@/lib/agents/engine";
import { bearerMatches } from "@/lib/bearer";
import { syncGoogle } from "@/lib/sources/google";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Called every 30 minutes by .github/workflows/agents-tick.yml (or Supabase
// pg_cron) with "Authorization: Bearer <AGENT_SECRET>". Runs every due agent,
// one user at a time, and stops starting new ones after about 45 seconds.
// Logs counts only.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return tick(request);
}
export async function POST(request: Request) {
  return tick(request);
}

async function tick(request: Request) {
  if (!bearerMatches(request, process.env.AGENT_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY isn't set" }, { status: 503 });

  const started = Date.now();
  const db = createAdminClient();
  const { data, error } = await db
    .from("agents")
    .select("user_id")
    .eq("enabled", true)
    .lte("next_run_at", new Date(started).toISOString())
    .limit(5000);
  if (error) return NextResponse.json({ ok: false, error: "couldn't list agents" }, { status: 500 });

  const users: string[] = [...new Set<string>((data ?? []).map((r: { user_id: string }) => r.user_id))];
  const totals = { users: 0, agents: 0, errors: 0, left: 0 };
  for (const userId of users) {
    if (Date.now() - started > STOP_STARTING_AFTER_MS) {
      totals.left++;
      continue;
    }
    try {
      const r = await runDueForUser(db, userId, started);
      totals.users++;
      totals.agents += r.ran;
      totals.errors += r.errors;
    } catch {
      totals.errors++;
    }
  }
  // Refresh Google accounts not synced in the last 30 minutes, while time allows.
  const { data: googleUsers } = await db.from("oauth_connections").select("user_id").eq("provider", "google").eq("status", "active").limit(2000);
  let synced = 0;
  for (const userId of new Set<string>((googleUsers ?? []).map((r: { user_id: string }) => r.user_id))) {
    if (Date.now() - started > STOP_STARTING_AFTER_MS) break;
    synced += (await syncGoogle(userId, { olderThanMs: 25 * 60_000 }).catch(() => [])).length;
  }
  Object.assign(totals, { googleSynced: synced });
  console.log(`Agents tick: ${JSON.stringify(totals)}`);
  return NextResponse.json({ ok: true, ...totals });
}
