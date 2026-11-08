import assert from "node:assert/strict";
import { test } from "node:test";
import { hoursMessage, lastPayWeek, minutesByDay, payWeekStart } from "@/lib/cleaning";
import { clashingIds } from "@/lib/shifts";
import { hashToken, newToken, sameHash } from "@/lib/device-tokens";
import { sydneyInstant } from "@/lib/time";

const at = (day: string, time: string) => new Date(sydneyInstant(day, time)).toISOString();
const shift = (id: string, day: string, start: string, endDay: string, end: string, br = 0) => ({ id, job_id: "j", starts_at: at(day, start), ends_at: at(endDay, end), unpaid_break_minutes: br, rate_override_cents: null });

test("pay week starts on Wednesday and the report covers the week just ended", () => {
  assert.equal(payWeekStart("2026-11-04", 3), "2026-11-04"); // Wed
  assert.equal(payWeekStart("2026-11-10", 3), "2026-11-04"); // Tue
  const wedMorning = sydneyInstant("2026-11-04", "07:00");
  assert.deepEqual(lastPayWeek(wedMorning, 3), { start: "2026-10-28", end: "2026-11-03" });
});

test("hours: breaks subtracted, midnight shifts split, only completed shifts", () => {
  const now = sydneyInstant("2026-11-04", "07:00");
  const shifts = [
    shift("a", "2026-10-28", "17:00", "2026-10-28", "20:00", 30), // Wed 2.5 h
    shift("b", "2026-10-30", "22:00", "2026-10-31", "01:00"), // Fri 2 h + Sat 1 h
    shift("c", "2026-11-04", "06:00", "2026-11-04", "09:00"), // not finished, next week anyway
  ];
  const byDay = minutesByDay(shifts, "2026-10-28", "2026-11-03", now);
  assert.equal(byDay.get("2026-10-28"), 150);
  assert.equal(byDay.get("2026-10-30"), 120);
  assert.equal(byDay.get("2026-10-31"), 60);
  const msg = hoursMessage(shifts, [{ id: "j", default_rate_cents: 2000 }], { start: "2026-10-28", end: "2026-11-03" }, now, { includePay: true });
  assert.equal(msg.text, "Cleaning hours Wed 28 Oct – Tue 3 Nov: Wed 2.5 h, Fri 2 h, Sat 1 h. Total 5.5 h. About $110.00 before tax.");
});

test("hours across the daylight-saving change count real time", () => {
  // 4 Oct 2026, clocks go forward at 2am: 1am → 4am is only 2 real hours.
  const s = [shift("d", "2026-10-04", "01:00", "2026-10-04", "04:00")];
  const m = minutesByDay(s, "2026-09-30", "2026-10-06", sydneyInstant("2026-10-07", "07:00"));
  assert.equal(m.get("2026-10-04"), 120);
});

test("clash detection finds overlapping shifts", () => {
  const c = clashingIds([
    { id: "1", starts_at: at("2026-11-06", "16:00"), ends_at: at("2026-11-06", "20:00") },
    { id: "2", starts_at: at("2026-11-06", "19:00"), ends_at: at("2026-11-06", "23:00") },
    { id: "3", starts_at: at("2026-11-06", "23:00"), ends_at: at("2026-11-07", "01:00") },
  ]);
  assert.deepEqual([...c].sort(), ["1", "2"]);
});

test("device tokens: random, hashed, compared safely", () => {
  const a = newToken("dash");
  const b = newToken("dash");
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.ok(a.token.startsWith("dash_") && a.token.length > 40);
  assert.ok(sameHash(a.hash, hashToken(a.token)));
  assert.ok(!sameHash(a.hash, b.hash));
});
