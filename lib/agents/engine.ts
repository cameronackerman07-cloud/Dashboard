import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasUsableKey } from "@/lib/ai-keys";
import { redactSecrets } from "@/lib/redact";
import { aiCallsToday, buildContext } from "./context";
import { runCustomAgent } from "./custom";
import { definitionFor } from "./registry";
import { nextRun, parseSchedule } from "./schedule";
import type { AgentRow, Finding } from "./types";

// Runs agents. With the service-role client every query names the user_id, and
// one user's keys or data are never used for another. One agent failing never
// stops the others.

type Db = SupabaseClient;

export const STOP_STARTING_AFTER_MS = 45_000;

function isoWeek(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return `${d.getUTCFullYear()}-W${1 + Math.round((d.getTime() - first.getTime()) / 604_800_000)}`;
}

async function userNames(db: Db, userId: string): Promise<string[]> {
  const { data } = await db.from("profiles").select("display_name, full_name").eq("id", userId).maybeSingle();
  return [data?.display_name, data?.full_name].filter((v): v is string => typeof v === "string" && !!v);
}

export async function saveFindings(db: Db, userId: string, agentId: string, runId: string, findings: Finding[]): Promise<number> {
  if (findings.length === 0) return 0;
  const rows = findings.slice(0, 50).map((f) => ({
    user_id: userId,
    agent_id: agentId,
    run_id: runId,
    category: f.category.slice(0, 30),
    title: f.title.slice(0, 200),
    body: (f.body ?? "").slice(0, 2000),
    importance: Math.min(5, Math.max(1, Math.round(f.importance))),
    dedupe_key: f.dedupeKey.slice(0, 200),
    data: f.data ?? {},
    action_url: f.actionUrl && f.actionUrl.startsWith("/") && !f.actionUrl.startsWith("//") ? f.actionUrl : null,
    expires_at: f.expiresAt ?? null,
  }));
  const { data } = await db.from("agent_findings").upsert(rows, { onConflict: "user_id,agent_id,dedupe_key", ignoreDuplicates: true }).select("id");
  return (data ?? []).length;
}

export type RunOutcome = { status: "ok" | "error" | "skipped"; findings: number; error?: string };

export async function runAgent(db: Db, agent: AgentRow, deadline: number, now = Date.now()): Promise<RunOutcome> {
  const userId = agent.user_id;
  const schedule = parseSchedule(agent.schedule) ?? { type: "daily", at: "07:00" };
  const next = new Date(nextRun(schedule, now)).toISOString();
  const def = agent.kind === "builtin" ? definitionFor(agent.slug) : undefined;
  const needsAI = agent.kind === "custom" ? true : !!def?.needsAI;

  const { data: run } = await db.from("agent_runs").insert({ user_id: userId, agent_id: agent.id, status: "running" }).select("id").single();
  const runId = (run?.id as string) ?? "";
  const finish = async (status: RunOutcome["status"], findings: number, aiCalls: number, error?: string) => {
    await db
      .from("agent_runs")
      .update({ status, findings_count: findings, ai_calls: aiCalls, error: error ? redactSecrets(error).slice(0, 300) : null, finished_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("user_id", userId);
    await db.from("agents").update({ last_run_at: new Date(now).toISOString(), next_run_at: next, config: agent.config }).eq("id", agent.id).eq("user_id", userId);
  };

  if (agent.kind === "builtin" && !def) {
    await finish("error", 0, 0, "This built-in agent no longer exists.");
    return { status: "error", findings: 0, error: "unknown agent" };
  }

  const aiAvailable = await hasUsableKey(userId);
  if (needsAI && !aiAvailable) {
    // Said once a week, not every run.
    const n = await saveFindings(db, userId, agent.id, runId, [
      { category: "setup", title: `${agent.name} needs an AI key`, body: "Add a free AI key in Settings → AI keys and this agent will start working.", importance: 2, dedupeKey: `needs-key:${isoWeek(now)}`, actionUrl: "/settings/ai-keys" },
    ]);
    await finish("skipped", n, 0, "Add a free AI key in Settings");
    return { status: "skipped", findings: n };
  }

  let aiCalls = 0;
  try {
    const ctx = buildContext(db, agent, {
      now,
      deadline,
      aiAvailable,
      userNames: await userNames(db, userId),
      aiCallsSoFar: await aiCallsToday(db, userId, agent.id, now),
      onAiCall: () => aiCalls++,
    });
    const findings = def ? await def.run(ctx) : await runCustomAgent(ctx);
    const saved = await saveFindings(db, userId, agent.id, runId, findings);
    await finish("ok", saved, aiCalls);
    return { status: "ok", findings: saved };
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    console.error(`Agent ${agent.slug} failed for a user: ${message.slice(0, 120)}`);
    await finish("error", 0, aiCalls, message);
    return { status: "error", findings: 0, error: message };
  }
}

// All of one user's due agents: specialists first, then the chief (The BRIAN).
export async function runDueForUser(db: Db, userId: string, startedAt: number, now = Date.now()): Promise<{ ran: number; errors: number }> {
  const { data } = await db
    .from("agents")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .lte("next_run_at", new Date(now).toISOString());
  const agents = ((data ?? []) as AgentRow[]).sort((a, b) => (a.role === b.role ? 0 : a.role === "chief" ? 1 : -1));
  let ran = 0;
  let errors = 0;
  for (const agent of agents) {
    if (Date.now() - startedAt > STOP_STARTING_AFTER_MS) break;
    const res = await runAgent(db, agent, startedAt + 55_000, now);
    ran++;
    if (res.status === "error") errors++;
  }
  return { ran, errors };
}
