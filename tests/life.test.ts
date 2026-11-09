import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFS, expand, parseQuickAdd, sleepFor, sleepWindow, type LifeItem } from "@/lib/life";
import { advicePayload, defaultVerdict, evaluate, findSlot, type EvalInput } from "@/lib/life/evaluate";
import { soundsDistressed } from "@/lib/life/support";
import { repairStudy, scoreWeek } from "@/lib/planner/balance";
import { sydneyInstant, timeKey } from "@/lib/time";

const H = 3_600_000;
const prefs = DEFAULT_PREFS; // wake 6:45 on school days, 8.5 h sleep, 45 min wind-down

test("sleep window and late finishes, across midnight", () => {
  // Thursday night → Friday school day: in bed 22:15, up 06:45.
  const w = sleepWindow(prefs, "2026-11-12");
  assert.equal(w.end, sydneyInstant("2026-11-13", "06:45"));
  assert.equal(w.start, sydneyInstant("2026-11-12", "22:15"));
  // A party until 11:30pm with 30 min travel home: bed at 00:30, so 6.25 h.
  const party = { start: sydneyInstant("2026-11-12", "19:00"), end: sydneyInstant("2026-11-12", "23:30"), travelAfter: 30 };
  assert.equal(sleepFor(prefs, "2026-11-12", [party]).hours, 6.25);
  // Friday night → Saturday has the lie-in (1 h later).
  assert.equal(sleepWindow(prefs, "2026-11-13").end, sydneyInstant("2026-11-14", "07:45"));
});

test("an early ref game pulls waking forward", () => {
  const game = { start: sydneyInstant("2026-11-14", "07:30"), end: sydneyInstant("2026-11-14", "09:00"), travelBefore: 30 };
  // Saturday wake would be 7:45; now leave at 7:00 minus 30 min to get ready = 6:30.
  assert.equal(sleepFor(prefs, "2026-11-13", [game]).wake, sydneyInstant("2026-11-14", "06:30"));
});

test("sleep maths across the daylight-saving change", () => {
  // The target is real hours, so the clock bedtime moves instead.
  // DST ends Sun 4 Apr 2027 (3am → 2am): bedtime on the clock is an hour later.
  const apr = sleepFor(prefs, "2027-04-03", []);
  assert.equal(apr.hours, 8.5);
  assert.equal(timeKey(apr.bedtime), "00:15");
  // DST starts Sun 3 Oct 2027 (2am → 3am): bedtime on the clock is an hour earlier.
  const oct = sleepFor(prefs, "2027-10-02", []);
  assert.equal(oct.hours, 8.5);
  assert.equal(timeKey(oct.bedtime), "22:15");
  // A normal Saturday night: 23:15.
  assert.equal(timeKey(sleepFor(prefs, "2026-11-14", []).bedtime), "23:15");
});

test("recurring plans expand on the right days", () => {
  const gym: LifeItem = { id: "g", title: "Gym", category: "fitness", kind: "recurring", starts_at: null, ends_at: null, recurrence: { days: [2, 4], start: "18:00", end: "19:00" }, travel_before_min: 10, travel_after_min: 10, importance: 3, flexibility: "movable", energy: "high", notes: null, status: "planned" };
  const from = sydneyInstant("2026-11-09");
  const occ = expand([gym], from, from + 7 * 24 * H, "2026-11-09", 7);
  assert.deepEqual(occ.map((o) => o.start), [sydneyInstant("2026-11-10", "18:00"), sydneyInstant("2026-11-12", "18:00")]);
});

function baseInput(over: Partial<EvalInput> = {}): EvalInput {
  return {
    draft: { id: "draft", category: "social", start: sydneyInstant("2026-11-14", "19:00"), end: sydneyInstant("2026-11-14", "23:00"), travelBefore: 20, travelAfter: 20, want: 4 },
    prefs,
    now: sydneyInstant("2026-11-10", "12:00"),
    life: [],
    shifts: [],
    study: [],
    deadlines: [],
    ...over,
  };
}

test("a Saturday party with nothing big on is a go", () => {
  const e = evaluate(baseInput());
  assert.equal(defaultVerdict(e, prefs), "go");
  assert.equal(e.clashes.length, 0);
});

test("a late night before an exam suggests leaving earlier, with a verified time", () => {
  const exam = { id: "x", due: sydneyInstant("2026-11-13", "09:00"), kind: "exam" as const, ready: true };
  const e = evaluate(baseInput({ draft: { id: "draft", category: "social", start: sydneyInstant("2026-11-12", "19:00"), end: sydneyInstant("2026-11-12", "23:30"), travelBefore: 20, travelAfter: 30, want: 4 }, deadlines: [exam] }));
  assert.equal(e.highStakesNextDay, true);
  assert.ok(e.sleepAfter < 8);
  const leave = e.options.find((o) => o.kind === "leave_earlier");
  assert.ok(leave && leave.kind === "leave_earlier");
  // Home by then + 30 min leaves at least 8 hours before the 6:45 wake-up.
  assert.ok(sydneyInstant("2026-11-13", "06:45") - (leave.end + 30 * 60_000 + 30 * 60_000) >= 8 * H);
  assert.equal(defaultVerdict(e, prefs), "go but shorter");
});

test("clashing study gets a verified new slot; clashing shifts are fixed", () => {
  const block = { id: "b1", start: sydneyInstant("2026-11-14", "19:30"), end: sydneyInstant("2026-11-14", "20:30"), kind: "study" };
  const e = evaluate(baseInput({ study: [block] }));
  assert.equal(e.studyLostMin, 60);
  const move = e.options.find((o) => o.kind === "move_study");
  assert.ok(move && move.kind === "move_study");
  const slot = move.to;
  assert.ok(slot.end <= sydneyInstant("2026-11-14", "18:40") || slot.start >= sydneyInstant("2026-11-14", "23:20")); // outside the party + travel
  const shift = { id: "s1", start: sydneyInstant("2026-11-14", "17:00"), end: sydneyInstant("2026-11-14", "20:00"), source: "shift" as const, fixed: true };
  const e2 = evaluate(baseInput({ shifts: [shift] }));
  assert.ok(e2.clashes.some((c) => c.source === "shift" && c.fixed));
  assert.ok(e2.options.some((o) => o.kind === "arrive_later"));
  assert.equal(defaultVerdict(e2, prefs), "swap");
});

test("free slots skip sleep, wind-down and busy time", () => {
  const busy = [{ start: sydneyInstant("2026-11-14", "07:00"), end: sydneyInstant("2026-11-14", "12:00") }];
  const slot = findSlot(60, sydneyInstant("2026-11-14", "05:00"), sydneyInstant("2026-11-15"), busy, prefs);
  assert.equal(slot?.start, sydneyInstant("2026-11-14", "12:00"));
  assert.equal(findSlot(60, sydneyInstant("2026-11-14", "22:30"), sydneyInstant("2026-11-15", "06:00"), [], prefs), null);
});

test("titles, names and places are never in what goes to the AI", () => {
  const input = baseInput();
  const e = evaluate(input);
  const sent = JSON.stringify(advicePayload(input.draft, e));
  for (const secret of ["Party at Sam's", "Sam", "Bondi"]) assert.equal(sent.includes(secret), false);
  assert.match(sent, /"category":"social"/);
});

test("the plan validator drops study in the sleep window and over the daily cap", () => {
  const monday = "2026-11-09";
  const late = { id: "late", start: sydneyInstant(monday, "22:00"), end: sydneyInstant(monday, "23:00"), kind: "study" };
  const many = [0, 1, 2, 3].map((i) => ({ id: `m${i}`, start: sydneyInstant("2026-11-10", "15:30") + i * 61 * 60_000, end: sydneyInstant("2026-11-10", "15:30") + (i * 61 + 60) * 60_000, kind: "study" }));
  const { kept, dropped } = repairStudy([late, ...many], { weekStart: monday, prefs, life: [], shifts: [] });
  assert.equal(kept.some((b) => b.id === "late"), false);
  assert.equal(kept.filter((b) => b.id.startsWith("m")).length, 3); // 180-minute cap
  assert.equal(dropped, 2);
  const bal = scoreWeek({ weekStart: monday, prefs, study: [late], life: [], shifts: [] });
  assert.ok(bal.violations.some((v) => v.kind === "study_in_sleep"));
  assert.ok(bal.violations.some((v) => v.kind === "no_rest"));
});

test("quick add understands plain sentences", () => {
  assert.deepEqual(parseQuickAdd("Gym Tue and Thu 6pm for 1 hour"), { title: "Gym", days: [2, 4], start: "18:00", minutes: 60, category: "fitness", recurring: true });
  const party = parseQuickAdd("Party Saturday 8 to 11:30pm");
  assert.equal(party?.start, "20:00");
  assert.equal(party?.minutes, 210);
  assert.equal(party?.recurring, false);
  assert.equal(party?.category, "social");
  assert.equal(parseQuickAdd("something vague"), null);
});

test("support check spots distress without storing anything", () => {
  assert.equal(soundsDistressed("I'm so overwhelmed I can't cope"), true);
  assert.equal(soundsDistressed("Should I go to the party Saturday?"), false);
});
