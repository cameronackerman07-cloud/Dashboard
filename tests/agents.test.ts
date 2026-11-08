import assert from "node:assert/strict";
import { test } from "node:test";
import { dueWithoutStudy, findClashes, lateBeforeDue, loadRating, type TimedItem } from "@/lib/deadlines";
import { diffItems, importanceFor, snapshot } from "@/lib/agents/watch";
import { sydneyInstant } from "@/lib/time";

const t = (day: string, time: string) => sydneyInstant(day, time);
const item = (id: string, kind: TimedItem["kind"], day: string, a: string, b: string): TimedItem => ({ id, kind, title: id, start: t(day, a), end: t(day, b) });

test("clashes: overlapping items found once with a stable key; touching is fine", () => {
  const items = [item("b", "shift", "2026-11-10", "16:00", "19:00"), item("a", "event", "2026-11-10", "18:30", "20:00"), item("c", "event", "2026-11-10", "20:00", "21:00")];
  const c = findClashes(items);
  assert.equal(c.length, 1);
  assert.equal(c[0].key, "clash:a:b");
  assert.equal(findClashes([...items].reverse())[0].key, "clash:a:b");
});

test("clashes: two study blocks don't count, study vs shift does", () => {
  const items = [item("s1", "study", "2026-11-10", "16:00", "17:00"), item("s2", "study", "2026-11-10", "16:30", "17:30"), item("w", "shift", "2026-11-10", "17:00", "18:00")];
  assert.deepEqual(findClashes(items).map((c) => c.key), ["clash:s2:w"]);
});

test("due within 48 hours with no study block", () => {
  const now = t("2026-11-10", "08:00");
  const tasks = [{ id: "x", title: "X", due: t("2026-11-11", "09:00") }, { id: "y", title: "Y", due: t("2026-11-11", "09:00") }, { id: "z", title: "Z", due: t("2026-11-20", "09:00") }];
  const blocks = [item("b", "study", "2026-11-10", "17:00", "18:00")];
  assert.equal(dueWithoutStudy(tasks, blocks, now).length, 0);
  assert.deepEqual(dueWithoutStudy(tasks, [], now).map((x) => x.id), ["x", "y"]);
});

test("late shift the night before a due date", () => {
  const shifts = [item("late", "shift", "2026-11-10", "18:00", "22:30"), item("early", "shift", "2026-11-10", "15:00", "18:00")];
  const due = [{ id: "d", title: "Essay", due: t("2026-11-11", "09:00") }];
  assert.deepEqual(lateBeforeDue(shifts, due).map((x) => x.shift.id), ["late"]);
});

test("load rating thresholds", () => {
  assert.equal(loadRating(1, 1), "light");
  assert.equal(loadRating(2, 2), "normal");
  assert.equal(loadRating(5, 3), "heavy");
});

test("assignment watch: first run is quiet, then new / moved / overdue", () => {
  const now = t("2026-11-10", "08:00");
  const a = { key: "canvas:1", title: "A", course: null, due: t("2026-11-12", "09:00"), url: null };
  assert.equal(diffItems([a], null, null, now).length, 0);
  const seen = snapshot([a], now);
  const b = { key: "classroom:2", title: "B", course: null, due: t("2026-11-15", "09:00"), url: null };
  const moved = { ...a, due: t("2026-11-11", "09:00") };
  const types = diffItems([moved, b], seen, now - 3_600_000, now).map((c) => c.type).sort();
  assert.deepEqual(types, ["moved", "new"]);
  const overdue = { ...a, due: now - 60_000 };
  assert.deepEqual(diffItems([overdue], { "canvas:1": overdue.due }, now - 3_600_000, now).map((c) => c.type), ["overdue"]);
});

test("importance rises as the due date nears", () => {
  const now = t("2026-11-10", "08:00");
  assert.equal(importanceFor(now + 2 * 3_600_000, now), 5);
  assert.equal(importanceFor(now + 48 * 3_600_000, now), 4);
  assert.equal(importanceFor(now + 5 * 86_400_000, now), 3);
  assert.equal(importanceFor(now + 20 * 86_400_000, now), 2);
});
