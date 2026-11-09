import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { countdownLabel, HSC_DATES } from "@/lib/hsc-dates";
import { activeSession, SESSION_COLUMNS } from "@/lib/study-sessions";
import {
  bySubject,
  dailyTotals,
  heatLevel,
  hoursText,
  projection,
  streaks,
  sumBetween,
  weeklyTotals,
  type StudySession,
} from "@/lib/study-time";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";
import { addDays, dayKey, formatDayKey, formatShortDate, formatTime, mondayOf, sydneyInstant } from "@/lib/time";
import { TimerClient, type BlockOption, type TimerSettings } from "./TimerClient";
import { HistoryList, ManualEntry, SettingsForm } from "./TimerForms";

export const metadata: Metadata = { title: "Timer" };
export const dynamic = "force-dynamic";

export default async function TimerPage({ searchParams }: { searchParams: Promise<{ block?: string }> }) {
  const { block } = await searchParams;
  const userId = await currentUserId();
  const db = await createClient();
  const now = Date.now();
  const today = dayKey(now);
  const monday = mondayOf(today);

  const active = userId ? await activeSession(db, userId, now) : null;
  const [{ data: rows }, { data: settingsRow }, { data: blocks }, { data: terms }] = await Promise.all([
    db.from("study_sessions").select(SESSION_COLUMNS).in("status", ["completed", "auto_closed"]).order("started_at", { ascending: false }).limit(5000),
    db.from("study_settings").select("*").maybeSingle(),
    db
      .from("study_blocks")
      .select("id, subject, topic, starts_at, ends_at, done")
      .not("starts_at", "is", null)
      .gte("starts_at", new Date(sydneyInstant(today)).toISOString())
      .lt("starts_at", new Date(sydneyInstant(addDays(today, 2))).toISOString())
      .eq("done", false)
      .order("starts_at", { ascending: true })
      .limit(12),
    db.from("key_dates").select("title, starts_at").eq("kind", "term").lte("starts_at", new Date(now).toISOString()).order("starts_at", { ascending: false }).limit(1),
  ]);

  // A block linked from the planner may be on another day.
  const blockList = (blocks ?? []) as { id: string; subject: string | null; topic: string | null; starts_at: string; ends_at: string }[];
  if (isUuid(block) && !blockList.some((b) => b.id === block)) {
    const { data: one } = await db.from("study_blocks").select("id, subject, topic, starts_at, ends_at").eq("id", block).not("starts_at", "is", null).maybeSingle();
    if (one) blockList.unshift(one as (typeof blockList)[number]);
  }
  const sessions = (rows ?? []) as StudySession[];
  const days = dailyTotals(sessions);
  const total = [...days.values()].reduce((a, b) => a + b, 0);
  const firstDay = [...days.keys()].sort()[0] ?? null;
  const termStart = (terms ?? [])[0] ? dayKey(new Date((terms![0] as { starts_at: string }).starts_at).getTime()) : null;
  const subjects = bySubject(sessions);
  const weeks = weeklyTotals(days, today, 12);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.seconds));
  const maxSubject = Math.max(1, ...subjects.map((s) => s.seconds));
  const streak = streaks(days, today);
  const proj = projection(days, today, total, HSC_DATES.writtenStart);
  const goal = (settingsRow?.target_total_hours as number | null) ?? null;
  const hsc = countdownLabel(now);

  // 90-day heatmap, oldest first, starting on a Monday so columns are weeks.
  const heatStart = mondayOf(addDays(today, -89));
  const heatDays: string[] = [];
  for (let d = heatStart; d <= today; d = addDays(d, 1)) heatDays.push(d);

  const settings: TimerSettings = {
    defaultMinutes: (settingsRow?.default_minutes as number) ?? 25,
    breakMinutes: (settingsRow?.break_reminder_minutes as number) ?? 90,
    pomodoro: !!settingsRow?.pomodoro,
    focus: (settingsRow?.pomodoro_focus as number) ?? 25,
    short: (settingsRow?.pomodoro_short as number) ?? 5,
    long: (settingsRow?.pomodoro_long as number) ?? 15,
    sound: settingsRow?.sound !== false,
    vibration: settingsRow?.vibration !== false,
  };
  const blockOptions: BlockOption[] = blockList.map((b) => ({
    id: b.id,
    label: `${formatDayKey(dayKey(new Date(b.starts_at).getTime()))} ${formatTime(new Date(b.starts_at).getTime())} · ${b.subject ?? "Study"}${b.topic ? ` · ${b.topic}` : ""}`,
    subject: b.subject ?? "Study",
    topic: b.topic,
    minutes: Math.max(1, Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000)),
  }));

  return (
    <main className="main main-narrow">
      <PageHeader icon="timer" title="Timer" lede="Set a timer, study, and the site records exactly how long. Your external study hours add up here all the way to the HSC." />

      <TimerClient initial={active} serverNow={now} settings={settings} blocks={blockOptions} linkBlock={block ?? null} todaySeconds={days.get(today) ?? 0} />

      <section className="card" aria-label="Study hours">
        <div className="card-head">
          <h2 className="card-title">External study hours</h2>
          <Link href="/timer/journey" className="card-link">
            Journey summary →
          </Link>
        </div>
        <div className="stat-row stat-row-4">
          <Stat label="Today" value={hoursText(days.get(today) ?? 0)} />
          <Stat label="This week" value={hoursText(sumBetween(days, monday, addDays(monday, 7)))} />
          <Stat label="This term" value={termStart ? hoursText(sumBetween(days, termStart, addDays(today, 1))) : "Add term dates"} />
          <Stat label="Total" value={hoursText(total)} big />
        </div>
        <p className="card-meta">
          {firstDay ? `Total since ${formatDayKey(firstDay)} ${firstDay.slice(0, 4)}. ` : "No study logged yet. "}
          Streak: {streak.current} day{streak.current === 1 ? "" : "s"} (best {streak.best}). One day off doesn&apos;t break a streak.
          {termStart ? null : (
            <>
              {" "}
              <Link href="/key-dates">Add the start of term</Link> to see this term&apos;s hours.
            </>
          )}
        </p>
      </section>

      <section className="card" aria-label="Road to the HSC">
        <h2 className="card-title">Road to the HSC</h2>
        <p>
          <strong>{hoursText(total)}</strong> so far{goal ? ` of your ${goal}-hour goal` : ""}.{" "}
          {proj.perWeek > 0 && hsc.days > 0
            ? `At your average of the last 4 weeks (${hoursText(proj.perWeek)} a week), you'd reach about ${Math.round(proj.projected / 3600)} hours by the first HSC written exam day, ${formatShortDate(sydneyInstant(HSC_DATES.writtenStart))} ${HSC_DATES.year}.`
            : "Study for a few weeks and an estimate will appear here."}
        </p>
        {goal ? (
          <div className="bar" role="img" aria-label={`${Math.round(total / 3600)} of ${goal} hours`}>
            <span style={{ width: `${Math.min(100, (total / 3600 / goal) * 100)}%` }} />
          </div>
        ) : (
          <p className="card-meta">Set an HSC hours goal in Timer settings below to see progress.</p>
        )}
        <p className="card-meta">This is an estimate from your recent weeks, not a promise.</p>
      </section>

      <div className="grid grid-2">
        <section className="card" aria-label="Hours by subject">
          <h2 className="card-title">By subject</h2>
          {subjects.length === 0 ? (
            <p className="track-empty">Nothing yet.</p>
          ) : (
            <div className="hbars">
              {subjects.map((s) => (
                <div className="hbar" key={s.subject}>
                  <span className="hbar-label">{s.subject}</span>
                  <span className="hbar-track" aria-hidden="true">
                    <span style={{ width: `${(s.seconds / maxSubject) * 100}%` }} />
                  </span>
                  <span className="hbar-value">{hoursText(s.seconds)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Last 12 weeks">
          <h2 className="card-title">Last 12 weeks</h2>
          <div className="vbars" role="img" aria-label={`Weekly hours: ${weeks.map((w) => `week of ${formatDayKey(w.week)} ${hoursText(w.seconds)}`).join(", ")}`}>
            {weeks.map((w) => (
              <div className="vbar" key={w.week} title={`${formatDayKey(w.week)}: ${hoursText(w.seconds)}`}>
                <span className="vbar-fill" style={{ height: `${(w.seconds / maxWeek) * 100}%` }} />
                <span className="vbar-label">{formatShortDate(sydneyInstant(w.week)).split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card" aria-label="Last 90 days">
        <h2 className="card-title">Last 90 days</h2>
        <div
          className="heatmap"
          role="img"
          aria-label={`${heatDays.filter((d) => (days.get(d) ?? 0) >= 60).length} study days in the last 90 days`}
        >
          {heatDays.map((d) => (
            <span key={d} className={`heat heat-${heatLevel(days.get(d) ?? 0)}`} title={`${formatDayKey(d)}: ${hoursText(days.get(d) ?? 0)}`} />
          ))}
        </div>
        <p className="card-meta">Darker squares mean more study. Each column is a week, Monday at the top.</p>
      </section>

      <ManualEntry today={today} />
      <HistoryList sessions={sessions.slice(0, 60)} />
      <SettingsForm row={settingsRow ?? null} />
    </main>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`stat${big ? " stat-big" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
