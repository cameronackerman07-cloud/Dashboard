import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { getCalendarConnections, loadEvents } from "@/lib/calendar";
import { getMySubjects } from "@/lib/my-subjects";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate, formatTime, startOfDay, weekday } from "@/lib/time";
import { TimetableClient, type ClassRow, type LinkedDay } from "./TimetableClient";

export const metadata: Metadata = { title: "Timetable" };

export default async function TimetablePage() {
  const supabase = await createClient();
  const now = Date.now();

  // This school week; at the weekend, next week.
  const today = weekday(now);
  const monday = startOfDay(now, today >= 6 ? 8 - today : 1 - today);
  const saturday = startOfDay(monday, 5);

  const [{ data }, { events, error }, connections] = await Promise.all([
    supabase
      .from("timetable")
      .select("id, day_of_week, period, subject, room, week")
      .order("day_of_week", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadEvents(monday, saturday),
    getCalendarConnections(),
  ]);

  const classes: ClassRow[] = data ?? [];

  const linked: LinkedDay[] = Array.from({ length: 5 }, (_, i) => {
    const start = startOfDay(monday, i);
    const end = startOfDay(monday, i + 1);
    return {
      n: i + 1,
      items: events
        .filter((e) => !e.allDay && e.start < end && e.end > start)
        .map((e) => ({
          id: e.id,
          time: `${formatTime(e.start)}–${formatTime(e.end)}`,
          title: e.title,
          location: e.location,
        })),
      allDay: events.filter((e) => e.allDay && e.start < end && e.end > start).map((e) => e.title),
    };
  });

  const hasLinked = linked.some((d) => d.items.length > 0 || d.allDay.length > 0);

  return (
    <main className="main">
      <PageHeader
        icon="timetable"
        title="Timetable"
        lede={
          connections.length || hasLinked
            ? `Week of ${formatShortDate(monday)}, from your ${connections.map((c) => c.name).join(" and ") || "linked"} ${connections.length > 1 ? "calendars" : "calendar"}, plus your own classes.`
            : "Your weekly classes. Connect Sentral or Atlantis in Settings, paste your timetable in, or add classes by hand."
        }
      />
      <TimetableClient
        classes={classes}
        courses={await getMySubjects()}
        linked={hasLinked ? linked : null}
        linkError={error}
        connected={connections.length > 0}
      />
    </main>
  );
}
