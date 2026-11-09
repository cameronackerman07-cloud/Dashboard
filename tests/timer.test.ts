import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkManual,
  countedOnFinish,
  dailyTotals,
  elapsedSeconds,
  GRACE_SECONDS,
  remainingSeconds,
  splitByDay,
  streaks,
  sweepDecision,
  type StudySession,
} from "@/lib/study-time";
import { sydneyInstant } from "@/lib/time";

const base: StudySession = {
  id: "s1",
  subject: "Physics",
  topic: null,
  kind: "focus",
  planned_seconds: 25 * 60,
  started_at: new Date(sydneyInstant("2026-11-09", "16:00")).toISOString(),
  ended_at: null,
  paused_seconds: 0,
  paused_at: null,
  status: "running",
  counted_seconds: null,
  source: "timer",
  planner_block_id: null,
  group_id: null,
  notes: null,
  counts_as_external: true,
};
const start = new Date(base.started_at).getTime();

test("elapsed time comes from timestamps and ignores pauses", () => {
  assert.equal(elapsedSeconds(base, start + 10 * 60_000), 600);
  const paused = { ...base, status: "paused" as const, paused_at: new Date(start + 10 * 60_000).toISOString() };
  assert.equal(elapsedSeconds(paused, start + 50 * 60_000), 600); // paused time doesn't count
  const resumed = { ...base, paused_seconds: 300 };
  assert.equal(elapsedSeconds(resumed, start + 20 * 60_000), 900);
  assert.equal(remainingSeconds(resumed, start + 20 * 60_000), 600);
});

test("finishing early counts real time; reaching zero counts the planned time exactly", () => {
  assert.equal(countedOnFinish(base, start + 12 * 60_000), 720);
  assert.equal(countedOnFinish(base, start + 40 * 60_000), 25 * 60);
});

test("a forgotten timer is closed at the planned end, counting only the planned time", () => {
  assert.deepEqual(sweepDecision(base, start + 30 * 60_000), { action: "none" }); // still in the grace window
  const later = start + 25 * 60_000 + GRACE_SECONDS * 1000 + 1;
  const d = sweepDecision(base, later);
  assert.equal(d.action, "auto_close");
  if (d.action === "auto_close") {
    assert.equal(d.counted, 25 * 60);
    assert.equal(d.ended_at, start + 25 * 60_000);
  }
});

test("sessions that cross midnight are split by Sydney day, including daylight saving", () => {
  const late = sydneyInstant("2026-11-09", "23:30");
  const split = splitByDay(late, 3600);
  assert.equal(split.get("2026-11-09"), 1800);
  assert.equal(split.get("2026-11-10"), 1800);
  // DST starts 4 Oct 2026 at 2am (clocks go to 3am): midnight is still midnight.
  const before = sydneyInstant("2026-10-03", "23:00");
  const s2 = splitByDay(before, 2 * 3600);
  assert.equal(s2.get("2026-10-03"), 3600);
  assert.equal(s2.get("2026-10-04"), 3600);
});

test("under a minute isn't counted, manual entries are limited", () => {
  const tiny = { ...base, status: "completed" as const, counted_seconds: 30 };
  assert.equal(dailyTotals([tiny]).size, 0);
  assert.equal(checkManual("2026-11-09", 400, "2026-11-09") !== null, true); // over 6 hours
  assert.equal(checkManual("2026-09-01", 30, "2026-11-09") !== null, true); // over 30 days back
  assert.equal(checkManual("2026-11-10", 30, "2026-11-09") !== null, true); // future
  assert.equal(checkManual("2026-11-08", 30, "2026-11-09"), null);
});

test("one rest day doesn't break a streak, two do", () => {
  const days = new Map([
    ["2026-11-01", 3600],
    ["2026-11-02", 3600],
    ["2026-11-04", 3600], // 3rd off: still going
    ["2026-11-05", 3600],
    ["2026-11-08", 3600], // 6th and 7th off: broken
    ["2026-11-09", 3600],
  ]);
  assert.deepEqual(streaks(days, "2026-11-09"), { current: 2, best: 4 });
});
