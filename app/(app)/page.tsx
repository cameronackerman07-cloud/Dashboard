import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DueSoon } from "@/components/DueSoon";
import { Greeting } from "@/components/Greeting";
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
        <Greeting name={(await getProfile())?.displayName ?? "there"} />
        <button type="button" className="icon-btn desktop-only" aria-label="Notifications">
          <Icon name="bell" />
        </button>
      </div>

      <div className="notice" role="note">
        <span>The countdowns are examples for now. Connect Canvas and your timetable to fill in the rest.</span>
        <Link href="/settings" className="card-link">
          Open connections →
        </Link>
      </div>

      <form className="ask" action="/tutor">
        <label>
          <Icon name="sparkle" />
          <span className="sr-only">Ask AI or search</span>
          <input name="q" type="text" placeholder="Ask the AI, search notes, or type a topic to practise…" />
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

        <section className="card" aria-label="Countdowns">
          <h2 className="card-title">Countdowns</h2>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="big-number">2</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>days · Maths Adv practice set</span>
          </div>
          <div className="rows" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Engineering report</span>
              <strong>3 days</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Term 4 ends</span>
              <strong>— days</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>HSC exams</span>
              <strong>— days</strong>
            </div>
          </div>
        </section>

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
            <Link href="/planner" className="action">
              <Icon name="timetable" size={18} />
              25-min focus
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
