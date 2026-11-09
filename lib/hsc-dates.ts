// Official 2027 HSC dates, from the NSW Government HSC key dates page.
// If NESA changes them, the weekly "HSC dates check" agent makes a finding;
// update this file by hand. Never let code edit these on its own.

import { dayKey,daysBetween, formatDayKeyLong } from "@/lib/time";

export const HSC_DATES = {
  source: "https://www.nsw.gov.au/education-and-training/key-dates/hsc",
  checkedOn: "2026-11-09",
  year: 2027,
  writtenStart: "2027-10-13", // Wednesday 13 October 2027: first possible written exam day
  writtenEndBy: "2027-11-05", // Friday 5 November 2027 at the latest
  writtenTimetable: "2027-04-30", // Friday 30 April 2027
  oralTimetable: "2027-04-27", // Tuesday 27 April 2027 (languages orals)
  practicalTimetable: "2026-11-30", // Monday 30 November 2026
  results: "2027-12-15", // Wednesday 15 December 2027
} as const;

// The phrase the dates check looks for on the official page.
export const WRITTEN_START_PHRASE = "13 October 2027";

// Your personal exam timetable appears in NESA Students Online once it's released.
export const STUDENTS_ONLINE_URL = "https://studentsonline.nesa.nsw.edu.au/";

// Whole calendar days from today (Sydney) to that day. 0 = today.
export function daysUntil(day: string, now: number): number {
  return daysBetween(dayKey(now), day);
}

// "48 weeks, 2 days"
export function weeksAndDays(days: number): string {
  if (days <= 0) return days === 0 ? "today" : "passed";
  const w = Math.floor(days / 7);
  const d = days % 7;
  const wp = `${w} week${w === 1 ? "" : "s"}`;
  const dp = `${d} day${d === 1 ? "" : "s"}`;
  if (!w) return dp;
  return d ? `${wp}, ${dp}` : wp;
}

export function countdownLabel(now: number): { days: number; parts: string; date: string; sr: string } {
  const days = daysUntil(HSC_DATES.writtenStart, now);
  const date = `${formatDayKeyLong(HSC_DATES.writtenStart)} ${HSC_DATES.year}`;
  const sr =
    days > 0
      ? `${days} day${days === 1 ? "" : "s"} until the ${HSC_DATES.year} HSC written exams begin on ${date}`
      : days === 0
        ? `The ${HSC_DATES.year} HSC written exams begin today`
        : `The ${HSC_DATES.year} HSC written exams have begun`;
  return { days, parts: weeksAndDays(days), date, sr };
}

// Milestones The BRIAN mentions in the briefing.
export const MILESTONES = [300, 200, 100, 50, 30, 14, 7];

export function isMilestone(days: number): boolean {
  return MILESTONES.includes(days);
}

// The timetable comes out on this day; before it, ask for personal dates later.
export function timetableReleased(now: number): boolean {
  return dayKey(now) >= HSC_DATES.writtenTimetable;
}

export function hscSentence(now: number): string {
  const { days, parts } = countdownLabel(now);
  if (days > 0) return `${days} days until the HSC written exams begin, on ${formatDayKeyLong(HSC_DATES.writtenStart)}. That's ${parts}.`;
  if (days === 0) return "The HSC written exams begin today. Good luck.";
  if (dayKey(now) <= HSC_DATES.writtenEndBy) return "The HSC written exams are on now.";
  const r = daysBetween(dayKey(now), HSC_DATES.results);
  return r > 0 ? `The exams are done. Results come out in ${r} days.` : "The HSC is finished.";
}
