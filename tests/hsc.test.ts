import assert from "node:assert/strict";
import { test } from "node:test";
import { datesStillMatch } from "@/lib/agents/builtin/hsc-dates";
import { countdownLabel, daysUntil, HSC_DATES, isMilestone, weeksAndDays } from "@/lib/hsc-dates";
import { sydneyInstant } from "@/lib/time";

test("days until the HSC are Sydney calendar days", () => {
  const now = sydneyInstant("2026-11-09", "12:00");
  assert.equal(daysUntil(HSC_DATES.writtenStart, now), 338);
  // 11:59pm and 12:01am the next day differ by one, in Sydney time.
  assert.equal(daysUntil(HSC_DATES.writtenStart, sydneyInstant("2026-11-09", "23:59")), 338);
  assert.equal(daysUntil(HSC_DATES.writtenStart, sydneyInstant("2026-11-10", "00:01")), 337);
  // UTC midday is already the next day in Sydney.
  assert.equal(daysUntil(HSC_DATES.writtenStart, Date.UTC(2026, 10, 9, 14, 0)), 337);
});

test("daylight saving boundaries don't shift the count", () => {
  // DST ends Sun 4 Apr 2027 at 3am (back to 2am); starts Sun 3 Oct 2027 at 2am.
  assert.equal(daysUntil("2027-04-05", sydneyInstant("2027-04-03", "23:30")), 2);
  assert.equal(daysUntil("2027-10-13", sydneyInstant("2027-10-02", "12:00")), 11);
  assert.equal(daysUntil("2027-10-13", sydneyInstant("2027-10-03", "03:30")), 10);
});

test("weeks and days, and the screen-reader sentence", () => {
  assert.equal(weeksAndDays(338), "48 weeks, 2 days");
  assert.equal(weeksAndDays(7), "1 week");
  assert.equal(weeksAndDays(3), "3 days");
  const c = countdownLabel(sydneyInstant("2026-11-09", "09:00"));
  assert.equal(c.sr, "338 days until the 2027 HSC written exams begin on Wednesday 13 October 2027");
  assert.equal(isMilestone(100), true);
  assert.equal(isMilestone(99), false);
});

test("the dates check only flags a real change", () => {
  assert.equal(datesStillMatch("The 2027 HSC written exams start on Wednesday 13 October 2027 and finish..."), true);
  assert.equal(datesStillMatch("The 2027 HSC written exams start on Wednesday\n 13  October 2027"), true);
  assert.equal(datesStillMatch("The 2027 HSC written exams start on Tuesday 12 October 2027"), false);
});
