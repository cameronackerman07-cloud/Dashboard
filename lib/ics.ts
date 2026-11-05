// Reads iCalendar (.ics) files, such as a Sentral calendar link or an exported
// timetable, and lists the events in a date range. Handles time zones, all-day
// events, and the common repeat rules (daily and weekly) that timetables use.

import { isTimeZone, SCHOOL_TZ, zonedToUtc } from "@/lib/time";

export type IcsEvent = {
  uid: string;
  title: string;
  location: string | null;
  start: number; // ms since 1970
  end: number;
  allDay: boolean;
};

type DateValue = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  allDay: boolean;
  utc: boolean;
  tz: string;
};

type RawEvent = {
  uid: string;
  title: string;
  location: string | null;
  start: DateValue;
  end: DateValue | null;
  durationMs: number | null;
  rrule: Record<string, string> | null;
  exdates: number[];
  recurrenceId: number | null;
  cancelled: boolean;
};

export type ParsedCalendar = { events: RawEvent[] };

const DAY_MS = 86_400_000;
const MAX_EVENTS = 20_000;
const MAX_OCCURRENCES = 5_000;

// Windows time-zone names some school systems use, mapped to standard ones.
const WINDOWS_ZONES: Record<string, string> = {
  "AUS Eastern Standard Time": "Australia/Sydney",
  "E. Australia Standard Time": "Australia/Brisbane",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "AUS Central Standard Time": "Australia/Darwin",
  "W. Australia Standard Time": "Australia/Perth",
  "Tasmania Standard Time": "Australia/Hobart",
  UTC: "UTC",
};

function zoneFor(tzid: string | undefined): string {
  if (!tzid) return SCHOOL_TZ;
  const clean = tzid.replace(/^"|"$/g, "").replace(/^\/[^/]*\//, ""); // some feeds prefix "/mozilla.org/..."
  if (WINDOWS_ZONES[clean]) return WINDOWS_ZONES[clean];
  return isTimeZone(clean) ? clean : SCHOOL_TZ;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseDate(value: string, params: Record<string, string>): DateValue | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const allDay = params.VALUE === "DATE" || m[4] === undefined;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: allDay ? 0 : Number(m[4]),
    minute: allDay ? 0 : Number(m[5]),
    second: allDay ? 0 : Number(m[6] ?? 0),
    allDay,
    utc: m[7] === "Z",
    tz: zoneFor(params.TZID),
  };
}

function toMs(d: DateValue): number {
  if (d.utc) return Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.second);
  // All-day events and times with no zone are read as the school's local time.
  return zonedToUtc(d.allDay ? SCHOOL_TZ : d.tz, d.year, d.month, d.day, d.hour, d.minute, d.second);
}

// "PT1H30M", "P1D" and so on.
function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, sign, w, d, h, min, s] = m;
  const ms =
    (Number(w ?? 0) * 7 + Number(d ?? 0)) * DAY_MS +
    Number(h ?? 0) * 3_600_000 +
    Number(min ?? 0) * 60_000 +
    Number(s ?? 0) * 1000;
  return sign === "-" ? -ms : ms;
}

// Splits "NAME;PARAM=a;OTHER=b:value", ignoring colons inside quoted parameters.
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

export function parseIcs(text: string): ParsedCalendar {
  // Long lines are folded onto the next line, which starts with a space or tab.
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: RawEvent[] = [];
  let current: Partial<RawEvent> & { exdates: number[] } | null = null;
  let depth = 0; // nested blocks inside an event (like alarms) are skipped

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { exdates: [], cancelled: false, rrule: null, recurrenceId: null, end: null, durationMs: null };
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("BEGIN:")) {
      depth++;
      continue;
    }
    if (line.startsWith("END:") && line !== "END:VEVENT") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (line === "END:VEVENT") {
      if (current.start && events.length < MAX_EVENTS) {
        events.push({
          uid: current.uid ?? `event-${events.length}`,
          title: current.title || "Untitled",
          location: current.location ?? null,
          start: current.start,
          end: current.end ?? null,
          durationMs: current.durationMs ?? null,
          rrule: current.rrule ?? null,
          exdates: current.exdates,
          recurrenceId: current.recurrenceId ?? null,
          cancelled: !!current.cancelled,
        });
      }
      current = null;
      continue;
    }
    if (depth > 0) continue;

    const prop = splitLine(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "SUMMARY":
        current.title = unescapeText(prop.value).slice(0, 300);
        break;
      case "LOCATION":
        current.location = unescapeText(prop.value).slice(0, 200) || null;
        break;
      case "DTSTART":
        current.start = parseDate(prop.value, prop.params) ?? undefined;
        break;
      case "DTEND":
        current.end = parseDate(prop.value, prop.params);
        break;
      case "DURATION":
        current.durationMs = parseDuration(prop.value);
        break;
      case "STATUS":
        current.cancelled = prop.value.trim().toUpperCase() === "CANCELLED";
        break;
      case "RRULE":
        current.rrule = Object.fromEntries(
          prop.value.split(";").map((part) => {
            const [k, v = ""] = part.split("=");
            return [k.toUpperCase(), v.toUpperCase()];
          }),
        );
        break;
      case "EXDATE":
        for (const v of prop.value.split(",")) {
          const d = parseDate(v, prop.params);
          if (d) current.exdates.push(toMs(d));
        }
        break;
      case "RECURRENCE-ID": {
        const d = parseDate(prop.value, prop.params);
        if (d) current.recurrenceId = toMs(d);
        break;
      }
    }
  }
  return { events };
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Every start time of a repeating event, as dates on the event's own clock. Only
// daily and weekly repeats are expanded; anything else shows its first date.
function* repeats(event: RawEvent, untilMs: number): Generator<DateValue> {
  const s = event.start;
  const rule = event.rrule;
  if (!rule || (rule.FREQ !== "DAILY" && rule.FREQ !== "WEEKLY")) {
    yield s;
    return;
  }

  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseDate(rule.UNTIL, {}) : null;
  // A date-only UNTIL includes that whole day.
  const untilLimit = until
    ? toMs({ ...until, tz: s.tz }) + (until.allDay ? DAY_MS - 1 : 0)
    : Infinity;
  const startDay = Date.UTC(s.year, s.month - 1, s.day);
  const days =
    rule.FREQ === "WEEKLY" && rule.BYDAY
      ? rule.BYDAY.split(",").map((d) => WEEKDAYS.indexOf(d.slice(-2))).filter((d) => d >= 0)
      : [new Date(startDay).getUTCDay()];

  const at = (dayMs: number): DateValue => {
    const d = new Date(dayMs);
    return { ...s, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  };

  let emitted = 0;
  for (let step = 0; step < MAX_OCCURRENCES; step++) {
    let candidates: number[];
    if (rule.FREQ === "DAILY") {
      candidates = [startDay + step * interval * DAY_MS];
    } else {
      const weekStart = startDay - new Date(startDay).getUTCDay() * DAY_MS + step * interval * 7 * DAY_MS;
      candidates = [...days].sort((a, b) => a - b).map((d) => weekStart + d * DAY_MS);
    }
    for (const dayMs of candidates) {
      if (dayMs < startDay) continue;
      const value = at(dayMs);
      const ms = toMs(value);
      if (ms > untilLimit || emitted >= count || ms > untilMs) return;
      emitted++;
      yield value;
    }
  }
}

// The events that overlap [fromMs, toMs), sorted by start time.
export function eventsBetween(calendar: ParsedCalendar, fromMs: number, toMs_: number): IcsEvent[] {
  // A changed occurrence of a repeating event comes as its own event, so the
  // original occurrence it replaces is skipped.
  const replaced = new Set<string>();
  for (const e of calendar.events) {
    if (e.recurrenceId !== null) replaced.add(`${e.uid}|${e.recurrenceId}`);
  }

  const out: IcsEvent[] = [];
  for (const e of calendar.events) {
    if (e.cancelled) continue;
    const firstStart = toMs(e.start);
    const length =
      e.end !== null
        ? Math.max(0, toMs(e.end) - firstStart)
        : (e.durationMs ?? (e.start.allDay ? DAY_MS : 60 * 60_000));

    for (const value of repeats(e, toMs_)) {
      const start = toMs(value);
      const end = start + length;
      if (end <= fromMs || start >= toMs_) continue;
      if (e.recurrenceId === null && (replaced.has(`${e.uid}|${start}`) || e.exdates.includes(start))) continue;
      out.push({ uid: e.uid, title: e.title, location: e.location, start, end, allDay: e.start.allDay });
      if (out.length >= MAX_OCCURRENCES) break;
    }
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
