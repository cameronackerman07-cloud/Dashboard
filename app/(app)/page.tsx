import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DueSoon } from "@/components/DueSoon";
import { Greeting } from "@/components/Greeting";
import { getSchool } from "@/lib/my-subjects";
import { HscCountdown, type CountdownDate } from "@/components/HscCountdown";
import { timetableReleased } from "@/lib/hsc-dates";
import { studySummary } from "@/lib/study-sessions";
import { hoursText } from "@/lib/study-time";
import { Icon } from "@/components/Icon";
import { SpotifyTile } from "@/components/SpotifyTile";
import { getCalendarConnections, loadEvents } from "@/lib/calendar";
import { AUTO_SYNC_MS, syncCanvas } from "@/lib/canvas";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { shiftPayCents, type Job, type Shift } from "@/lib/shifts";
import type { DbTask } from "@/lib/tasks";
import { addDays, dayKey, formatDay, formatDayKey, formatTime, mondayOf, startOfDay, sydneyInstant, weekday } from "@/lib/time";

type TodayRow = { key: string; slot: string; name: string; sub: string | null; chip: "NOW" | "NEXT" | null };

export default async function Home() {
  const profile = await getProfile();
  const school = await getSchool();
  // New Canvas work first, so "Due soon" includes it (at most every 30 minutes).
  await syncCanvas({ maxAgeMs: AUTO_SYNC_MS });
  const supabase = await createClient();
  const now = Date.now();
  const todayKey = dayKey(now);
  const monday = mondayOf(todayKey);
  const [{ data }, { events }, connections, { data: manual }, { data: todos }, { data: nextShifts }, { data: habits }, { data: habitLogs }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, course, source, due_at, done")
        .eq("done", false)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(5),
      loadEvents(startOfDay(now), startOfDay(now, 1)),
      getCalendarConnections(),
      supabase
        .from("timetable")
        .select("id, period, subject, room")
        .eq("day_of_week", weekday(now))
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("todos")
        .select("id, title, subject, due_on")
        .eq("done", false)
        .not("due_on", "is", null)
        .order("due_on", { ascending: true })
        .limit(5),
      supabase
        .from("shifts")
        .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents, notes")
        .gt("ends_at", new Date(now).toISOString())
        .order("starts_at", { ascending: true })
        .limit(1),
      supabase.from("habits").select("id, name").eq("archived", false).order("created_at", { ascending: true }).limit(6),
      supabase.from("habit_logs").select("habit_id, day").gte("day", monday).lte("day", addDays(monday, 6)),
    ]);

  // Due soon: school tasks and dated to-dos together, soonest first.
  const todoItems: DbTask[] = ((todos ?? []) as { id: string; title: string; subject: string | null; due_on: string }[]).map((t) => ({
    id: `todo-${t.id}`,
    title: t.title,
    course: t.subject,
    source: "todo",
    due_at: new Date(sydneyInstant(t.due_on, "23:59")).toISOString(),
    done: false,
  }));
  const dueSoon: DbTask[] = [...((data ?? []) as DbTask[]), ...todoItems]
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"))
    .slice(0, 6);

  // Next shift (or the one on now), with its job for the name and pay.
  const nextShift = ((nextShifts ?? []) as Shift[])[0] ?? null;
  const { data: latestBriefing } = await supabase
    .from("reports")
    .select("headline, created_at")
    .eq("kind", "briefing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: nextJob } = nextShift
    ? await supabase.from("jobs").select("id, name, default_rate_cents, kind").eq("id", nextShift.job_id).maybeSingle()
    : { data: null };

  // HSC countdown: my own key dates and total external study.
  const [{ data: dateRows }, study] = await Promise.all([
    supabase.from("key_dates").select("id, title, starts_at, kind, course, pinned").gte("starts_at", new Date(startOfDay(now)).toISOString()).order("starts_at", { ascending: true }).limit(20),
    profile ? studySummary(supabase, profile.id, now) : Promise.resolve({ total: 0 }),
  ]);
  const keyDates = ((dateRows ?? []) as { id: string; title: string; starts_at: string; kind: string; course: string | null; pinned: boolean }[]).map((d) => ({
    id: d.id,
    title: d.title,
    day: dayKey(new Date(d.starts_at).getTime()),
    kind: d.kind,
    course: d.course,
    pinned: d.pinned,
  }));
  const firstExam: CountdownDate | null = keyDates.find((d) => d.kind === "exam") ?? null;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const logged = new Set(((habitLogs ?? []) as { habit_id: string; day: string }[]).map((l) => `${l.habit_id}|${l.day}`));


  // Today's classes: from the connected calendar if there is one, otherwise the
  // classes added by hand on the Timetable page.
  let today: TodayRow[];
  let todaySource: string;
  if (events.length > 0) {
    const timed = events.filter((e) => !e.allDay);
    const nextIndex = timed.findIndex((e) => e.start > now);
    today = [
      ...events
        .filter((e) => e.allDay)
        .map((e) => ({ key: e.id, slot: "All day", name: e.title, sub: null, chip: null })),
      ...timed.map((e, i) => ({
        key: e.id,
        slot: formatTime(e.start),
        name: e.title,
        sub: e.location,
        chip: e.start <= now && e.end > now ? ("NOW" as const) : i === nextIndex ? ("NEXT" as const) : null,
      })),
    ];
    todaySource = connections.map((c) => c.name).join(" + ") || "Imported calendar";
  } else {
    today = (manual ?? []).map((c: { id: string; period: string | null; subject: string; room: string | null }) => ({
      key: c.id,
      slot: c.period ?? "",
      name: c.subject,
      sub: c.room,
      chip: null,
    }));
    todaySource = "Your timetable";
  }
  // Only the first upcoming class is "next", and only if nothing is on now.
  if (today.some((r) => r.chip === "NOW")) {
    today = today.map((r) => (r.chip === "NEXT" ? { ...r, chip: null } : r));
  }

  return (
    <main className="main">
      <div className="page-head">
        <AutoRefresh />
        <Greeting name={profile?.displayName ?? "there"} />
        <button type="button" className="icon-btn desktop-only" aria-label="Notifications">
          <Icon name="bell" />
        </button>
      </div>


      <form className="ask" action="/assistant">
        <label>
          <Icon name="sparkle" />
          <span className="sr-only">Ask The BRIAN</span>
          <input name="q" type="text" placeholder="Ask The BRIAN, or tell it what to do: “make me a study plan for this week”" />
        </label>
        <span className="ask-meta">Free models · auto</span>
        <button type="submit" className="btn btn-dark" style={{ minHeight: 40 }}>
          Ask
        </button>
      </form>

      <section className="card briefing" aria-label="Your briefing">
        <div className="briefing-body">
          <div className="briefing-label">
            <Icon name="sparkle" size={16} />
            Your briefing
          </div>
          <p className="briefing-text">
            {latestBriefing?.headline || "No briefing yet. The BRIAN writes one each morning at 7 once your agents are running."}
          </p>
          {latestBriefing ? <span className="card-meta">{formatDay(new Date(latestBriefing.created_at).getTime())}</span> : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/inbox" className="btn">
            Open Inbox
          </Link>
        </div>
      </section>

      <div className="grid">
        <section className="card" aria-label="Today's timetable">
          <div className="card-head">
            <h2 className="card-title">Today</h2>
            <Link href={connections.length ? "/calendar" : "/timetable"} className="card-link">
              {todaySource}
            </Link>
          </div>
          {today.length === 0 ? (
            <p className="track-empty">
              Nothing on today.{" "}
              {connections.length ? null : (
                <>
                  <Link href="/settings">Connect Sentral or Atlantis</Link> or{" "}
                  <Link href="/timetable">add your classes</Link> to see your day here.
                </>
              )}
            </p>
          ) : (
            <div className="rows">
              {today.map((p) => (
                <div className="row" key={p.key}>
                  <span className="row-slot">{p.slot}</span>
                  <span className="row-main">
                    {p.name}
                    {p.sub ? <span className="task-sub"> · {p.sub}</span> : null}
                  </span>
                  {p.chip ? <span className="chip">{p.chip}</span> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Due soon">
          <div className="card-head">
            <h2 className="card-title">Due soon</h2>
            <Link href="/assignments" className="card-link">
              All tasks
            </Link>
          </div>
          <DueSoon tasks={dueSoon} />
        </section>

        {/* The HSC countdown is for Years 11–12; Years 7–10 skip it. */}
        {(school.year ?? 12) >= 11 ? (
          <HscCountdown
            serverNow={now}
            firstExam={firstExam}
            dates={keyDates.filter((d) => d.pinned || d.kind !== "term").slice(0, 4)}
            totalStudy={hoursText(study.total)}
            released={timetableReleased(now)}
          />
        ) : null}

        <section className="card" aria-label="Quick actions">
          <h2 className="card-title">Quick actions</h2>
          <div className="actions">
            <Link href="/hsc-practice" className="action">
              <Icon name="hsc" size={18} />
              HSC question
            </Link>
            <Link href="/summaries" className="action">
              <Icon name="summaries" size={18} />
              Upload notes
            </Link>
            <Link href="/timer" className="action">
              <Icon name="timer" size={18} />
              Study timer
            </Link>
            <Link href="/tutor" className="action">
              <Icon name="tutor" size={18} />
              Ask the tutor
            </Link>
          </div>
        </section>

        <section className="card" aria-label="Habits">
          <div className="card-head">
            <h2 className="card-title">Habits this week</h2>
            <span className="card-meta" aria-hidden="true">
              M T W T F S S
            </span>
          </div>
          {(habits ?? []).length === 0 ? (
            <p className="track-empty" style={{ fontSize: 13 }}>
              No habits yet. <Link href="/habits">Add one</Link> to track your streaks.
            </p>
          ) : (
            ((habits ?? []) as { id: string; name: string }[]).map((h) => {
              const count = weekDays.filter((d) => logged.has(`${h.id}|${d}`)).length;
              return (
                <div key={h.id} className="habit-home">
                  <span className="habit-home-name">{h.name}</span>
                  <span className="dots" role="img" aria-label={`${count} of 7 days done this week`}>
                    {weekDays.map((d) => (
                      <span key={d} className={`dot${logged.has(`${h.id}|${d}`) ? " on" : ""}`} />
                    ))}
                  </span>
                </div>
              );
            })
          )}
          <Link href="/habits" className="card-link">
            Open habits →
          </Link>
        </section>

        <section className="card" aria-label="Next shift">
          <h2 className="card-title">Next shift</h2>
          {nextShift ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>
                {new Date(nextShift.starts_at).getTime() <= now
                  ? `On now until ${formatTime(new Date(nextShift.ends_at).getTime())}`
                  : dayKey(new Date(nextShift.starts_at).getTime()) === todayKey
                    ? `Today ${formatTime(new Date(nextShift.starts_at).getTime())}`
                    : `${formatDayKey(dayKey(new Date(nextShift.starts_at).getTime()))} ${formatTime(new Date(nextShift.starts_at).getTime())}`}
              </span>
              <span className="card-meta">
                {[
                  nextJob?.name,
                  `${formatTime(new Date(nextShift.starts_at).getTime())} – ${formatTime(new Date(nextShift.ends_at).getTime())}`,
                  `about ${formatCents(shiftPayCents(nextShift, (nextJob ?? undefined) as Job | undefined))}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>No shifts coming up</span>
              <span className="card-meta">Add your roster in Shifts to see your next shift and pay.</span>
            </div>
          )}
          <Link href="/shifts" className="card-link">
            Open shifts →
          </Link>
        </section>

        <section className="card tile-row" aria-label="Weather">
          <Icon name="sun" size={44} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Weather</span>
            <span className="card-meta">Switches on with your suburb in Settings</span>
          </div>
        </section>

        <SpotifyTile />
      </div>
    </main>
  );
}
