import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAssistantReply, parseAction } from "@/lib/assistant/schema";
import { freeWindows } from "@/lib/planner/free-time";
import { MAX_BLOCKS, parseProposed, validateBlocks, type Limits } from "@/lib/planner/validate";
import { addDays, sydneyInstant, timeKey } from "@/lib/time";

const WEEK = "2026-11-09"; // a Monday
const days = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));
const limits: Limits = { maxSchoolDayMin: 120, maxFreeDayMin: 240, restDay: 7 };

test("free time skips school, meals, sleep and busy events", () => {
  const busy = [{ start: sydneyInstant(WEEK, "16:00"), end: sydneyInstant(WEEK, "17:00") }];
  const w = freeWindows({ weekStart: WEEK, busy, sleepStart: "22:00", sleepEnd: "06:30" });
  const mon = w.filter((x) => x.day === WEEK).map((x) => `${timeKey(x.start)}-${timeKey(x.end)}`);
  assert.deepEqual(mon, ["06:30-07:00", "07:30-08:30", "15:30-16:00", "17:00-18:00", "19:00-22:00"]);
  const sat = w.filter((x) => x.day === addDays(WEEK, 5));
  assert.ok(sat.some((x) => timeKey(x.start) === "08:30" || timeKey(x.start) === "07:30"));
  // Nothing in the sleep window.
  for (const x of w) assert.ok(timeKey(x.start) >= "06:30" && timeKey(x.end) <= "22:00");
});

test("plan validation rejects blocks outside free time, overlaps and over-limit days", () => {
  const windows = freeWindows({ weekStart: WEEK, busy: [], sleepStart: "22:00", sleepEnd: "06:30" });
  const res = validateBlocks(
    [
      { day: WEEK, start: "19:00", minutes: 60, subject: "Physics", kind: "study" },
      { day: WEEK, start: "19:30", minutes: 30, subject: "Maths", kind: "study" }, // overlap
      { day: WEEK, start: "10:00", minutes: 60, subject: "Maths", kind: "study" }, // during school
      { day: WEEK, start: "23:00", minutes: 60, subject: "Maths", kind: "study" }, // sleep
      { day: WEEK, start: "20:00", minutes: 90, subject: "English Standard", kind: "study" }, // over 120 min limit
      { day: addDays(WEEK, 6), start: "10:00", minutes: 60, subject: "Maths", kind: "study" }, // rest day
      { day: "2026-12-01", start: "10:00", minutes: 60, subject: "Maths", kind: "study" }, // wrong week
    ],
    windows,
    limits,
    days,
  );
  assert.equal(res.blocks.length, 2); // Physics + the added rest block
  assert.equal(res.rejected, 6);
  assert.equal(res.addedRest, true);
  assert.equal(res.blocks.filter((b) => b.kind === "rest").length, 1);
});

test("a block spilling past its window is trimmed", () => {
  const windows = freeWindows({ weekStart: WEEK, busy: [], sleepStart: "22:00", sleepEnd: "06:30" });
  const res = validateBlocks([{ day: WEEK, start: "21:00", minutes: 90, subject: "Physics", kind: "study" }, { day: WEEK, start: "19:00", minutes: 30, subject: "Rest", kind: "rest" }], windows, limits, days);
  const p = res.blocks.find((b) => b.subject === "Physics")!;
  assert.equal(timeKey(new Date(p.ends_at).getTime()), "22:00");
});

test("parseProposed caps the number of blocks and drops bad ones", () => {
  const many = Array.from({ length: 60 }, () => ({ day: WEEK, start: "9:00", minutes: 30, subject: "Physics", kind: "nope" }));
  const out = parseProposed({ blocks: [...many, { day: "bad" }] })!;
  assert.equal(out.length, MAX_BLOCKS);
  assert.equal(out[0].start, "09:00");
  assert.equal(out[0].kind, "study");
  assert.equal(parseProposed({ nope: 1 }), null);
});

test("assistant schema keeps only allowlisted, well-formed actions", () => {
  const r = parseAssistantReply(
    {
      mode: "action",
      reply: "Done",
      actions: [
        { type: "add_todo", title: "Finish prac", due_on: "2026-11-13", priority: 9 },
        { type: "delete_everything" },
        { type: "open_page", page: "/planner" },
        { type: "open_page", page: "https://evil.example" },
        { type: "add_study_block", day: WEEK, start: "25:00", minutes: 30 },
        { type: "rename_agent", agent: "Scout", new_name: "x".repeat(40) },
      ],
    },
    ["planner", "todo"],
  )!;
  assert.deepEqual(
    r.actions.map((a) => a.type),
    ["add_todo", "open_page", "rename_agent"],
  );
  assert.equal(r.dropped, 3);
  const todo = r.actions[0] as { priority: number };
  assert.equal(todo.priority, 2);
  assert.equal((r.actions[2] as { new_name: string }).new_name.length, 24);
  assert.equal(r.mode, "action");
});

test("assistant schema: no actions means not action mode; flashcards capped", () => {
  assert.equal(parseAssistantReply({ mode: "action", reply: "Hi", actions: [] }, [])!.mode, "chat");
  assert.equal(parseAssistantReply({ mode: "tutor", reply: "" }, []), null);
  const cards = Array.from({ length: 50 }, (_, i) => ({ front: `Q${i}`, back: "A" }));
  const fc = parseAction({ type: "create_flashcards", subject: "Physics", cards }, []) as { cards: unknown[] };
  assert.equal(fc.cards.length, 30);
  const many = Array.from({ length: 9 }, () => ({ type: "log_habit", habit: "Read" }));
  assert.equal(parseAssistantReply({ reply: "ok", actions: many }, [])!.actions.length, 5);
});
