// Scores a week for balance: sleep, study, movement, social time, downtime and
// rest. Hard violations (the plan must be repaired) and gentle warnings.
// Pure code; used by the planner, My life, the advisor and the agents.

import { SLEEP_MINIMUM_HOURS, sleepFor, sleepWindow, type LifePrefs, type Occurrence } from "@/lib/life";
import { addDays, sydneyInstant, weekdayOfKey } from "@/lib/time";

export type Span = { start: number; end: number };
export type StudySpan = Span & { kind: string };

export type BalanceInput = {
  weekStart: string;
  prefs: LifePrefs;
  study: StudySpan[];
  life: Occurrence[];
  shifts: Span[];
  schoolDays?: number[];
  examWeek?: boolean; // more study allowed before big assessments (sleep and rest stay protected)
};

export type Violation = { kind: "sleep" | "study_cap" | "no_rest" | "study_in_sleep"; day: string | null; message: string };

export type DayBalance = { day: string; studyMin: number; sleepHours: number; downtimeMin: number; capMin: number };

export type Balance = {
  days: DayBalance[];
  totals: { sleepAvg: number; studyMin: number; movement: number; socialMin: number; restBlocks: number; downtimeAvg: number };
  targets: { sleep: number; studyMax: number; movement: number; socialMin: number; downtime: number };
  violations: Violation[];
  warnings: string[];
};

const MIN = 60_000;
const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

export function capFor(prefs: LifePrefs, day: string, schoolDays: number[], examWeek: boolean): number {
  const base = schoolDays.includes(weekdayOfKey(day)) ? prefs.max_study_school_day_min : prefs.max_study_weekend_min;
  return Math.round(base * (examWeek ? 1.25 : 1));
}

export function scoreWeek(input: BalanceInput): Balance {
  const { prefs } = input;
  const schoolDays = input.schoolDays ?? [1, 2, 3, 4, 5];
  const days: DayBalance[] = [];
  const violations: Violation[] = [];
  const commitments = [...input.life.map((o) => ({ start: o.start, end: o.end, travelBefore: o.travelBefore, travelAfter: o.travelAfter })), ...input.shifts];

  for (let i = 0; i < 7; i++) {
    const day = addDays(input.weekStart, i);
    const from = sydneyInstant(day);
    const to = sydneyInstant(addDays(day, 1));
    const dayStudy = input.study.filter((s) => s.kind !== "rest" && s.start < to && s.end > from);
    const studyMin = Math.round(dayStudy.reduce((a, s) => a + overlap(s, { start: from, end: to }), 0) / MIN);
    const cap = capFor(prefs, day, schoolDays, !!input.examWeek);
    const sleep = sleepFor(prefs, day, commitments);

    // Study inside tonight's sleep window or wind-down.
    const win = sleepWindow(prefs, day);
    const protectedSpan = { start: win.start - prefs.wind_down_min * MIN, end: win.end };
    if (input.study.some((s) => s.kind !== "rest" && overlap(s, protectedSpan) > 0)) {
      violations.push({ kind: "study_in_sleep", day, message: `Study is planned in the wind-down or sleep time on ${day}.` });
    }
    if (studyMin > cap) violations.push({ kind: "study_cap", day, message: `${studyMin} minutes of study on ${day} is over the ${cap}-minute limit.` });
    if (sleep.hours < Math.min(SLEEP_MINIMUM_HOURS, prefs.sleep_hours) - 0.01) {
      violations.push({ kind: "sleep", day, message: `Only about ${sleep.hours.toFixed(1)} hours of sleep is possible on the night of ${day}.` });
    }

    // Downtime: awake time not taken by school, study, plans, shifts or meals.
    const wokeAt = sleepFor(prefs, addDays(day, -1), commitments).wake;
    const awake = Math.max(0, (sleep.bedtime - wokeAt) / MIN);
    const school = schoolDays.includes(weekdayOfKey(day)) ? 7 * 60 + 30 : 0; // 8:30–3:30 plus getting there
    const busyMin = [...input.life, ...input.shifts].reduce((a, s) => a + overlap(s, { start: from, end: to }) / MIN, 0);
    const downtimeMin = Math.max(0, Math.round(awake - school - studyMin - busyMin - 90));
    days.push({ day, studyMin, sleepHours: Math.round(sleep.hours * 10) / 10, downtimeMin, capMin: cap });
  }

  const restBlocks = input.study.filter((s) => s.kind === "rest").length + input.life.filter((o) => o.category === "rest").length;
  if (restBlocks < Math.max(1, prefs.rest_blocks_per_week)) violations.push({ kind: "no_rest", day: null, message: "There's no rest block this week." });

  const movement = input.life.filter((o) => o.category === "fitness").length;
  const socialMin = Math.round(input.life.filter((o) => o.category === "social" || o.category === "family").reduce((a, o) => a + (o.end - o.start) / MIN, 0));
  const warnings: string[] = [];
  if (movement < prefs.exercise_per_week) warnings.push(`${movement} of ${prefs.exercise_per_week} exercise sessions planned.`);
  if (socialMin < prefs.social_hours_per_week * 60) warnings.push(`${Math.round(socialMin / 6) / 10} of ${prefs.social_hours_per_week} hours of social or family time planned.`);
  const lowDowntime = days.filter((d) => d.downtimeMin < prefs.downtime_min_per_day);
  if (lowDowntime.length) warnings.push(`Less than ${prefs.downtime_min_per_day} minutes of downtime on ${lowDowntime.length} day${lowDowntime.length === 1 ? "" : "s"}.`);

  return {
    days,
    totals: {
      sleepAvg: Math.round((days.reduce((a, d) => a + d.sleepHours, 0) / 7) * 10) / 10,
      studyMin: days.reduce((a, d) => a + d.studyMin, 0),
      movement,
      socialMin,
      restBlocks,
      downtimeAvg: Math.round(days.reduce((a, d) => a + d.downtimeMin, 0) / 7),
    },
    targets: {
      sleep: prefs.sleep_hours,
      studyMax: days.reduce((a, d) => a + d.capMin, 0),
      movement: prefs.exercise_per_week,
      socialMin: prefs.social_hours_per_week * 60,
      downtime: prefs.downtime_min_per_day,
    },
    violations,
    warnings,
  };
}

// Drops study blocks that break a hard rule (in the sleep window or wind-down,
// or over a day's cap: the latest go first). Sleep problems caused by other
// plans are reported, not "fixed" by moving the student's own plans.
export function repairStudy<T extends StudySpan>(blocks: T[], input: Omit<BalanceInput, "study">): { kept: T[]; dropped: number } {
  const { prefs } = input;
  const schoolDays = input.schoolDays ?? [1, 2, 3, 4, 5];
  let kept = [...blocks].sort((a, b) => a.start - b.start);
  const before = kept.length;
  for (let i = -1; i < 7; i++) {
    const day = addDays(input.weekStart, i);
    const win = sleepWindow(prefs, day);
    const protectedSpan = { start: win.start - prefs.wind_down_min * MIN, end: win.end };
    kept = kept.filter((b) => b.kind === "rest" || overlap(b, protectedSpan) === 0);
  }
  for (let i = 0; i < 7; i++) {
    const day = addDays(input.weekStart, i);
    const from = sydneyInstant(day);
    const to = sydneyInstant(addDays(day, 1));
    const cap = capFor(prefs, day, schoolDays, !!input.examWeek);
    let used = 0;
    kept = kept.filter((b) => {
      if (b.kind === "rest" || b.start >= to || b.end <= from) return true;
      const m = overlap(b, { start: from, end: to }) / MIN;
      if (used + m > cap) return false;
      used += m;
      return true;
    });
  }
  return { kept, dropped: before - kept.length };
}
