// Spaced repetition: when a card should come back, based on how well you knew it.
// A simplified SM-2, the method Anki is based on.

export type Rating = "again" | "hard" | "good" | "easy";

export type Schedule = { interval_days: number; ease: number; due_at: string };

const MIN_EASE = 1.3;
const MAX_EASE = 3;
const AGAIN_MINUTES = 10;
const DAY_MS = 86_400_000;

export function nextReview(
  card: { interval_days: number; ease: number },
  rating: Rating,
  now: number,
): Schedule {
  const interval = card.interval_days;
  let ease = card.ease;
  let days: number;

  switch (rating) {
    case "again":
      ease -= 0.2;
      days = 0;
      break;
    case "hard":
      ease -= 0.15;
      days = Math.max(1, Math.round(interval * 1.2));
      break;
    case "good":
      days = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
      break;
    case "easy":
      ease += 0.15;
      days = interval === 0 ? 3 : Math.max(interval + 1, Math.round(interval * ease * 1.3));
      break;
  }

  return {
    interval_days: days,
    ease: Math.min(MAX_EASE, Math.max(MIN_EASE, ease)),
    due_at: new Date(days === 0 ? now + AGAIN_MINUTES * 60_000 : now + days * DAY_MS).toISOString(),
  };
}

// The label under each rating button, e.g. "3 days".
export function intervalLabel(schedule: Schedule): string {
  const days = schedule.interval_days;
  if (days === 0) return `${AGAIN_MINUTES} min`;
  return days === 1 ? "1 day" : `${days} days`;
}
