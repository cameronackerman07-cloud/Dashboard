// Deadlines & clashes maths (pure code, no AI). Used by the "deadlines" agent
// and its tests. All times are milliseconds; days are Sydney day keys.

import { addDays, dayKey, sydneyInstant } from "@/lib/time";

export type TimedItem = { id: string; kind: "shift" | "event" | "study"; title: string; start: number; end: number };
export type DueItem = { id: string; title: string; due: number };

export type Clash = { a: TimedItem; b: TimedItem; key: string };

// Every pair of overlapping items (touching end-to-start is not a clash).
// Two study blocks never clash with each other here: the planner already stops that.
export function findClashes(items: TimedItem[]): Clash[] {
  const sorted = [...items].filter((i) => i.end > i.start).sort((x, y) => x.start - y.start);
  const out: Clash[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.kind === "study" && b.kind === "study") continue;
      const [x, y] = [a.id, b.id].sort();
      out.push({ a, b, key: `clash:${x}:${y}` });
    }
  }
  return out;
}

// Things due within `hours` that have no study block between now and the due time.
export function dueWithoutStudy(tasks: DueItem[], blocks: TimedItem[], now: number, hours = 48): DueItem[] {
  const limit = now + hours * 3_600_000;
  return tasks.filter((t) => t.due > now && t.due <= limit && !blocks.some((b) => b.kind === "study" && b.start >= now && b.start < t.due));
}

// Shifts ending at or after `lateAt` (Sydney time) on the night before something is due.
export function lateBeforeDue(shifts: TimedItem[], tasks: DueItem[], lateAt = "21:00"): { shift: TimedItem; task: DueItem }[] {
  const out: { shift: TimedItem; task: DueItem }[] = [];
  for (const t of tasks) {
    const dueDay = dayKey(t.due);
    const nightBefore = addDays(dueDay, -1);
    const late = sydneyInstant(nightBefore, lateAt);
    const dayEnd = sydneyInstant(dueDay, "06:00");
    for (const s of shifts) {
      if (s.kind === "shift" && s.end >= late && s.end <= Math.min(dayEnd, t.due)) out.push({ shift: s, task: t });
    }
  }
  return out;
}

export type Load = "light" | "normal" | "heavy";

// Same thresholds as The BRIAN's Sunday reset, so the two always agree.
export function loadRating(dueCount: number, shiftCount: number, eventCount = 0): Load {
  const n = dueCount + shiftCount + Math.floor(eventCount / 2);
  return n >= 8 ? "heavy" : n >= 4 ? "normal" : "light";
}
