// Free time for studying, worked out in code (never trusted to the AI).
import { addDays, sydneyInstant, weekdayOfKey } from "@/lib/time";

export type Interval = { start: number; end: number };
export type Window = Interval & { day: string };

export type FreeTimeInput = {
  weekStart: string; // a Monday
  busy: Interval[]; // shifts, calendar events, classes, sport, gigs
  sleepStart: string; // "22:00"
  sleepEnd: string; // "06:30"
  schoolDays?: number[]; // 1–5 by default
  schoolStart?: string; // "08:30"
  schoolEnd?: string; // "15:30"
  now?: number;
};

const MEALS: [string, string][] = [
  ["07:00", "07:30"],
  ["12:30", "13:00"],
  ["18:00", "19:00"],
];
const MIN_WINDOW_MIN = 25;

function subtract(windows: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const w of windows) {
    if (cut.end <= w.start || cut.start >= w.end) out.push(w);
    else {
      if (cut.start > w.start) out.push({ start: w.start, end: cut.start });
      if (cut.end < w.end) out.push({ start: cut.end, end: w.end });
    }
  }
  return out;
}

export function freeWindows(input: FreeTimeInput): Window[] {
  const school = new Set(input.schoolDays ?? [1, 2, 3, 4, 5]);
  const out: Window[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(input.weekStart, i);
    // Awake time: from the end of last night's sleep to the start of tonight's.
    let windows: Interval[] = [{ start: sydneyInstant(day, input.sleepEnd), end: sydneyInstant(day, input.sleepStart) }];
    if (input.sleepStart < input.sleepEnd) windows = [{ start: sydneyInstant(day, input.sleepEnd), end: sydneyInstant(addDays(day, 1), input.sleepStart) }];
    if (school.has(weekdayOfKey(day))) windows = subtract(windows, { start: sydneyInstant(day, input.schoolStart ?? "08:30"), end: sydneyInstant(day, input.schoolEnd ?? "15:30") });
    for (const [a, b] of MEALS) windows = subtract(windows, { start: sydneyInstant(day, a), end: sydneyInstant(day, b) });
    for (const b of input.busy) windows = subtract(windows, b);
    if (input.now) windows = subtract(windows, { start: 0, end: input.now });
    for (const w of windows) if (w.end - w.start >= MIN_WINDOW_MIN * 60_000) out.push({ ...w, day });
  }
  return out;
}
