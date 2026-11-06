import Link from "next/link";
import { DueSoon } from "@/components/DueSoon";
import { Greeting } from "@/components/Greeting";
import { Icon } from "@/components/Icon";
import { getCalendarConnections, loadEvents } from "@/lib/calendar";
import { AUTO_SYNC_MS, syncCanvas } from "@/lib/canvas";
import { createClient } from "@/lib/supabase/server";
import { SAMPLE_HABITS } from "@/lib/sample";
import type { DbTask } from "@/lib/tasks";
import { formatTime, startOfDay, weekday } from "@/lib/time";

type TodayRow = { key: string; slot: string; name: string; sub: string | null; chip: "NOW" | "NEXT" | null };

export default async function Home() {
  // New Canvas work first, so "Due soon" includes it (at most every 30 minutes).
  await syncCanvas({ maxAgeMs: AUTO_SYNC_MS });
  const supabase = await createClient();
  const now = Date.now();
  const [{ data }, { events }, connections, { data: manual }] = await Promise.all([
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
  ]);
  const dueSoon: DbTask[] = data ?? [];

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
        <Greeting name="Cameron" />
        <button type="button" className="icon-btn desktop-only" aria-label="Notifications">
          <Icon name="bell" />
        </button>
      </div>

      <div className="notice" role="note">
        <span>Showing sample data. Connect Canvas, Google and your other apps to fill this in.</span>
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

      <section className="card briefing" aria-label="Morning briefing">
        <div className="briefing-body">
          <div className="briefing-label">
            <Icon name="sparkle" size={16} />
            Your briefing
          </div>
          <p className="briefing-text">
            Physics is your next class. Your Maths Advanced practice set is due Thursday, and you have a shift
            tonight — so the planner has moved 30 minutes of Extension 1 flashcards to before dinner.
          </p>
          <span className="card-meta">Example — the AI agent writes this each morning and sends it to your iPhone.</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/planner" className="btn">
            See study plan
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
            <span className="card-meta">M T W T F S S</span>
          </div>
          {SAMPLE_HABITS.map((h) => (
            <div key={h.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{h.name}</span>
              <span className="dots" aria-label={`${h.done} of 7 days done`}>
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} className={`dot${i < h.done ? " on" : ""}`} />
                ))}
              </span>
            </div>
          ))}
        </section>

        <section className="card" aria-label="Next shift">
          <h2 className="card-title">Next shift</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>Not connected yet</span>
            <span className="card-meta">Add your roster in Shifts to see your next shift and pay.</span>
          </div>
          <Link href="/shifts" className="card-link">
            Set up shifts →
          </Link>
        </section>

        <section className="card tile-row" aria-label="Weather">
          <Icon name="sun" size={44} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Weather</span>
            <span className="card-meta">Switches on with your suburb in Settings</span>
          </div>
        </section>

        <section className="card tile-row" aria-label="Spotify">
          <span className="album">
            <Icon name="music" size={22} />
          </span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Nothing playing</span>
            <span className="card-meta">Spotify · connect in Settings</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Play" style={{ borderRadius: 22 }}>
            <Icon name="play" size={18} />
          </button>
        </section>
      </div>
    </main>
  );
}
