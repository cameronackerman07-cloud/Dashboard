import { addDays, daysBetween } from "@/lib/time";

export type Habit = { id: string; name: string; archived: boolean };

// Days in a row up to today. Today not ticked yet doesn't break the streak:
// it counts back from yesterday until the day is over.
export function currentStreak(days: Set<string>, today: string): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

// The longest run of days in a row, ever.
export function bestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}
