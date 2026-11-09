import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { loadEvents } from "@/lib/calendar";
import { busyIntervals, expand, prefsFrom, type LifeItem } from "@/lib/life";
import { scoreWeek } from "@/lib/planner/balance";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, isDayKey, mondayOf, sydneyInstant, weekdayOfKey } from "@/lib/time";
import { LifeClient, type WeekRow } from "./LifeClient";

export const metadata: Metadata = { title: "My life" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function LifePage({ searchParams }: { searchParams: Promise<{ week?: string; check?: string }> }) {
  const { week, check } = await searchParams;
  const today = dayKey(Date.now());
  const monday = mondayOf(isDayKey(week) ? week : today);
  const from = sydneyInstant(monday);
  const to = sydneyInstant(addDays(monday, 7));
  const iso = (ms: number) => new Date(ms).toISOString();
  const db = await createClient();

  const [{ data: items }, { data: prefRow }, { data: shifts }, { data: jobs }, { data: blocks }, { data: classes }, { data: plans }, links] = await Promise.all([
    db.from("life_items").select("*").order("created_at", { ascending: true }).limit(500),
    db.from("life_preferences").select("*").maybeSingle(),
    db.from("shifts").select("id, job_id, starts_at, ends_at").lt("starts_at", iso(to)).gt("ends_at", iso(from)),
    db.from("jobs").select("id, name"),
    db.from("study_blocks").select("id, subject, topic, kind, starts_at, ends_at, done").not("starts_at", "is", null).lt("starts_at", iso(to)).gt("ends_at", iso(from)),
    db.from("timetable").select("id, day_of_week, period, subject").limit(200),
    db.from("study_plans").select("created_at").eq("week_start", monday).eq("status", "active").order("created_at", { ascending: false }).limit(1),
    loadEvents(from, to).catch(() => ({ events: [] as { id: string; title: string; start: number; end: number; allDay: boolean }[] })),
  ]);

  const list = (items ?? []) as (LifeItem & { updated_at: string })[];
  const prefs = prefsFrom(prefRow as never);
  const occ = expand(list, from, to, monday, 7);
  const title = new Map(list.map((i) => [i.id, i.title]));
  const jobName = new Map(((jobs ?? []) as { id: string; name: string }[]).map((j) => [j.id, j.name]));
  const study = ((blocks ?? []) as { id: string; subject: string | null; topic: string | null; kind: string; starts_at: string; ends_at: string; done: boolean }[]).map((b) => ({
    ...b,
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));
  const shiftSpans = ((shifts ?? []) as { id: string; job_id: string; starts_at: string; ends_at: string }[]).map((s) => ({ ...s, start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() }));
  const balance = scoreWeek({ weekStart: monday, prefs, study, life: occ, shifts: shiftSpans });

  const rows: WeekRow[] = [
    ...occ.map((o) => ({ key: `l-${o.itemId}-${o.start}`, kind: "life" as const, id: o.itemId, title: title.get(o.itemId) ?? "Plan", start: o.start, end: o.end, category: o.category, status: o.status })),
    ...shiftSpans.map((s) => ({ key: `s-${s.id}`, kind: "shift" as const, id: s.id, title: jobName.get(s.job_id) ?? "Shift", start: s.start, end: s.end })),
    ...study.map((b) => ({ key: `b-${b.id}`, kind: "study" as const, id: b.id, title: b.kind === "rest" ? "Rest" : `${b.subject ?? "Study"}${b.topic ? ` · ${b.topic}` : ""}`, start: b.start, end: b.end })),
    ...links.events.filter((e) => !e.allDay).map((e) => ({ key: `e-${e.id}`, kind: "event" as const, id: e.id, title: e.title, start: e.start, end: e.end })),
  ];
  const classRows = ((classes ?? []) as { id: string; day_of_week: number; period: string | null; subject: string }[]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => ({
    day: d,
    label: formatDayKey(d),
    classes: classRows.filter((c) => c.day_of_week === weekdayOfKey(d)).map((c) => [c.period, c.subject].filter(Boolean).join(" ")),
    rows: rows.filter((r) => dayKey(r.start) === d).sort((a, b) => a.start - b.start),
  }));

  // "Your week changed": plans edited since this week's study plan was made, or study blocks that now clash.
  const planAt = (plans ?? [])[0] ? new Date((plans![0] as { created_at: string }).created_at).getTime() : null;
  const lastEdit = Math.max(0, ...list.map((i) => new Date(i.updated_at ?? 0).getTime()));
  const busy = busyIntervals(occ);
  const clashing = study.filter((b) => !b.done && b.kind !== "rest" && busy.some((x) => b.start < x.end && b.end > x.start));
  const changed = !!planAt && (lastEdit > planAt || clashing.length > 0);

  return (
    <main className="main">
      <PageHeader icon="life" title="My life" lede="Training, family, friends, work and downtime. Study fits around your life, and your week stays balanced." />
      <nav className="week-nav" aria-label="Choose a week">
        <Link className="btn" href={`/life?week=${addDays(monday, -7)}`} aria-label="Previous week">
          ← Prev
        </Link>
        <div className="week-nav-label">
          <strong>
            {formatDayKey(monday)} – {formatDayKey(addDays(monday, 6))}
          </strong>
          {monday !== mondayOf(today) ? (
            <Link href="/life" className="card-link">
              Back to this week
            </Link>
          ) : (
            <span className="card-meta">This week</span>
          )}
        </div>
        <Link className="btn" href={`/life?week=${addDays(monday, 7)}`} aria-label="Next week">
          Next →
        </Link>
      </nav>
      {changed ? (
        <div className="notice" role="status">
          <span>
            Your week changed{clashing.length ? `: ${clashing.length} study block${clashing.length === 1 ? " now clashes" : "s now clash"} with your plans (${clashing.map((b) => `${b.subject ?? "Study"} ${formatDayKey(dayKey(b.start))}`).join(", ")})` : ""}. Update the study plan?
          </span>
          <Link href={`/planner?week=${monday}`} className="btn btn-small">
            Preview a new plan
          </Link>
        </div>
      ) : null}
      <LifeClient
        days={days}
        items={list.map(({ updated_at: _u, ...i }) => i)}
        balance={balance}
        prefs={prefs}
        hasPrefs={!!prefRow}
        today={today}
        checkId={check ?? null}
      />
    </main>
  );
}
