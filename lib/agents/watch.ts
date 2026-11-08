// Assignment watching (pure code, no AI): compares what Canvas and Classroom
// show now with what the agent saw last time, and says what's new, what moved
// and what has just become overdue.

export type WatchItem = { key: string; title: string; course: string | null; due: number | null; url: string | null };
export type Seen = Record<string, number | null>; // key → due time (ms) last time
export type Change =
  | { type: "new"; item: WatchItem }
  | { type: "moved"; item: WatchItem; from: number | null }
  | { type: "overdue"; item: WatchItem };

// Importance rises as the due date gets closer.
export function importanceFor(due: number | null, now: number): number {
  if (due == null) return 2;
  const hours = (due - now) / 3_600_000;
  if (hours < 0) return 4;
  if (hours <= 24) return 5;
  if (hours <= 72) return 4;
  if (hours <= 168) return 3;
  return 2;
}

export function diffItems(items: WatchItem[], seen: Seen | null, lastRun: number | null, now: number): Change[] {
  const out: Change[] = [];
  for (const item of items) {
    // Newly overdue: due between the last run and now.
    if (item.due != null && item.due <= now && lastRun != null && item.due > lastRun) out.push({ type: "overdue", item });
    if (!seen) continue; // first run: remember everything quietly
    if (!(item.key in seen)) {
      if (item.due == null || item.due > now) out.push({ type: "new", item });
    } else if ((seen[item.key] ?? null) !== item.due && (item.due == null || item.due > now)) {
      out.push({ type: "moved", item, from: seen[item.key] ?? null });
    }
  }
  return out;
}

// What to remember for next time (capped so the agent's settings stay small).
export function snapshot(items: WatchItem[], now: number, max = 400): Seen {
  const keep = items
    .filter((i) => i.due == null || i.due > now - 30 * 86_400_000)
    .sort((a, b) => (b.due ?? Infinity) - (a.due ?? Infinity))
    .slice(0, max);
  return Object.fromEntries(keep.map((i) => [i.key, i.due]));
}
