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
