import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agents/engine";
import type { AgentRow } from "@/lib/agents/types";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";

// "Run now": only the signed-in user's own agent, at most once per 2 minutes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ ok: false, message: "Agents need SUPABASE_SERVICE_ROLE_KEY in Vercel." }, { status: 503 });
  const { agentId } = (await request.json().catch(() => ({}))) as { agentId?: string };
  if (!isUuid(agentId)) return NextResponse.json({ ok: false, message: "Unknown agent." }, { status: 400 });

  const db = createAdminClient();
  const { data: agent } = await db.from("agents").select("*").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (!agent) return NextResponse.json({ ok: false, message: "Unknown agent." }, { status: 404 });

  const { data: recent } = await db
    .from("agent_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .gte("started_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .limit(1);
  if ((recent ?? []).length > 0) return NextResponse.json({ ok: false, message: "It just ran. Try again in a couple of minutes." }, { status: 429 });

  const res = await runAgent(db, agent as AgentRow, Date.now() + 55_000);
  const message =
    res.status === "ok"
      ? res.findings
        ? `Done: ${res.findings} new finding${res.findings === 1 ? "" : "s"}.`
        : "Done: nothing new."
      : res.status === "skipped"
        ? "Skipped: add a free AI key in Settings → AI keys."
        : `It didn't finish: ${res.error ?? "something went wrong"}`;
  return NextResponse.json({ ok: res.status !== "error", message });
}
