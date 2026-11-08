import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAnswers, codePlan, factsForAI, normalizePlan, parseQuestion, planTotals, type BudgetFacts } from "@/lib/budget-plan-core";

const facts = (income: number): BudgetFacts => ({
  weekStart: "2026-11-09",
  expectedIncomeCents: income,
  incomeBasis: "2 shifts",
  avgWeeklyByCategory: { Food: 3500, Transport: 1500 },
  weeklyLimits: {},
  monthlyLimits: { Food: 16000 },
  goals: [{ targetCents: 50000, savedCents: 10000 }],
});

test("budget plan: income comes from facts and sums fit inside it", () => {
  const p = normalizePlan({ income: 99999, fixed: [{ label: "Phone", amount: 20 }], allowance: [{ category: "Food", amount: 100 }, { category: "Fun", amount: 100 }], buffer: 20, savings: 50 }, facts(15000), true)!;
  assert.equal(p.income.cents, 15000);
  assert.equal(p.savingsCents, 0); // savings cut first
  assert.equal(p.bufferCents, 0); // then buffer
  assert.ok(planTotals(p).out <= 15000);
  assert.ok(p.note);
  assert.equal(p.byDay.length, 7);
  assert.equal(p.byDay.reduce((a, d) => a + d.cents, 0), planTotals(p).spend);
});

test("budget plan: no income means no savings; bad values dropped; duplicates removed", () => {
  const p = normalizePlan({ allowance: [{ category: "Food", amount: "$30" }, { category: "food", amount: 10 }, { category: "X", amount: -5 }, { category: "Big", amount: 1e9 }] }, facts(0), true)!;
  assert.equal(p.savingsCents, 0);
  assert.deepEqual(p.allowance.map((a) => a.category), ["Food", "Big"]);
  assert.equal(p.allowance[0].cents, 3000);
  assert.equal(p.allowance[1].cents, 100_000);
  assert.equal(normalizePlan({ nothing: true }, facts(0), true), null);
});

test("code-only plan uses recent spending and keeps within income", () => {
  const p = codePlan(facts(20000));
  assert.equal(p.byAI, false);
  assert.deepEqual(p.allowance.map((a) => a.category), ["Food", "Transport"]);
  assert.ok(planTotals(p).out <= 20000);
  assert.ok(p.tips.length >= 3);
});

test("budget questions and answers are capped; facts hold only amounts", () => {
  assert.deepEqual(parseQuestion({ done: true }), { done: true });
  const q = parseQuestion({ question: { text: "Any outings?", options: ["Yes", "No", "1", "2", "3", "4", "5"] } });
  assert.ok(q && !q.done && q.question.options.length === 5);
  assert.equal(parseQuestion({ question: { text: "" } }), null);
  assert.equal(cleanAnswers(Array.from({ length: 9 }, () => ({ q: "q", a: "a" }))).length, 5);
  const text = factsForAI(facts(15000));
  assert.match(text, /Food \$35\.00/);
  assert.match(text, /goal 1: \$100\.00 of \$500\.00/);
});
