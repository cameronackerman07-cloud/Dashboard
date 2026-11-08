import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { BASICS_LINKS, MONEY_BASICS, parseSituation } from "@/lib/money-ideas";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";
import { MoneyIdeasClient, type IdeaRow } from "./MoneyIdeasClient";

export const metadata: Metadata = { title: "Money ideas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MoneyIdeasPage() {
  const supabase = await createClient();
  const [{ data: ideas, error }, { data: agent }, { data: logs }] = await Promise.all([
    supabase.from("money_ideas").select("*").order("score", { ascending: false }).limit(200),
    supabase.from("agents").select("config").eq("slug", "opportunities").maybeSingle(),
    supabase.from("money_idea_log").select("idea_id, hours, earned_cents").limit(2000),
  ]);
  const totals: Record<string, { hours: number; cents: number }> = {};
  for (const l of (logs ?? []) as { idea_id: string; hours: number; earned_cents: number }[]) {
    const t = (totals[l.idea_id] ??= { hours: 0, cents: 0 });
    t.hours += Number(l.hours);
    t.cents += l.earned_cents;
  }

  return (
    <main className="main main-narrow">
      <PageHeader icon="ideas" title="Money ideas" lede="Easy, safe ways to earn that fit around school, ranked for you. Every amount is a rough estimate." />
      <MoneyIdeasClient
        ready={!error}
        ideas={(ideas ?? []) as IdeaRow[]}
        totals={totals}
        situation={parseSituation((agent?.config as Record<string, unknown> | undefined)?.situation)}
        basics={MONEY_BASICS}
        basicsLinks={BASICS_LINKS}
        today={dayKey(Date.now())}
      />
    </main>
  );
}
