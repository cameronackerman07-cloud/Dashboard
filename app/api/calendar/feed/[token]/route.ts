import { collectItems } from "@/lib/calendar-merge";
import { userForCalendarToken } from "@/lib/device-tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, dayKey, sydneyInstant } from "@/lib/time";

// Private, read-only .ics feed for Apple Calendar: your own events, shifts, due
// dates and study blocks. The random token in the address is the only key, so it can be
// regenerated in Settings. Apple refreshes subscriptions on its own schedule.

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (ms: number) => dayKey(ms).replace(/-/g, "");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await userForCalendarToken(token.replace(/\.ics$/, ""));
  if (!userId) return new Response("Not found", { status: 404 });

  const today = dayKey(Date.now());
  const db = createAdminClient();
  const from = sydneyInstant(addDays(today, -14));
  const to = sydneyInstant(addDays(today, 60));
  const [items, own] = await Promise.all([
    collectItems(db, userId, from, to),
    // Events you added on the Calendar page.
    db.from("events").select("id, title, starts_at, ends_at, all_day").eq("user_id", userId).eq("source", "mine").lt("starts_at", new Date(to).toISOString()).gt("ends_at", new Date(from).toISOString()).limit(1000),
  ]);
  for (const e of (own.data ?? []) as { id: string; title: string | null; starts_at: string; ends_at: string; all_day: boolean }[]) {
    items.push({ id: `mine-${e.id}`, title: e.title ?? "Event", start: new Date(e.starts_at).getTime(), end: new Date(e.ends_at).getTime(), allDay: e.all_day, source: "mine", label: "My event" });
  }
  const now = stamp(Date.now());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dashboard//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Dashboard", "X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const i of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}@dashboard`,
      `DTSTAMP:${now}`,
      i.allDay ? `DTSTART;VALUE=DATE:${dateOnly(i.start)}` : `DTSTART:${stamp(i.start)}`,
      i.allDay ? `DTEND;VALUE=DATE:${dateOnly(i.end)}` : `DTEND:${stamp(i.end)}`,
      `SUMMARY:${esc(i.title).slice(0, 200)}`,
      `CATEGORIES:${esc(i.label)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" },
  });
}
