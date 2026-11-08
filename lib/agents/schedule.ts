// Agent schedules, always in Sydney time (daylight saving included).
import { addDays, dayKey, isTimeKey, sydneyInstant, weekdayOfKey } from "@/lib/time";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type Schedule =
  | { type: "every"; minutes: number }
  | { type: "daily"; at: string }
  | { type: "weekly"; day: Weekday; at: string };

export function parseSchedule(value: unknown): Schedule | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.type === "every" && typeof v.minutes === "number" && v.minutes >= 15 && v.minutes <= 10080) {
    return { type: "every", minutes: Math.round(v.minutes) };
  }
  if (v.type === "daily" && isTimeKey(v.at)) return { type: "daily", at: v.at };
  if (v.type === "weekly" && isTimeKey(v.at) && WEEKDAYS.includes(v.day as Weekday)) return { type: "weekly", day: v.day as Weekday, at: v.at };
  return null;
}

// The next time after `from` (ms) that the schedule fires.
export function nextRun(schedule: Schedule, from: number): number {
  if (schedule.type === "every") return from + schedule.minutes * 60_000;
  const today = dayKey(from);
  for (let i = 0; i < 9; i++) {
    const day = addDays(today, i);
    if (schedule.type === "weekly" && WEEKDAYS[weekdayOfKey(day) - 1] !== schedule.day) continue;
    const at = sydneyInstant(day, schedule.at);
    if (at > from) return at;
  }
  return from + 7 * 86_400_000; // unreachable in practice
}

export function describeSchedule(s: Schedule): string {
  if (s.type === "every") return s.minutes % 60 === 0 ? `Every ${s.minutes / 60} hour${s.minutes === 60 ? "" : "s"}` : `Every ${s.minutes} minutes`;
  const time = (() => {
    const [h, m] = s.at.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  })();
  if (s.type === "daily") return `Daily at ${time}`;
  const name = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" }[s.day];
  return `${name}s at ${time}`;
}
