// Dates and times in Sydney. The server runs in UTC, so anything shown as a day
// or a time goes through these, which keeps server and browser output identical.

export const SCHOOL_TZ = "Australia/Sydney";

const DAY_MS = 86_400_000;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(ms: number, timeZone: string): Parts {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-AU", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partFormatters.set(timeZone, f);
  }
  const get = (type: string) => Number(f.formatToParts(ms).find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// The instant when the clock in `timeZone` reads this date and time.
export function zonedToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetAt = (ms: number) => {
    const p = partsIn(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  // Twice, so times either side of a daylight-saving change land correctly.
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

// "2026-11-06" for the Sydney date at this instant. Sorts and compares as text.
export function dayKey(ms: number): string {
  const p = partsIn(ms, SCHOOL_TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Midnight in Sydney at the start of the day `offsetDays` after this instant's day.
export function startOfDay(ms: number, offsetDays = 0): number {
  const p = partsIn(ms, SCHOOL_TZ);
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day) + offsetDays * DAY_MS);
  return zonedToUtc(SCHOOL_TZ, target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}

// 1 = Monday ... 7 = Sunday, in Sydney.
export function weekday(ms: number): number {
  const p = partsIn(ms, SCHOOL_TZ);
  const js = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return js === 0 ? 7 : js;
}

const timeFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: SCHOOL_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// "9:05am"
export function formatTime(ms: number): string {
  return timeFormat.format(ms).replace(/\s/g, "").toLowerCase();
}

const dayFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: SCHOOL_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

// "Friday 6 November"
export function formatDay(ms: number): string {
  return dayFormat.format(ms).replace(",", "");
}

const shortDayFormat = new Intl.DateTimeFormat("en-AU", { timeZone: SCHOOL_TZ, day: "numeric", month: "short" });

// "6 Nov"
export function formatShortDate(ms: number): string {
  return shortDayFormat.format(ms);
}

// ---------------------------------------------------------------------------
// Calendar days as "YYYY-MM-DD" text (Sydney), used by Shifts, Pay, Habits and
// To-do. Day arithmetic is done on the date itself, so daylight saving can't
// shift a day.
// ---------------------------------------------------------------------------

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_KEY = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY_KEY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isTimeKey(value: unknown): value is string {
  return typeof value === "string" && TIME_KEY.test(value);
}

function utcOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function keyOfUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = utcOf(day);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOfUtc(d);
}

// Days from a to b (b - a).
export function daysBetween(a: string, b: string): number {
  return Math.round((utcOf(b).getTime() - utcOf(a).getTime()) / DAY_MS);
}

// 1 = Monday ... 7 = Sunday, for a day key.
export function weekdayOfKey(day: string): number {
  const js = utcOf(day).getUTCDay();
  return js === 0 ? 7 : js;
}

// The Monday of the week this day is in.
export function mondayOf(day: string): string {
  return addDays(day, 1 - weekdayOfKey(day));
}

// The instant a Sydney clock shows this day and "HH:MM".
export function sydneyInstant(day: string, time = "00:00"): number {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return zonedToUtc(SCHOOL_TZ, y, m, d, hh, mm);
}

// "16:30" in Sydney for this instant (for <input type="time">).
export function timeKey(ms: number): string {
  const p = partsIn(ms, SCHOOL_TZ);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

const keyDayFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

// "Mon 9 Nov" for a day key.
export function formatDayKey(day: string): string {
  return keyDayFormat.format(utcOf(day)).replace(",", "");
}

const keyLongFormat = new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

// "Monday 9 November" for a day key.
export function formatDayKeyLong(day: string): string {
  return keyLongFormat.format(utcOf(day)).replace(",", "");
}

// "2026-11" for a Sydney month.
export function monthKey(ms: number): string {
  return dayKey(ms).slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

// First day of the month and first day of the next month, as day keys.
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

const monthFormat = new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", month: "long", year: "numeric" });

// "November 2026"
export function formatMonth(month: string): string {
  return monthFormat.format(utcOf(`${month}-01`));
}
