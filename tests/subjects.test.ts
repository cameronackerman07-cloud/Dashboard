import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_SUBJECTS, choicesFor, cleanMySubjects, cleanSubject, coreFor, isYear } from "@/lib/subjects";

test("every year from 7 to 12 is allowed, nothing else", () => {
  for (const y of [7, 8, 9, 10, 11, 12, "9"]) assert.ok(isYear(y), String(y));
  for (const y of [6, 13, 0, null, "", "abc", 9.5]) assert.ok(!isYear(y), String(y));
});

test("Years 7–10 get the core subjects, including HSIE", () => {
  for (const y of [7, 8, 9, 10] as const) {
    for (const s of ["English", "Mathematics", "Science", "History", "Geography"]) assert.ok(coreFor(y).includes(s), `${y} ${s}`);
  }
  assert.ok(coreFor(7).includes("Technology"), "Technology is mandatory in Years 7–8");
  assert.ok(!coreFor(9).includes("Technology"));
  assert.deepEqual(coreFor(11), []);
});

test("electives match the year", () => {
  const nine = choicesFor(9).flatMap((g) => g.subjects);
  for (const s of ["Commerce", "Food Technology", "Computing Technology", "Drama", "Physical Activity and Sports Studies", "Japanese"]) assert.ok(nine.includes(s), s);
  const seven = choicesFor(7).flatMap((g) => g.subjects);
  assert.ok(seven.includes("French") && !seven.includes("Commerce"), "Years 7–8 only choose a language");
  const eleven = choicesFor(11).flatMap((g) => g.subjects);
  assert.ok(eleven.includes("Physics") && eleven.includes("Mathematics Extension 1") && !eleven.includes("Commerce"));
});

test("only real subjects for that year are saved, once each", () => {
  assert.deepEqual(cleanMySubjects(9, ["English", "Physics", "Commerce", "Commerce", "<script>", 4]), ["English", "Commerce"]);
  assert.deepEqual(cleanMySubjects(12, ["Physics", "Commerce"]), ["Physics"]);
  assert.deepEqual(cleanMySubjects(8, "English"), []);
});

test("junior subjects are known everywhere else on the site", () => {
  assert.equal(cleanSubject("science"), "Science");
  assert.equal(cleanSubject("Commerce"), "Commerce");
  assert.equal(new Set(ALL_SUBJECTS).size, ALL_SUBJECTS.length, "no duplicates");
});
