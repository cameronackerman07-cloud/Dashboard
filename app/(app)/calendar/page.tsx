import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { getCalendarConnections, loadEvents } from "@/lib/calendar";
import { CAL_SOURCES, collectItems, type CalItem, type CalSource } from "@/lib/calendar-merge";
import { googleEvents } from "@/lib/sources/google";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, formatDayKeyLong, formatTime, isDayKey, mondayOf, sydneyInstant } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };

type Props = { searchParams: Promise<{ view?: string; w?: string; hide?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const view = params.view === "agenda" ? "agenda" : "week";
  const today = dayKey(Date.now());
  const start = view === "week" ? mondayOf(isDayKey(params.w) ? params.w : today) : today;
  const days = Array.from({ length: view === "week" ? 7 : 14 }, (_, i) => addDays(start, i));
  const from = sydneyInstant(days[0]);
  const to = sydneyInstant(addDays(days[days.length - 1], 1));
  const hidden = new Set((params.hide ?? "").split(",").filter(Boolean));

  const userId = await currentUserId();
  const supabase = await createClient();
  const [{ events, error }, connections, mine, google] = await Promise.all([
    loadEvents(from, to),
    getCalendarConnections(),
    userId ? collectItems(supabase, userId, from, to) : Promise.resolve([] as CalItem[]),
    userId ? googleEvents(userId).catch(() => []) : Promise.resolve([]),
  ]);

  const all: CalItem[] = [
    ...events.map((e) => ({ id: `cal-${e.id}`, title: e.title, start: e.start, end: e.end, allDay: e.allDay, source: "class" as CalSource, label: "School calendar", location: e.location })),
    ...google.filter((g) => g.start < to && g.end > from).map((g) => ({ id: `g-${g.id}`, title: g.title, start: g.start, end: g.end, allDay: g.allDay, source: "google" as CalSource, label: `Google · ${g.account}`, location: g.location })),
    ...mine,
  ].filter((i) => !hidden.has(i.source));

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, w: view === "week" ? start : undefined, hide: [...hidden].join(",") || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/calendar?${p}`;
  };
  const toggle = (s: CalSource) => {
    const next = new Set(hidden);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return qs({ hide: [...next].join(",") || undefined });
  };

  const byDay = days.map((d) => {
    const s = sydneyInstant(d);
    const e = sydneyInstant(addDays(d, 1));
    return { day: d, items: all.filter((i) => i.start < e && i.end > s).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start) };
  });

  return (
    <main className="main">
      <PageHeader icon="calendar" title="Calendar" lede="Google, your school calendar, shifts, due dates and study blocks together, in Sydney time." />
      {error ? (
        <p className="ai-error" role="alert">
          {error} <Link href="/settings">Check the link in Settings</Link>
        </p>
      ) : null}
      {connections.length === 0 && google.length === 0 ? (
        <div className="notice" role="note">
          <span>Connect Google or your Sentral/Atlantis calendar in Settings to see classes and events here.</span>
          <Link href="/settings" className="card-link">
            Connect →
          </Link>
        </div>
      ) : null}

      <div className="cal-toolbar">
        <nav className="seg" aria-label="View">
          <Link className={`seg-btn seg-link${view === "week" ? " is-active" : ""}`} href={qs({ view: "week", w: start })}>
            Week
          </Link>
          <Link className={`seg-btn seg-link${view === "agenda" ? " is-active" : ""}`} href={qs({ view: "agenda", w: undefined })}>
            Agenda
          </Link>
        </nav>
        {view === "week" ? (
          <nav className="week-nav cal-weeknav" aria-label="Choose a week">
            <Link className="btn btn-small" href={qs({ w: addDays(start, -7) })} aria-label="Previous week">
              ←
            </Link>
            <strong>
              {formatDayKey(start)} – {formatDayKey(addDays(start, 6))}
            </strong>
            <Link className="btn btn-small" href={qs({ w: addDays(start, 7) })} aria-label="Next week">
              →
            </Link>
          </nav>
        ) : null}
      </div>
      <div className="idea-row" role="group" aria-label="Show sources">
        {CAL_SOURCES.map((s) => (
          <Link key={s.id} href={toggle(s.id)} className={`idea${hidden.has(s.id) ? "" : " is-on"}`} aria-pressed={!hidden.has(s.id)}>
            {s.label}
          </Link>
        ))}
      </div>

      <div className={view === "week" ? "cal-week" : "cal-agenda"}>
        {byDay
          .filter((d) => view === "week" || d.items.length > 0 || d.day === today)
          .map((d) => (
            <section key={d.day} className={`card cal-day${d.day === today ? " tt-today" : ""}`} aria-label={formatDayKeyLong(d.day)}>
              <div className="card-head">
                <h2 className="card-title">{view === "week" ? formatDayKey(d.day) : formatDayKeyLong(d.day)}</h2>
                {d.day === today ? <span className="chip">TODAY</span> : null}
              </div>
              {d.items.length === 0 ? (
                <p className="track-empty">Nothing on.</p>
              ) : (
                <div className="rows">
                  {d.items.map((i) => (
                    <div className="row cal-row" key={`${d.day}|${i.id}`}>
                      <span className="row-slot cal-time">{i.allDay ? "All day" : formatTime(i.start)}</span>
                      <span className="row-main cal-main">
                        <span className="cal-title">{i.title}</span>
                        <span className="task-sub">{[i.label, i.allDay ? null : `until ${formatTime(i.end)}`, i.location].filter(Boolean).join(" · ")}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
      </div>
    </main>
  );
}
