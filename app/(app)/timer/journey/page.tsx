import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { SESSION_COLUMNS } from "@/lib/study-sessions";
import { bySubject, dailyTotals, hoursText, streaks, sumBetween, type StudySession } from "@/lib/study-time";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, daysBetween, formatDayKey, mondayOf } from "@/lib/time";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "HSC journey" };
export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const db = await createClient();
  const { data } = await db.from("study_sessions").select(SESSION_COLUMNS).in("status", ["completed", "auto_closed"]).order("started_at", { ascending: true }).limit(20_000);
  const sessions = (data ?? []) as StudySession[];
  const days = dailyTotals(sessions);
  const today = dayKey(Date.now());
  const keys = [...days.keys()].sort();
  const first = keys[0] ?? null;
  const total = [...days.values()].reduce((a, b) => a + b, 0);
  const subjects = bySubject(sessions);

  // Busiest week.
  let busiest: { week: string; seconds: number } | null = null;
  if (first) {
    for (let w = mondayOf(first); w <= today; w = addDays(w, 7)) {
      const s = sumBetween(days, w, addDays(w, 7));
      if (!busiest || s > busiest.seconds) busiest = { week: w, seconds: s };
    }
  }
  const weeks = first ? Math.max(1, Math.ceil((daysBetween(mondayOf(first), today) + 1) / 7)) : 0;
  const streak = streaks(days, today);

  return (
    <main className="main main-narrow">
      <PageHeader icon="timer" title="HSC journey" lede="A summary of every hour of external study you've logged. Print it or save the data." />
      <div className="note-actions no-print">
        <PrintButton />
        <a className="btn" href="/api/timer/export?format=csv" download>
          Export CSV
        </a>
        <a className="btn" href="/api/timer/export?format=json" download>
          Download JSON
        </a>
        <Link className="btn" href="/timer">
          Back to Timer
        </Link>
      </div>

      <section className="card" aria-label="Totals">
        <div className="stat-row stat-row-4">
          <div className="stat stat-big">
            <span className="stat-label">Total external study</span>
            <span className="stat-value">{hoursText(total)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Average per week</span>
            <span className="stat-value">{weeks ? hoursText(total / weeks) : "0 min"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Busiest week</span>
            <span className="stat-value">{busiest && busiest.seconds ? hoursText(busiest.seconds) : "None yet"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Longest streak</span>
            <span className="stat-value">
              {streak.best} day{streak.best === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <p className="card-meta">
          {first ? `From ${formatDayKey(first)} ${first.slice(0, 4)} to ${formatDayKey(today)} ${today.slice(0, 4)}, ${sessions.length} sessions.` : "No sessions yet."}
          {busiest && busiest.seconds ? ` Busiest week: the week of ${formatDayKey(busiest.week)} ${busiest.week.slice(0, 4)}.` : ""}
        </p>
      </section>

      <section className="card" aria-label="By subject">
        <h2 className="card-title">By subject</h2>
        <table className="plain-table">
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Hours</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.subject}>
                <td>{s.subject}</td>
                <td>{hoursText(s.seconds)}</td>
                <td>{total ? `${Math.round((s.seconds / total) * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
