import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { getCalendarConnections, loadEvents, type CalEvent } from "@/lib/calendar";
import { dayKey, formatDay, formatTime, startOfDay } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };

const DAYS_SHOWN = 14;

export default async function CalendarPage() {
  const now = Date.now();
  const from = startOfDay(now);
  const to = startOfDay(now, DAYS_SHOWN);
  const [{ events, error }, connections] = await Promise.all([
    loadEvents(from, to, { includeTasks: true }),
    getCalendarConnections(),
  ]);

  // One section per day, all-day items first. An event that runs over several
  // days is listed on each.
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const start = startOfDay(now, i);
    const end = startOfDay(now, i + 1);
    const items = events
      .filter((e) => e.start < end && e.end > start)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
    return { key: dayKey(start), label: formatDay(start), offset: i, items };
  });

  const nothing = events.length === 0;

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="calendar"
        title="Calendar"
        lede="The next two weeks: your Sentral or Atlantis calendar, imported events and what's due."
      />

      {error ? (
        <p className="ai-error" role="alert">
          {error} <Link href="/settings">Check the link in Settings</Link>
        </p>
      ) : null}

      {connections.length === 0 && !events.some((e) => e.source !== "task") ? (
        <div className="notice" role="note">
          <span>Connect your Sentral or Atlantis calendar to see your timetable and school events here.</span>
          <Link href="/settings" className="card-link">
            Connect →
          </Link>
        </div>
      ) : null}

      {nothing ? (
        <section className="card">
          <p className="track-empty">Nothing in the next two weeks.</p>
        </section>
      ) : (
        days
          .filter((d) => d.items.length > 0 || d.offset === 0)
          .map((d) => (
            <section key={d.key} className="card cal-day" aria-label={d.label}>
              <div className="card-head">
                <h2 className="card-title">{d.label}</h2>
                {d.offset === 0 ? <span className="chip">TODAY</span> : null}
              </div>
              {d.items.length === 0 ? (
                <p className="track-empty">Nothing on today.</p>
              ) : (
                <div className="rows">
                  {d.items.map((e) => (
                    <EventRow key={`${d.key}|${e.id}`} event={e} />
                  ))}
                </div>
              )}
            </section>
          ))
      )}
    </main>
  );
}

function EventRow({ event }: { event: CalEvent }) {
  return (
    <div className="row cal-row">
      <span className="row-slot cal-time">
        {event.allDay ? (event.source === "task" ? "Due" : "All day") : formatTime(event.start)}
      </span>
      <span className="row-main cal-main">
        <span className="cal-title">{event.title}</span>
        {event.location || !event.allDay ? (
          <span className="task-sub">
            {[event.allDay ? null : `until ${formatTime(event.end)}`, event.location].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
    </div>
  );
}
