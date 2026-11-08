import { NextResponse } from "next/server";
import { runDueForUser, STOP_STARTING_AFTER_MS } from "@/lib/agents/engine";
import { bearerMatches } from "@/lib/bearer";
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
  console.log(`Agents tick: ${JSON.stringify(totals)}`);
  return NextResponse.json({ ok: true, ...totals });
}
