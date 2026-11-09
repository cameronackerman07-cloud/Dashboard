import assert from "node:assert/strict";
import { test } from "node:test";
import { isView, parseEvent, viewRange } from "@/lib/calendar-edit";
import { dayKey, timeKey } from "@/lib/time";

test("a timed event is stored in Sydney time", () => {
  const r = parseEvent({ title: "  Dentist ", startDay: "2026-11-12", startTime: "15:30", endDay: "2026-11-12", endTime: "16:15", location: "Hornsby" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.row.title, "Dentist");
  assert.equal(r.row.location, "Hornsby");
  assert.equal(r.row.all_day, false);
  // Sydney is UTC+11 in November (daylight saving).
  assert.equal(r.row.starts_at, "2026-11-12T04:30:00.000Z");
  assert.equal(timeKey(Date.parse(r.row.ends_at)), "16:15");
});

test("an all-day event runs from midnight to the midnight after its last day", () => {
  const r = parseEvent({ title: "Camp", allDay: true, startDay: "2026-11-18", endDay: "2026-11-20" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(dayKey(Date.parse(r.row.starts_at)), "2026-11-18");
  assert.equal(dayKey(Date.parse(r.row.ends_at)), "2026-11-21");
  assert.equal(timeKey(Date.parse(r.row.ends_at)), "00:00");
});

test("bad events are refused with a plain reason", () => {
  const cases = [
    { title: "", startDay: "2026-11-12", startTime: "10:00", endTime: "11:00" },
    { title: "X", startDay: "2026-02-30", startTime: "10:00", endTime: "11:00" },
    { title: "X", startDay: "2026-11-12", startTime: "11:00", endTime: "10:00" },
    { title: "X", startDay: "2026-11-12", endDay: "2026-11-10", allDay: true },
    { title: "X", startDay: "2026-11-12", startTime: "25:00", endTime: "26:00" },
    { title: "X", startDay: "2026-01-01", endDay: "2026-03-01", allDay: true },
    { title: "X", startDay: "2026-11-12" },
  ];
  for (const c of cases) {
    const r = parseEvent(c);
    assert.ok(!r.ok, JSON.stringify(c));
    if (!r.ok) assert.ok(r.message.length > 5);
  }
});

test("text is trimmed, cut short and has no control characters", () => {
  const r = parseEvent({ title: "a\u0000b" + "x".repeat(300), location: "   ", startDay: "2026-11-12", allDay: "on" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.row.title.length, 120);
  assert.ok(!r.row.title.includes("\u0000"));
  assert.equal(r.row.location, null);
  assert.equal(r.row.all_day, true);
});

test("views: day, week, month and agenda", () => {
  const day = viewRange("day", "2026-11-11");
  assert.deepEqual(day.days, ["2026-11-11"]);
  assert.equal(day.prev, "2026-11-10");
  assert.equal(day.next, "2026-11-12");

  const week = viewRange("week", "2026-11-11"); // a Wednesday
  assert.equal(week.days[0], "2026-11-09");
  assert.equal(week.days.length, 7);
  assert.equal(week.next, "2026-11-16");

  const month = viewRange("month", "2026-11-11");
  assert.equal(month.month, "2026-11");
  assert.equal(month.days[0], "2026-10-26"); // the Monday before 1 Nov (a Sunday)
  assert.equal(month.days.length % 7, 0);
  assert.ok(month.days.includes("2026-11-30"));
  assert.equal(month.prev, "2026-10-01");
  assert.equal(month.next, "2026-12-01");
  assert.equal(viewRange("month", "2026-12-31").next, "2027-01-01");
  assert.equal(viewRange("month", "2026-01-15").prev, "2025-12-01");

  const agenda = viewRange("agenda", "2026-11-11");
  assert.equal(agenda.days.length, 14);
  assert.equal(agenda.next, "2026-11-25");

  assert.ok(isView("month") && !isView("year") && !isView(undefined));
});
