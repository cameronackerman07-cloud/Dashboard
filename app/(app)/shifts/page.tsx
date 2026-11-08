import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { formatCents } from "@/lib/money";
import { clashingIds, formatHours, shiftPayNote, totals, type Job, type Shift } from "@/lib/shifts";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, isDayKey, mondayOf, sydneyInstant } from "@/lib/time";
import { ShiftsClient } from "./ShiftsClient";

export const metadata: Metadata = { title: "Shifts" };

type Props = { searchParams: Promise<{ week?: string }> };

export default async function ShiftsPage({ searchParams }: Props) {
  const { week } = await searchParams;
  const today = dayKey(Date.now());
  const monday = mondayOf(isDayKey(week) ? week : today);
  const nextMonday = addDays(monday, 7);

  const supabase = await createClient();
  const [{ data: jobs }, { data: shifts }, { data: logged }] = await Promise.all([
    supabase.from("jobs").select("*").order("created_at", { ascending: true }),
    supabase
      .from("shifts")
      .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents, notes")
      .gte("starts_at", new Date(sydneyInstant(monday)).toISOString())
      .lt("starts_at", new Date(sydneyInstant(nextMonday)).toISOString())
      .order("starts_at", { ascending: true }),
    supabase.from("transactions").select("id").eq("note", shiftPayNote(monday)).limit(1),
  ]);

  const jobList = (jobs ?? []) as Job[];
  const shiftList = (shifts ?? []) as Shift[];
  const sum = totals(shiftList, jobList);
  const clashes = clashingIds(shiftList);

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="shifts"
        title="Shifts"
        lede="Your work, sport and gig shifts by week, with hours and estimated pay before tax."
      />

      <nav className="week-nav" aria-label="Choose a week">
        <Link className="btn" href={`/shifts?week=${addDays(monday, -7)}`} aria-label="Previous week">
          ← Prev
        </Link>
        <div className="week-nav-label">
          <strong>
            {formatDayKey(monday)} – {formatDayKey(addDays(monday, 6))}
          </strong>
          {monday !== mondayOf(today) ? (
            <Link href="/shifts" className="card-link">
              Back to this week
            </Link>
          ) : (
            <span className="card-meta">This week</span>
          )}
        </div>
        <Link className="btn" href={`/shifts?week=${nextMonday}`} aria-label="Next week">
          Next →
        </Link>
      </nav>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Hours</span>
          <span className="stat-value">{formatHours(sum.minutes)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Estimated pay</span>
          <span className="stat-value">{formatCents(sum.cents)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Shifts</span>
          <span className="stat-value">{shiftList.length}</span>
        </div>
      </div>

      <ShiftsClient
        jobs={jobList}
        shifts={shiftList}
        clashes={[...clashes]}
        monday={monday}
        today={today}
        weekPayCents={sum.cents}
        payLogged={(logged ?? []).length > 0}
      />
    </main>
  );
}
