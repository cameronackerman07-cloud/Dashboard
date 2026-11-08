import Link from "next/link";
import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { hasUsableKey } from "@/lib/ai-keys";
import { ensureDefaultAgents } from "@/lib/agents/defaults";
import { describeSchedule, parseSchedule } from "@/lib/agents/schedule";
import { SOURCES, type AgentRow, type ReportSection } from "@/lib/agents/types";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { formatShortDate, formatTime } from "@/lib/time";
import { AgentsHub, type HubAgent } from "./AgentsHub";

export const metadata: Metadata = { title: "AI Agents" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const when = (iso: string | null) => (iso ? `${formatShortDate(new Date(iso).getTime())} ${formatTime(new Date(iso).getTime())}` : null);

export default async function AiAgentsPage() {
  const userId = await currentUserId();
  if (userId) await ensureDefaultAgents(userId);
  const supabase = await createClient();
  const [{ data: agents }, { data: runs }, { data: findings }, { data: reports }, aiReady] = await Promise.all([
    supabase.from("agents").select("*").order("created_at", { ascending: true }),
    supabase.from("agent_runs").select("agent_id, status, started_at, error, findings_count").order("started_at", { ascending: false }).limit(200),
    supabase.from("agent_findings").select("id, agent_id, title, importance, created_at, consumed_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("reports").select("id, kind, title, headline, sections, created_at, read_at").order("created_at", { ascending: false }).limit(10),
    userId ? hasUsableKey(userId) : Promise.resolve(false),
  ]);

  type Run = { agent_id: string; status: string; started_at: string; error: string | null; findings_count: number };
  type Find = { id: string; agent_id: string; title: string; importance: number; created_at: string; consumed_at: string | null };
  const runList = (runs ?? []) as Run[];
  const findList = (findings ?? []) as Find[];
  const now = Date.now();

  const hub: HubAgent[] = ((agents ?? []) as AgentRow[]).map((a) => {
    const myRuns = runList.filter((r) => r.agent_id === a.id);
    const last = myRuns[0];
    const schedule = parseSchedule(a.schedule) ?? { type: "daily" as const, at: "07:00" };
    return {
      id: a.id,
      slug: a.slug,
      role: a.role,
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      kind: a.kind,
      schedule,
      scheduleLabel: describeSchedule(schedule),
      instructions: a.instructions,
      sources: a.sources,
      importanceMin: a.importance_min,
      dailyAiBudget: a.daily_ai_budget,
      webSources: Array.isArray(a.config?.web_sources) ? (a.config.web_sources as string[]) : [],
      briefingAt: typeof a.config?.briefing_at === "string" ? (a.config.briefing_at as string) : "07:00",
      resetAt: typeof a.config?.reset_at === "string" ? (a.config.reset_at as string) : "18:30",
      tone: typeof a.config?.tone === "string" ? (a.config.tone as string) : "",
      status: !a.enabled ? "disabled" : last?.status === "running" ? "running" : last?.status === "error" ? "error" : "ok",
      active: !!last && now - new Date(last.started_at).getTime() < 2 * 60 * 60 * 1000,
      unread: findList.filter((f) => f.agent_id === a.id && !f.consumed_at).length,
      lastRun: when(a.last_run_at),
      nextRun: a.enabled ? when(a.next_run_at) : null,
      runs: myRuns.slice(0, 5).map((r) => ({ when: when(r.started_at) ?? "", status: r.status, error: r.error, findings: r.findings_count })),
      findings: findList.filter((f) => f.agent_id === a.id).slice(0, 5).map((f) => ({ id: f.id, title: f.title, importance: f.importance, when: when(f.created_at) ?? "" })),
    };
  });

  const reportList = ((reports ?? []) as { id: string; kind: string; title: string; headline: string; sections: ReportSection[]; created_at: string; read_at: string | null }[]).map((r) => ({
    id: r.id,
    title: r.title,
    headline: r.headline,
    sections: Array.isArray(r.sections) ? r.sections : [],
    when: when(r.created_at) ?? "",
    unread: !r.read_at,
    kind: r.kind,
  }));
  const lastBriefing = reportList.find((r) => r.kind === "briefing");

  return (
    <main className="main">
      <PageHeader icon="agents" title="AI Agents" lede="Each agent does one job on a schedule and reports to The BRIAN. Tap one to change it." />
      {!aiReady ? <AiNotice /> : null}
      <div className="note-actions">
        <Link href="/assistant" className="btn btn-dark">
          <Icon name="sparkle" size={16} />
          Ask The BRIAN
        </Link>
      </div>
      <AgentsHub
        agents={hub}
        reports={reportList}
        sources={SOURCES}
        brianStatus={`${lastBriefing ? `Last briefing ${lastBriefing.when}` : "No briefing yet"} · ${reportList.filter((r) => r.unread).length} unread`}
      />
    </main>
  );
}
