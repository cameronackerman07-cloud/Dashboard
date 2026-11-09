import { addDays, daysBetween, formatDayKey, formatDayKeyLong, formatMonth, isDayKey, isTimeKey, mondayOf, sydneyInstant } from "@/lib/time";

// Your own calendar events (rows in `events` with source "mine") and the
// Day / Week / Month / Agenda views. Pure functions, so they're easy to test.

export const MINE_SOURCE = "mine";
export const MAX_TITLE = 120;
export const MAX_LOCATION = 200;
export const MAX_SPAN_DAYS = 31;
export const MAX_OWN_EVENTS = 3000;

export type EventInput = {
  title: unknown;
  location?: unknown;
  allDay?: unknown;
  startDay: unknown;
  startTime?: unknown;
  endDay?: unknown;
  endTime?: unknown;
};

export type EventRow = { title: string; location: string | null; starts_at: string; ends_at: string; all_day: boolean };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const truthy = (v: unknown) => v === true || v === "on" || v === "true" || v === "1";

// Checks what the form sent and turns it into a database row (Sydney time).
export function parseEvent(input: EventInput): { ok: true; row: EventRow } | { ok: false; message: string } {
  const title = clean(input.title, MAX_TITLE);
  if (!title) return { ok: false, message: "Give the event a name." };
  const location = clean(input.location, MAX_LOCATION) || null;
  const allDay = truthy(input.allDay);

  if (!isDayKey(input.startDay)) return { ok: false, message: "Pick a start date." };
  const startDay = input.startDay;
  const endDay = isDayKey(input.endDay) ? input.endDay : startDay;
  if (endDay < startDay) return { ok: false, message: "The end date is before the start date." };
  if (daysBetween(startDay, endDay) > MAX_SPAN_DAYS) return { ok: false, message: `Events can be at most ${MAX_SPAN_DAYS} days long.` };

  let start: number;
  let end: number;
  if (allDay) {
    start = sydneyInstant(startDay);
    end = sydneyInstant(addDays(endDay, 1));
  } else {
    if (!isTimeKey(input.startTime)) return { ok: false, message: "Pick a start time, or tick All day." };
    if (!isTimeKey(input.endTime)) return { ok: false, message: "Pick an end time, or tick All day." };
    start = sydneyInstant(startDay, input.startTime);
    end = sydneyInstant(endDay, input.endTime);
    if (end <= start) return { ok: false, message: "The event has to end after it starts." };
  }
  return { ok: true, row: { title, location, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), all_day: allDay } };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type CalView = "day" | "week" | "month" | "agenda";
export const VIEWS: { id: CalView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" },
];
export const AGENDA_DAYS = 14;

export function isView(v: unknown): v is CalView {
  return v === "day" || v === "week" || v === "month" || v === "agenda";
}

export type ViewRange = {
  view: CalView;
  anchor: string; // the day the view is built around
  days: string[]; // every day shown, in order
  prev: string;
  next: string;
  label: string;
  month?: string; // "2026-11" in month view
};

// Which days a view shows around `anchor`, and where the arrows go.
export function viewRange(view: CalView, anchor: string): ViewRange {
  if (view === "day") {
    return { view, anchor, days: [anchor], prev: addDays(anchor, -1), next: addDays(anchor, 1), label: formatDayKeyLong(anchor) };
  }
  if (view === "week") {
    const mon = mondayOf(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return { view, anchor: mon, days, prev: addDays(mon, -7), next: addDays(mon, 7), label: `${formatDayKey(mon)} – ${formatDayKey(days[6])}` };
  }
  if (view === "month") {
    const month = anchor.slice(0, 7);
    const first = `${month}-01`;
    const nextMonth = addDays(first, 32).slice(0, 7);
    const last = addDays(`${nextMonth}-01`, -1);
    const gridStart = mondayOf(first);
    const gridEnd = addDays(mondayOf(last), 6);
    const days = Array.from({ length: daysBetween(gridStart, gridEnd) + 1 }, (_, i) => addDays(gridStart, i));
    const prevMonth = addDays(first, -1).slice(0, 7);
    return { view, anchor: first, days, prev: `${prevMonth}-01`, next: `${nextMonth}-01`, label: formatMonth(month), month };
  }
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(anchor, i));
  return { view, anchor, days, prev: addDays(anchor, -AGENDA_DAYS), next: addDays(anchor, AGENDA_DAYS), label: `${formatDayKey(anchor)} – ${formatDayKey(days[days.length - 1])}` };
}
