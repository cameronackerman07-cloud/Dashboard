import Link from "next/link";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHeader } from "@/components/PageHeader";
import type { ReportSection } from "@/lib/agents/types";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate, formatTime } from "@/lib/time";
import { InboxClient, type InboxReport } from "./InboxClient";

export const metadata: Metadata = { title: "Inbox" };

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function InboxPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const found = tab === "found";
  const supabase = await createClient();
  const [{ data: reports }, { data: agents }, { data: findings }] = await Promise.all([
    supabase.from("reports").select("id, kind, title, headline, sections, created_at, read_at").order("created_at", { ascending: false }).limit(60),
    supabase.from("agents").select("id, name"),
    found
      ? supabase.from("agent_findings").select("id, agent_id, title, body, importance, action_url, created_at, consumed_at").order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const names = new Map(((agents ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));

  const list: InboxReport[] = ((reports ?? []) as { id: string; kind: string; title: string; headline: string; sections: ReportSection[]; created_at: string; read_at: string | null }[]).map((r) => {
    const t = new Date(r.created_at).getTime();
    return { id: r.id, kind: r.kind, title: r.title, headline: r.headline, sections: Array.isArray(r.sections) ? r.sections : [], when: `${formatShortDate(t)} ${formatTime(t)}`, unread: !r.read_at };
  });

  type F = { id: string; agent_id: string; title: string; body: string; importance: number; action_url: string | null; created_at: string; consumed_at: string | null };
  const byAgent = new Map<string, F[]>();
  for (const f of (findings ?? []) as F[]) byAgent.set(f.agent_id, [...(byAgent.get(f.agent_id) ?? []), f]);

  return (
    <main className="main main-narrow">
      <AutoRefresh />
      <PageHeader icon="inbox" title="Inbox" lede="Briefings, resets and alerts from The BRIAN, plus everything your agents found." />
      <nav className="seg" aria-label="Inbox view">
        <Link href="/inbox" className={`seg-btn seg-link${found ? "" : " is-active"}`} aria-current={found ? undefined : "page"}>
          Reports
        </Link>
        <Link href="/inbox?tab=found" className={`seg-btn seg-link${found ? " is-active" : ""}`} aria-current={found ? "page" : undefined}>
          What each agent found
        </Link>
      </nav>
      {found ? (
        byAgent.size === 0 ? (
          <section className="card">
            <p className="track-empty">Nothing yet. Agents add findings as they run.</p>
          </section>
        ) : (
          [...byAgent.entries()].map(([agentId, items]) => (
            <section className="card" key={agentId} aria-label={names.get(agentId) ?? "Agent"}>
              <div className="card-head">
                <h2 className="card-title">{names.get(agentId) ?? "An agent"}</h2>
                <span className="card-meta">{items.length}</span>
              </div>
              <div className="track-list">
                {items.map((f) => (
                  <div className="task" key={f.id}>
                    <div className="task-body">
                      <span className="task-title">{f.action_url ? <Link href={f.action_url}>{f.title}</Link> : f.title}</span>
                      {f.body ? <span className="task-sub">{f.body}</span> : null}
                      <span className="task-sub">
                        {formatShortDate(new Date(f.created_at).getTime())}
                        {f.consumed_at ? " · reported" : ""}
                      </span>
                    </div>
                    {f.importance >= 4 ? <span className="chip">{f.importance === 5 ? "URGENT" : "IMPORTANT"}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          ))
        )
      ) : (
        <InboxClient reports={list} />
      )}
    </main>
  );
}
