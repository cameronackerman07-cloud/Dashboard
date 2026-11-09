// Study timer maths. Pure functions (no database, no "server-only"), so the
// browser, the server and the tests all agree. Never trust a ticking counter:
// everything is worked out from timestamps.

import { addDays, dayKey, daysBetween, mondayOf, sydneyInstant } from "@/lib/time";

export type SessionStatus = "running" | "paused" | "completed" | "abandoned" | "auto_closed";
export type SessionKind = "focus" | "flashcards" | "practice" | "reading" | "other";
export type SessionSource = "timer" | "manual" | "siri" | "planner" | "voice";

export const SESSION_KINDS: { value: SessionKind; label: string }[] = [
  { value: "focus", label: "Focus" },
  { value: "flashcards", label: "Flashcards" },
  { value: "practice", label: "Practice questions" },
  { value: "reading", label: "Reading" },
  { value: "other", label: "Other" },
];

export type StudySession = {
  id: string;
  subject: string;
  topic: string | null;
  kind: SessionKind;
  planned_seconds: number;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  paused_at: string | null;
  status: SessionStatus;
  counted_seconds: number | null;
  source: SessionSource;
  planner_block_id: string | null;
  group_id: string | null;
  notes: string | null;
  counts_as_external: boolean;
};

export const MIN_COUNTED_SECONDS = 60;
// After the planned end, Finish / +5 / Keep going still work for this long.
// Then the session is closed at the planned end (counting the planned time).
export const GRACE_SECONDS = 30 * 60;
// A session left paused this long is closed, counting what was done before the pause.
export const MAX_PAUSE_SECONDS = 12 * 3600;
export const MAX_MANUAL_SECONDS = 6 * 3600;
export const MANUAL_MAX_DAYS_BACK = 30;
export const PRESETS = [15, 25, 45, 60, 90];

const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

// Seconds actually studied so far (pauses never count).
export function elapsedSeconds(s: Pick<StudySession, "started_at" | "ended_at" | "paused_seconds" | "paused_at" | "status">, now: number): number {
  const end = s.ended_at ? t(s.ended_at) : s.status === "paused" && s.paused_at ? t(s.paused_at) : now;
  return Math.max(0, Math.floor((end - t(s.started_at)) / 1000) - (s.paused_seconds || 0));
}

export function remainingSeconds(s: StudySession, now: number): number {
  return s.planned_seconds - elapsedSeconds(s, now);
}

// When a running session reaches its planned time.
export function plannedEnd(s: Pick<StudySession, "started_at" | "paused_seconds" | "planned_seconds">): number {
  return t(s.started_at) + (s.paused_seconds + s.planned_seconds) * 1000;
}

// What a session counts when it's finished now: the real time if early, the
// planned time exactly if it reached zero (never the time after it).
export function countedOnFinish(s: StudySession, now: number): number {
  return Math.min(elapsedSeconds(s, now), s.planned_seconds);
}

export type Sweep =
  | { action: "none" }
  | { action: "auto_close"; ended_at: number; counted: number }
  | { action: "discard" };

// What the sweep should do with an open session (running or paused) right now.
export function sweepDecision(s: StudySession, now: number): Sweep {
  if (s.status === "running") {
    const end = plannedEnd(s);
    if (now < end + GRACE_SECONDS * 1000) return { action: "none" };
    return s.planned_seconds >= MIN_COUNTED_SECONDS ? { action: "auto_close", ended_at: end, counted: s.planned_seconds } : { action: "discard" };
  }
  if (s.status === "paused" && s.paused_at) {
    if (now - t(s.paused_at) < MAX_PAUSE_SECONDS * 1000) return { action: "none" };
    const counted = Math.min(elapsedSeconds(s, now), s.planned_seconds);
    return counted >= MIN_COUNTED_SECONDS ? { action: "auto_close", ended_at: t(s.paused_at), counted } : { action: "discard" };
  }
  return { action: "none" };
}

export function isOpen(s: Pick<StudySession, "status">): boolean {
  return s.status === "running" || s.status === "paused";
}

// "1:05:09" or "24:10"
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// "4 h 20 min", "45 min", "0 min"
export function hoursText(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// For speech: "4 hours 20 minutes".
export function hoursSpoken(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hp = `${h} hour${h === 1 ? "" : "s"}`;
  const mp = `${m} minute${m === 1 ? "" : "s"}`;
  if (!h) return mp;
  return m ? `${hp} ${mp}` : hp;
}

// ---------------------------------------------------------------------------
// Statistics. A finished session's counted time is spread from its start, and
// split at Sydney midnights (daylight saving included).
// ---------------------------------------------------------------------------

export type Countable = Pick<StudySession, "subject" | "started_at" | "counted_seconds" | "status" | "counts_as_external" | "source">;

export function countsTowardTotal(s: Countable): boolean {
  return (s.status === "completed" || s.status === "auto_closed") && s.counts_as_external && (s.counted_seconds ?? 0) >= MIN_COUNTED_SECONDS;
}

// Seconds per Sydney day for one session.
export function splitByDay(startMs: number, seconds: number): Map<string, number> {
  const out = new Map<string, number>();
  let cursor = startMs;
  let left = seconds;
  while (left > 0) {
    const day = dayKey(cursor);
    const nextMidnight = sydneyInstant(addDays(day, 1));
    const chunk = Math.min(left, Math.max(1, Math.floor((nextMidnight - cursor) / 1000)));
    out.set(day, (out.get(day) ?? 0) + chunk);
    left -= chunk;
    cursor += chunk * 1000;
  }
  return out;
}

export type DayTotals = Map<string, number>;

export function dailyTotals(sessions: Countable[]): DayTotals {
  const days: DayTotals = new Map();
  for (const s of sessions) {
    if (!countsTowardTotal(s)) continue;
    for (const [d, sec] of splitByDay(t(s.started_at), s.counted_seconds ?? 0)) days.set(d, (days.get(d) ?? 0) + sec);
  }
  return days;
}

export function sumBetween(days: DayTotals, from: string, toExclusive: string): number {
  let n = 0;
  for (const [d, sec] of days) if (d >= from && d < toExclusive) n += sec;
  return n;
}

export function bySubject(sessions: Countable[]): { subject: string; seconds: number }[] {
  const m = new Map<string, number>();
  for (const s of sessions) if (countsTowardTotal(s)) m.set(s.subject, (m.get(s.subject) ?? 0) + (s.counted_seconds ?? 0));
  return [...m].map(([subject, seconds]) => ({ subject, seconds })).sort((a, b) => b.seconds - a.seconds);
}

// The last `n` weeks (Monday starts), oldest first.
export function weeklyTotals(days: DayTotals, today: string, n = 12): { week: string; seconds: number }[] {
  const thisMonday = mondayOf(today);
  return Array.from({ length: n }, (_, i) => {
    const week = addDays(thisMonday, -7 * (n - 1 - i));
    return { week, seconds: sumBetween(days, week, addDays(week, 7)) };
  });
}

// A day counts towards a streak with at least 10 minutes. One day off between
// study days doesn't break it (the rest-day allowance); two in a row does.
export const STREAK_MIN_SECONDS = 600;

export function streaks(days: DayTotals, today: string): { current: number; best: number } {
  const studied = (d: string) => (days.get(d) ?? 0) >= STREAK_MIN_SECONDS;
  const keys = [...days.keys()].filter(studied).sort();
  if (!keys.length) return { current: 0, best: 0 };
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of keys) {
    run = prev && daysBetween(prev, d) <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  // Current: the run ending at the latest study day, if that's today, yesterday or the day before.
  const last = keys[keys.length - 1];
  const current = daysBetween(last, today) <= 2 ? run : 0;
  return { current, best };
}

// Average weekly hours over the last 4 full weeks, and a projection to a date.
export function projection(days: DayTotals, today: string, totalSeconds: number, target: string): { perWeek: number; projected: number; weeksLeft: number } {
  const thisMonday = mondayOf(today);
  const four = sumBetween(days, addDays(thisMonday, -28), thisMonday);
  const perWeek = four / 4;
  const weeksLeft = Math.max(0, daysBetween(today, target) / 7);
  return { perWeek, projected: totalSeconds + perWeek * weeksLeft, weeksLeft };
}

// Grey level 0–4 for the heatmap.
export function heatLevel(seconds: number): number {
  if (seconds < 60) return 0;
  if (seconds < 30 * 60) return 1;
  if (seconds < 90 * 60) return 2;
  if (seconds < 180 * 60) return 3;
  return 4;
}

// Gentle nudges, never guilt.
export function nudges(opts: { todaySeconds: number; isSchoolDay: boolean; openElapsed: number | null; breakMinutes: number }): string[] {
  const out: string[] = [];
  if (opts.openElapsed !== null && opts.openElapsed >= opts.breakMinutes * 60) out.push(`You've been going for ${hoursText(opts.openElapsed)}. A short break helps it stick.`);
  if (opts.openElapsed !== null && opts.openElapsed >= 3 * 3600) out.push("That's a long session. Stretch, drink some water, and come back fresh.");
  if (opts.isSchoolDay && opts.todaySeconds >= 4 * 3600) out.push("That's over 4 hours of extra study on a school day. Great effort. Make sure there's time to rest tonight.");
  return out;
}

// Checks a manual entry: last 30 days, at most 6 hours, not in the future.
export function checkManual(day: string, minutes: number, today: string): string | null {
  if (!Number.isFinite(minutes) || minutes < 1) return "Enter how many minutes you studied.";
  if (minutes * 60 > MAX_MANUAL_SECONDS) return "One entry can be at most 6 hours. Add it as two entries if it was longer.";
  if (day > today) return "That day hasn't happened yet.";
  if (daysBetween(day, today) > MANUAL_MAX_DAYS_BACK) return "You can only add time from the last 30 days.";
  return null;
}
