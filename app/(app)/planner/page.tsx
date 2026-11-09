import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { hscSentence } from "@/lib/hsc-dates";
import { getMySubjects } from "@/lib/my-subjects";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, isDayKey, mondayOf, sydneyInstant } from "@/lib/time";
import { PlannerClient, type Block } from "./PlannerClient";
import { WeekPlanner, type DatedBlock } from "./WeekPlanner";

export const metadata: Metadata = { title: "Study planner" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { searchParams: Promise<{ week?: string }> };

export default async function PlannerPage({ searchParams }: Props) {
  const { week } = await searchParams;
  const today = dayKey(Date.now());
  const monday = mondayOf(isDayKey(week) ? week : today);
  const nextMonday = addDays(monday, 7);

  const supabase = await createClient();
  const [{ data: repeating }, { data: dated }, { data: plan }] = await Promise.all([
    supabase
      .from("study_blocks")
      .select("id, day_of_week, start_min, duration_min, subject, label")
      .not("day_of_week", "is", null)
      .order("day_of_week", { ascending: true })
      .order("start_min", { ascending: true }),
    supabase
      .from("study_blocks")
      .select("id, starts_at, ends_at, subject, topic, kind, source, done, notes")
      .not("starts_at", "is", null)
      .gte("starts_at", new Date(sydneyInstant(monday)).toISOString())
      .lt("starts_at", new Date(sydneyInstant(nextMonday)).toISOString())
      .order("starts_at", { ascending: true }),
    supabase.from("study_plans").select("title, rationale").eq("week_start", monday).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <main className="main">
      <PageHeader
        icon="planner"
        title="Study planner"
        lede="Your study week in Sydney time. Add blocks yourself, or let The BRIAN plan the week around your classes, shifts and sleep."
      />
      <p className="card-meta">{hscSentence(Date.now())}</p>

      <nav className="week-nav" aria-label="Choose a week">
        <Link className="btn" href={`/planner?week=${addDays(monday, -7)}`} aria-label="Previous week">
          ← Prev
        </Link>
        <div className="week-nav-label">
          <strong>
            {formatDayKey(monday)} – {formatDayKey(addDays(monday, 6))}
          </strong>
          {monday !== mondayOf(today) ? (
            <Link href="/planner" className="card-link">
              Back to this week
            </Link>
          ) : (
            <span className="card-meta">This week</span>
          )}
        </div>
        <Link className="btn" href={`/planner?week=${nextMonday}`} aria-label="Next week">
          Next →
        </Link>
      </nav>

      <WeekPlanner
        key={monday}
        weekStart={monday}
        blocks={(dated ?? []) as DatedBlock[]}
        plan={plan ? { title: plan.title as string, rationale: plan.rationale as string } : null}
      />

      <h2 className="card-title" style={{ marginTop: 8 }}>
        Every week
      </h2>
      <p className="lede" style={{ marginTop: -8 }}>
        Repeating blocks happen at the same time every week, on top of the plan above.
      </p>
      <PlannerClient blocks={(repeating ?? []) as Block[]} courses={await getMySubjects()} />
    </main>
  );
}
