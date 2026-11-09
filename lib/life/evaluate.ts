// "Should I go?" step 1, in code (no AI). Works out what an event would do to
// sleep, study and the week's balance, and builds options that have already
// been checked against the calendar. Pure, so it's fully tested.
// Titles never appear here: only ids, categories and numbers.

import { SLEEP_MINIMUM_HOURS, sleepFor, sleepWindow, type LifeCategory, type LifePrefs, type Occurrence } from "@/lib/life";
import { addDays, dayKey, sydneyInstant, weekdayOfKey } from "@/lib/time";

const MIN = 60_000;
const HOUR = 60 * MIN;

export type Draft = { id: string; category: LifeCategory; start: number; end: number; travelBefore: number; travelAfter: number; want: number };
export type StudyBlock = { id: string; start: number; end: number; kind: string };
export type Deadline = { id: string; due: number; kind: "task" | "assessment" | "exam" | "trial"; ready: boolean };
export type Busy = { id: string; start: number; end: number; source: "shift" | "life" | "school"; fixed: boolean; category?: LifeCategory };

export type EvalInput = {
  draft: Draft;
  prefs: LifePrefs;
  now: number;
  life: Occurrence[]; // everything else in My life, ±3 days
  shifts: Busy[];
  study: StudyBlock[];
  deadlines: Deadline[];
  schoolDays?: number[];
};

export type Option =
  | { id: "go"; kind: "go" }
  | { id: string; kind: "leave_earlier"; end: number }
  | { id: string; kind: "arrive_later"; start: number }
  | { id: string; kind: "swap"; itemId: string; source: "life" | "study"; from: Span; to: Span }
  | { id: string; kind: "move_study"; blockId: string; from: Span; to: Span }
  | { id: "skip"; kind: "skip" };

type Span = { start: number; end: number };

export type Evaluation = {
  sleepBefore: number; // hours, the night before the event's day
  sleepAfter: number; // hours, the night of the event (with it)
  sleepAfterWithout: number;
  nextDayEarlyStart: number | null; // first commitment the next morning
  highStakesNextDay: boolean;
  studyLostMin: number;
  clashes: { id: string; source: "shift" | "life" | "study" | "school"; fixed: boolean }[];
  deadlinesNext7: number;
  urgentNotReady: number; // due within 36 hours of the event ending, not ready
  balance: { socialMin: number; movement: number };
  want: number;
  options: Option[];
};

const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

function schoolSpans(day: string, schoolDays: number[]): Busy[] {
  return schoolDays.includes(weekdayOfKey(day)) ? [{ id: `school:${day}`, start: sydneyInstant(day, "08:30"), end: sydneyInstant(day, "15:30"), source: "school", fixed: true }] : [];
}

// The first free slot of `minutes` between `from` and `until`, outside every
// busy span, sleep window and wind-down, between 7am and the wind-down.
export function findSlot(minutes: number, from: number, until: number, busy: Span[], prefs: LifePrefs): Span | null {
  const step = 15 * MIN;
  for (let t = Math.ceil(from / step) * step; t + minutes * MIN <= until; t += step) {
    const slot = { start: t, end: t + minutes * MIN };
    const day = dayKey(t);
    const night = sleepWindow(prefs, day);
    const lastNight = sleepWindow(prefs, addDays(day, -1));
    if (slot.start < sydneyInstant(day, "07:00")) continue;
    if (overlap(slot, { start: night.start - prefs.wind_down_min * MIN, end: night.end }) || overlap(slot, lastNight)) continue;
    if (busy.some((b) => overlap(slot, b) > 0)) continue;
    return slot;
  }
  return null;
}

export function evaluate(input: EvalInput): Evaluation {
  const { draft, prefs } = input;
  const schoolDays = input.schoolDays ?? [1, 2, 3, 4, 5];
  const day = dayKey(draft.start);
  const nextDay = addDays(day, 1);
  const span = { start: draft.start - draft.travelBefore * MIN, end: draft.end + draft.travelAfter * MIN };

  const others = [...input.life.map((o) => ({ start: o.start, end: o.end, travelBefore: o.travelBefore, travelAfter: o.travelAfter })), ...input.shifts];
  const nextMorning = [...input.shifts, ...input.life.map((o) => ({ id: o.itemId, start: o.start, end: o.end, source: "life" as const, fixed: o.flexibility === "fixed" })), ...schoolSpans(nextDay, schoolDays)]
    .filter((c) => dayKey(c.start) === nextDay)
    .sort((a, b) => a.start - b.start)[0];
  const withDraft = [...others, ...schoolSpans(nextDay, schoolDays), { start: draft.start, end: draft.end, travelBefore: draft.travelBefore, travelAfter: draft.travelAfter }];
  const sleepAfter = sleepFor(prefs, day, withDraft).hours;
  const sleepAfterWithout = sleepFor(prefs, day, [...others, ...schoolSpans(nextDay, schoolDays)]).hours;
  const sleepBefore = sleepFor(prefs, addDays(day, -1), [...others, ...schoolSpans(day, schoolDays), { start: draft.start, end: draft.end, travelBefore: draft.travelBefore, travelAfter: draft.travelAfter }]).hours;

  const nextDayStart = sydneyInstant(nextDay);
  const nextDayEnd = sydneyInstant(addDays(nextDay, 1));
  const highStakesNextDay = input.deadlines.some((d) => (d.kind === "exam" || d.kind === "trial" || d.kind === "assessment") && d.due >= nextDayStart && d.due < nextDayEnd);

  const studyHit = input.study.filter((b) => b.kind !== "rest" && overlap(b, span) > 0);
  const studyLostMin = Math.round(studyHit.reduce((a, b) => a + overlap(b, span), 0) / MIN);
  const clashes = [
    ...input.shifts.filter((s) => overlap(s, span) > 0).map((s) => ({ id: s.id, source: "shift" as const, fixed: true })),
    ...input.life.filter((o) => overlap(o, span) > 0).map((o) => ({ id: o.itemId, source: "life" as const, fixed: o.flexibility === "fixed" || o.importance >= 5 })),
    ...schoolSpans(day, schoolDays).filter((s) => overlap(s, span) > 0).map((s) => ({ id: s.id, source: "school" as const, fixed: true })),
    ...studyHit.map((b) => ({ id: b.id, source: "study" as const, fixed: false })),
  ];
  const deadlinesNext7 = input.deadlines.filter((d) => d.due >= input.now && d.due < input.now + 7 * 24 * HOUR).length;
  const urgentNotReady = input.deadlines.filter((d) => !d.ready && d.due >= draft.end && d.due < draft.end + 36 * HOUR).length;
  const weekFrom = sydneyInstant(addDays(day, 1 - weekdayOfKey(day)));
  const weekTo = weekFrom + 7 * 24 * HOUR;
  const inWeek = input.life.filter((o) => o.start >= weekFrom && o.start < weekTo);
  const balance = {
    socialMin: Math.round(inWeek.filter((o) => o.category === "social" || o.category === "family").reduce((a, o) => a + (o.end - o.start) / MIN, 0)),
    movement: inWeek.filter((o) => o.category === "fitness").length,
  };

  // Options, each checked against the calendar.
  const options: Option[] = [{ id: "go", kind: "go" }];
  const allBusy: Span[] = [
    ...input.shifts,
    ...input.life.map((o) => ({ start: o.start - o.travelBefore * MIN, end: o.end + o.travelAfter * MIN })),
    ...input.study.filter((b) => b.kind !== "rest"),
    ...[-3, -2, -1, 0, 1, 2, 3].flatMap((i) => schoolSpans(addDays(day, i), schoolDays)),
  ];
  const minimum = Math.min(SLEEP_MINIMUM_HOURS, prefs.sleep_hours);
  // Leave earlier: home in time for enough sleep, keeping at least half the event.
  if (sleepAfter < minimum) {
    const night = sleepFor(prefs, day, [...others, ...schoolSpans(nextDay, schoolDays)]);
    const latestHome = night.wake - minimum * HOUR - 30 * MIN;
    const end = Math.floor((latestHome - draft.travelAfter * MIN) / (15 * MIN)) * 15 * MIN;
    if (end - draft.start >= (draft.end - draft.start) / 2 && end < draft.end) options.push({ id: "leave_earlier", kind: "leave_earlier", end });
  }
  // Arrive later: after a clash at the start (a shift, a fixed plan or class).
  const startClash = [...input.shifts, ...schoolSpans(day, schoolDays)].filter((s) => s.start <= span.start && s.end > span.start).sort((a, b) => b.end - a.end)[0];
  if (startClash) {
    const start = Math.ceil((startClash.end + draft.travelBefore * MIN) / (15 * MIN)) * 15 * MIN;
    if (start < draft.end - (draft.end - draft.start) / 2) options.push({ id: "arrive_later", kind: "arrive_later", start });
  }
  // Swap a movable plan (e.g. the gym) that clashes to another verified slot within ±3 days.
  const busyWithDraft = [...allBusy, span];
  for (const o of input.life.filter((x) => overlap(x, span) > 0 && x.flexibility !== "fixed" && x.importance < 5).slice(0, 2)) {
    const len = Math.round((o.end - o.start) / MIN);
    const to = findSlot(len, Math.max(input.now, sydneyInstant(addDays(day, -3))), sydneyInstant(addDays(day, 4)), busyWithDraft.filter((b) => !(b.start === o.start - o.travelBefore * MIN && b.end === o.end + o.travelAfter * MIN)), prefs);
    if (to) options.push({ id: `swap:${o.itemId}`, kind: "swap", itemId: o.itemId, source: "life", from: { start: o.start, end: o.end }, to });
  }
  // Move clashing study earlier (same day or the days before), into a verified slot.
  for (const b of studyHit.slice(0, 3)) {
    const len = Math.round((b.end - b.start) / MIN);
    const others2 = busyWithDraft.filter((x) => !(x.start === b.start && x.end === b.end));
    const to = findSlot(len, Math.max(input.now, sydneyInstant(addDays(day, -2))), span.start, others2, prefs) ?? findSlot(len, span.end, sydneyInstant(addDays(day, 3)), others2, prefs);
    if (to) options.push({ id: `move:${b.id}`, kind: "move_study", blockId: b.id, from: { start: b.start, end: b.end }, to });
  }
  options.push({ id: "skip", kind: "skip" });

  return { sleepBefore, sleepAfter, sleepAfterWithout, nextDayEarlyStart: nextMorning ? nextMorning.start : null, highStakesNextDay, studyLostMin, clashes, deadlinesNext7, urgentNotReady, balance, want: draft.want, options };
}

export type Verdict = "go" | "go but shorter" | "swap" | "skip";

// Usually "go": social life, exercise and rest are real priorities. Only a real
// conflict changes that: too little sleep before a high-stakes day, a deadline
// that can't be saved, or a double booking with something fixed.
export function defaultVerdict(e: Evaluation, prefs: LifePrefs): Verdict {
  const minimum = Math.min(SLEEP_MINIMUM_HOURS, prefs.sleep_hours);
  const fixedClash = e.clashes.some((c) => c.fixed);
  const hasSwap = e.options.some((o) => o.kind === "swap" || o.kind === "arrive_later");
  if (fixedClash) return hasSwap ? "swap" : e.want >= 4 ? "swap" : "skip";
  if (e.highStakesNextDay && e.sleepAfter < minimum) return e.options.some((o) => o.kind === "leave_earlier") ? "go but shorter" : "skip";
  if (e.urgentNotReady > 0 && e.studyLostMin > 0 && !e.options.some((o) => o.kind === "move_study")) return "go but shorter";
  if (e.clashes.some((c) => c.source === "life") && hasSwap) return "swap";
  return "go";
}

// What goes to the AI: numbers, categories and option ids. Never titles,
// names or places.
export function advicePayload(draft: Draft, e: Evaluation): Record<string, unknown> {
  return {
    category: draft.category,
    hours: Math.round(((draft.end - draft.start) / HOUR) * 10) / 10,
    starts_hour: Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(draft.start)),
    weekday: weekdayOfKey(dayKey(draft.start)),
    how_much_they_want_to_go: e.want,
    sleep_night_before_h: Math.round(e.sleepBefore * 10) / 10,
    sleep_after_h: Math.round(e.sleepAfter * 10) / 10,
    sleep_after_if_skipped_h: Math.round(e.sleepAfterWithout * 10) / 10,
    high_stakes_next_day: e.highStakesNextDay,
    study_lost_min: e.studyLostMin,
    clashes: e.clashes.map((c) => ({ with: c.source, fixed: c.fixed })),
    deadlines_next_7_days: e.deadlinesNext7,
    urgent_not_ready: e.urgentNotReady,
    social_min_this_week: e.balance.socialMin,
    exercise_sessions_this_week: e.balance.movement,
    options: e.options.map((o) => ({ id: o.id, kind: o.kind })),
  };
}
