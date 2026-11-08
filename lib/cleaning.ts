// Cleaning-hours maths (pure code, no AI). The pay week runs from the chosen
// start day 00:00 to the day before 23:59, Sydney time. Shifts that cross
// midnight are split by day; unpaid breaks come off the day the shift started.

import { formatCents } from "@/lib/money";
import { addDays, dayKey, formatDayKey, sydneyInstant, weekdayOfKey } from "@/lib/time";

export type HoursShift = { id: string; job_id: string; starts_at: string; ends_at: string; unpaid_break_minutes: number; rate_override_cents: number | null };
export type HoursJob = { id: string; default_rate_cents: number };

// The pay week containing `day` (startDay: 1 = Monday ... 7 = Sunday).
export function payWeekStart(day: string, startDay: number): string {
  const back = (weekdayOfKey(day) - startDay + 7) % 7;
  return addDays(day, -back);
}

// The pay week that has just finished, for a report sent on the start day.
export function lastPayWeek(now: number, startDay: number): { start: string; end: string } {
  const thisStart = payWeekStart(dayKey(now), startDay);
  return { start: addDays(thisStart, -7), end: addDays(thisStart, -1) };
}

// Minutes worked per day (YYYY-MM-DD) for shifts that have finished by `now`.
export function minutesByDay(shifts: HoursShift[], start: string, endInclusive: string, now: number): Map<string, number> {
  const out = new Map<string, number>();
  const from = sydneyInstant(start);
  const to = sydneyInstant(addDays(endInclusive, 1));
  for (const s of shifts) {
    const a = new Date(s.starts_at).getTime();
    const b = new Date(s.ends_at).getTime();
    if (b > now || b <= a) continue; // only completed shifts
    let breakLeft = Math.max(0, s.unpaid_break_minutes);
    for (let day = dayKey(a); sydneyInstant(day) < b; day = addDays(day, 1)) {
      const dayStart = Math.max(a, sydneyInstant(day), from);
      const dayEnd = Math.min(b, sydneyInstant(addDays(day, 1)), to);
      if (dayEnd <= dayStart) continue;
      let mins = (dayEnd - dayStart) / 60_000;
      const used = Math.min(breakLeft, mins);
      mins -= used;
      breakLeft -= used;
      if (mins > 0) out.set(day, (out.get(day) ?? 0) + mins);
    }
  }
  return out;
}

const hours = (mins: number) => `${Math.round((mins / 60) * 100) / 100} h`;

export function hoursMessage(
  shifts: HoursShift[],
  jobs: HoursJob[],
  week: { start: string; end: string },
  now: number,
  opts: { includePay?: boolean; includeZeroDays?: boolean; label?: string } = {},
): { text: string; totalMinutes: number; days: { day: string; minutes: number }[] } {
  const byDay = minutesByDay(shifts, week.start, week.end, now);
  const days: { day: string; minutes: number }[] = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
    const m = Math.round(byDay.get(d) ?? 0);
    if (m > 0 || opts.includeZeroDays) days.push({ day: d, minutes: m });
  }
  const total = days.reduce((a, d) => a + d.minutes, 0);
  const parts = days.map((d) => `${formatDayKey(d.day).split(" ")[0]} ${hours(d.minutes)}`);
  let pay = "";
  if (opts.includePay) {
    const rate = new Map(jobs.map((j) => [j.id, j.default_rate_cents]));
    const cents = shifts.reduce((acc, s) => {
      const mins = minutesByDay([s], week.start, week.end, now);
      const m = [...mins.values()].reduce((x, y) => x + y, 0);
      return acc + Math.round((m / 60) * (s.rate_override_cents ?? rate.get(s.job_id) ?? 0));
    }, 0);
    if (cents > 0) pay = ` About ${formatCents(cents)} before tax.`;
  }
  const label = opts.label ?? "Cleaning hours";
  const range = `${formatDayKey(week.start)} – ${formatDayKey(week.end)}`;
  const text = days.length ? `${label} ${range}: ${parts.join(", ")}. Total ${hours(total)}.${pay}` : `${label} ${range}: no hours.`;
  return { text, totalMinutes: total, days };
}
