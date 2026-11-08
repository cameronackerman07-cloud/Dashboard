// Shared shift maths, used by Shifts, Pay & budget and Home.

import { formatDayKey } from "@/lib/time";

export const JOB_KINDS = [
  { value: "work", label: "Work" },
  { value: "sport-ref", label: "Sport / refereeing" },
  { value: "gig", label: "Gig" },
  { value: "other", label: "Other" },
] as const;

export type JobKind = (typeof JOB_KINDS)[number]["value"];

export function isJobKind(value: unknown): value is JobKind {
  return JOB_KINDS.some((k) => k.value === value);
}

export type Job = { id: string; name: string; default_rate_cents: number; kind: JobKind };

export type Shift = {
  id: string;
  job_id: string;
  starts_at: string;
  ends_at: string;
  unpaid_break_minutes: number;
  rate_override_cents: number | null;
  notes: string | null;
};

// Paid minutes: the shift length minus the unpaid break (never below zero).
export function paidMinutes(shift: Pick<Shift, "starts_at" | "ends_at" | "unpaid_break_minutes">): number {
  const total = (new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 60_000;
  return Math.max(0, Math.round(total - shift.unpaid_break_minutes));
}

export function rateFor(shift: Pick<Shift, "rate_override_cents">, job: Pick<Job, "default_rate_cents"> | undefined): number {
  return shift.rate_override_cents ?? job?.default_rate_cents ?? 0;
}

// Estimated pay before tax, in cents.
export function shiftPayCents(shift: Shift, job: Job | undefined): number {
  return Math.round((paidMinutes(shift) / 60) * rateFor(shift, job));
}

export function totals(shifts: Shift[], jobs: Job[]): { minutes: number; cents: number } {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return shifts.reduce(
    (acc, s) => ({ minutes: acc.minutes + paidMinutes(s), cents: acc.cents + shiftPayCents(s, byId.get(s.job_id)) }),
    { minutes: 0, cents: 0 },
  );
}

// "7.5 h", "45 min"
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} h`;
}

// Ids of shifts that overlap another shift.
export function clashingIds(shifts: Pick<Shift, "id" | "starts_at" | "ends_at">[]): Set<string> {
  const sorted = [...shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ids = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const endA = new Date(sorted[i].ends_at).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      const startB = new Date(sorted[j].starts_at).getTime();
      if (startB >= endA) break;
      ids.add(sorted[i].id);
      ids.add(sorted[j].id);
    }
  }
  return ids;
}

// The note on the income transaction for a week's estimated shift pay, so a week
// is only logged once.
export function shiftPayNote(monday: string): string {
  return `Shift pay, week of ${formatDayKey(monday)}`;
}
