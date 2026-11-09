import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { getCalendarConnections, loadEvents } from "@/lib/calendar";
import { isView, VIEWS, viewRange, type CalView } from "@/lib/calendar-edit";
import { CAL_SOURCES, collectItems, type CalItem, type CalSource } from "@/lib/calendar-merge";
import { googleEvents } from "@/lib/sources/google";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, dayKey, isDayKey, sydneyInstant } from "@/lib/time";
import { CalendarClient, type ShownItem } from "./CalendarClient";

export const metadata: Metadata = { title: "Calendar" };

// ?view=day|week|month|agenda  &d=YYYY-MM-DD (the day to show)  &hide=sources
// (`w` is the old week link and still works.)
type Props = { searchParams: Promise<{ view?: string; d?: string; w?: string; hide?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const view: CalView = isView(params.view) ? params.view : "week";
  const today = dayKey(Date.now());
  const anchor = isDayKey(params.d) ? params.d : isDayKey(params.w) ? params.w : today;
  const range = viewRange(view, anchor);
  const from = sydneyInstant(range.days[0]);
  const to = sydneyInstant(addDays(range.days[range.days.length - 1], 1));
  const hidden = new Set((params.hide ?? "").split(",").filter((s) => CAL_SOURCES.some((c) => c.id === s)));

  const userId = await currentUserId();
  const supabase = await createClient();
  const [{ events, error }, connections, mine, google] = await Promise.all([
    loadEvents(from, to),
    getCalendarConnections(),
    userId ? collectItems(supabase, userId, from, to) : Promise.resolve([] as CalItem[]),
    userId ? googleEvents(userId).catch(() => []) : Promise.resolve([]),
  ]);

  const all: ShownItem[] = [
    ...events.map((e) =>
      e.source === "mine"
        ? { id: `mine-${e.id}`, eventId: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, source: "mine" as CalSource, label: "My event", location: e.location }
        : { id: `cal-${e.id}`, title: e.title, start: e.start, end: e.end, allDay: e.allDay, source: "class" as CalSource, label: "School calendar", location: e.location },
    ),
    ...google.filter((g) => g.start < to && g.end > from).map((g) => ({ id: `g-${g.id}`, title: g.title, start: g.start, end: g.end, allDay: g.allDay, source: "google" as CalSource, label: `Google · ${g.account}`, location: g.location })),
    ...mine,
  ].filter((i) => !hidden.has(i.source));

  const hide = [...hidden].join(",") || undefined;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, d: range.anchor === today ? undefined : range.anchor, hide, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const toggle = (s: CalSource) => {
    const next = new Set(hidden);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return qs({ hide: [...next].join(",") || undefined });
  };
  // Switching views keeps you on the same day (or today, if it's on screen).
  const keep = range.days.includes(today) ? undefined : range.days.includes(anchor) ? anchor : range.anchor;
  const viewHrefs = Object.fromEntries(VIEWS.map((v) => [v.id, qs({ view: v.id, d: keep })])) as Record<CalView, string>;
  const dayHrefs = Object.fromEntries(range.days.map((d) => [d, qs({ view: "day", d })]));

  const byDay = range.days.map((d) => {
    const s = sydneyInstant(d);
    const e = sydneyInstant(addDays(d, 1));
    return { day: d, items: all.filter((i) => i.start < e && i.end > s).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start) };
  });

  return (
    <main className="main">
      <PageHeader icon="calendar" title="Calendar" lede="Your own events, Google, your school calendar, shifts, due dates and study blocks together, in Sydney time." />
      {error ? (
        <p className="ai-error" role="alert">
          {error} <Link href="/settings">Check the link in Settings</Link>
        </p>
      ) : null}
      {connections.length === 0 && google.length === 0 ? (
        <div className="notice" role="note">
          <span>Add your own events here, or connect Google or your Sentral/Atlantis calendar in Settings to see classes and school events too.</span>
          <Link href="/settings" className="card-link">
            Connect →
          </Link>
        </div>
      ) : null}

      <CalendarClient
        view={view}
        days={byDay}
        today={today}
        month={range.month}
        anchor={view === "week" || view === "month" ? range.anchor : anchor}
        label={range.label}
        prevHref={qs({ d: range.prev })}
        nextHref={qs({ d: range.next })}
        todayHref={qs({ d: undefined })}
        viewHrefs={viewHrefs}
        dayHrefs={dayHrefs}
        goToBase={qs({ d: undefined })}
      />

      <div className="idea-row" role="group" aria-label="Show sources">
        {CAL_SOURCES.map((s) => (
          <Link key={s.id} href={toggle(s.id)} className={`idea${hidden.has(s.id) ? "" : " is-on"}`} aria-pressed={!hidden.has(s.id)}>
            {s.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
