// Checks every study block the AI proposes, and repairs or rejects what doesn't fit.
import { dayKey, isTimeKey, sydneyInstant, weekdayOfKey } from "@/lib/time";
import type { Window } from "./free-time";

export type BlockKind = "study" | "flashcards" | "practice" | "rest";
export type ProposedBlock = { day: string; start: string; minutes: number; subject: string; topic?: string; kind: BlockKind };
export type ValidBlock = { starts_at: string; ends_at: string; subject: string; topic: string | null; kind: BlockKind };
export type Limits = { maxSchoolDayMin: number; maxFreeDayMin: number; restDay: number; schoolDays?: number[] };

export const BLOCK_KINDS: BlockKind[] = ["study", "flashcards", "practice", "rest"];
export const MAX_BLOCKS = 40;

export function parseProposed(value: unknown): ProposedBlock[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { blocks?: unknown }).blocks)) return null;
  const out: ProposedBlock[] = [];
  for (const b of (value as { blocks: unknown[] }).blocks.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const day = typeof o.day === "string" ? o.day : "";
    const start = typeof o.start === "string" ? o.start.padStart(5, "0") : "";
    const minutes = Math.round(Number(o.minutes));
    const kind = BLOCK_KINDS.includes(o.kind as BlockKind) ? (o.kind as BlockKind) : "study";
    const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 80) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isTimeKey(start) || !Number.isFinite(minutes)) continue;
    out.push({ day, start, minutes, subject: subject || (kind === "rest" ? "Rest" : "Study"), topic: typeof o.topic === "string" ? o.topic.trim().slice(0, 120) : undefined, kind });
  }
  return out;
}

// Keeps a block only if it sits fully inside a free window, doesn't overlap
// another kept block, is 20–120 minutes, and the day isn't over its limit.
// A block that spills past its window is trimmed if at least 20 minutes remain.
export function validateBlocks(proposed: ProposedBlock[], windows: Window[], limits: Limits, weekDays: string[]): { blocks: ValidBlock[]; rejected: number; addedRest: boolean } {
  const school = new Set(limits.schoolDays ?? [1, 2, 3, 4, 5]);
  const kept: { start: number; end: number; b: ProposedBlock }[] = [];
  const perDay = new Map<string, number>();
  let rejected = 0;

  for (const b of [...proposed].sort((x, y) => (x.day + x.start).localeCompare(y.day + y.start))) {
    if (!weekDays.includes(b.day)) {
      rejected++;
      continue;
    }
    const minutes = Math.min(120, b.minutes);
    if (minutes < 20) {
      rejected++;
      continue;
    }
    const start = sydneyInstant(b.day, b.start);
    const win = windows.find((w) => start >= w.start && start < w.end);
    if (!win) {
      rejected++;
      continue;
    }
    const end = Math.min(start + minutes * 60_000, win.end);
    if ((end - start) / 60_000 < 20 || kept.some((k) => start < k.end && end > k.start)) {
      rejected++;
      continue;
    }
    const cap = b.kind === "rest" ? Infinity : school.has(weekdayOfKey(b.day)) ? limits.maxSchoolDayMin : limits.maxFreeDayMin;
    const used = perDay.get(b.day) ?? 0;
    const mins = (end - start) / 60_000;
    if (b.kind !== "rest" && (used + mins > cap || weekdayOfKey(b.day) === limits.restDay)) {
      rejected++;
      continue;
    }
    if (b.kind !== "rest") perDay.set(b.day, used + mins);
    kept.push({ start, end, b });
  }

  // At least one rest block a week: add one in the longest free window on the rest day if missing.
  let addedRest = false;
  if (!kept.some((k) => k.b.kind === "rest")) {
    const restDay = weekDays.find((d) => weekdayOfKey(d) === limits.restDay) ?? weekDays[weekDays.length - 1];
    const win = windows.filter((w) => w.day === restDay && !kept.some((k) => k.start < w.end && k.end > w.start)).sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    if (win) {
      kept.push({ start: win.start, end: Math.min(win.end, win.start + 120 * 60_000), b: { day: restDay, start: "00:00", minutes: 120, subject: "Rest", kind: "rest" } });
      addedRest = true;
    }
  }

  return {
    blocks: kept
      .sort((a, b) => a.start - b.start)
      .map((k) => ({ starts_at: new Date(k.start).toISOString(), ends_at: new Date(k.end).toISOString(), subject: k.b.subject, topic: k.b.topic ?? null, kind: k.b.kind })),
    rejected,
    addedRest,
  };
}

export function dayOf(ms: number): string {
  return dayKey(ms);
}
