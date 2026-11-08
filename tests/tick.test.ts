import assert from "node:assert/strict";
import { test } from "node:test";
import { sydneyInstant } from "@/lib/time";
import { fakeDb } from "./fake-db";

// One end-to-end local tick with AI_MOCK=1 and an in-memory database:
// a specialist (Deadlines & clashes) finds an urgent clash → findings are saved →
// The BRIAN reads them → writes an alert and the morning briefing → pushes.
process.env.AI_MOCK = "1";
process.env.TEST_STUB_PUSH = "1";
const { runDueForUser } = await import("@/lib/agents/engine");
const { sentPushes } = (await import("./stubs/push")) as typeof import("./stubs/push");

const iso = (ms: number) => new Date(ms).toISOString();
const U = "user-1";

test("tick: specialist → findings → The BRIAN → report → push", async () => {
  const now = sydneyInstant("2026-11-10", "08:00"); // a Tuesday, after the 07:00 briefing time
  const past = iso(now - 60_000);
  const agent = (id: string, slug: string, role: "specialist" | "chief", sources: string[], config: Record<string, unknown>) => ({
    id, user_id: U, slug, role, name: slug === "brian" ? "The BRIAN" : "Deadlines & clashes", description: "", enabled: true,
    schedule: { type: "every", minutes: 30 }, instructions: "", config, sources, importance_min: 1, daily_ai_budget: 6,
    is_builtin: true, kind: "builtin", last_run_at: null, next_run_at: past,
  });
  const db = fakeDb({
    // The chief is listed first to prove specialists still run before it.
    agents: [
      agent("a-brian", "brian", "chief", ["assignments", "todos", "shifts", "calendar", "habits", "money_summary", "profile_confirmed"], { briefing_at: "07:00", reset_at: "18:30" }),
      agent("a-dead", "deadlines", "specialist", ["assignments", "todos", "shifts", "calendar"], { late_after: "21:00" }),
      { ...agent("a-other", "deadlines", "specialist", [], {}), user_id: "user-2" },
    ],
    jobs: [{ id: "j1", user_id: U, name: "Cleaning" }],
    shifts: [{ id: "s1", user_id: U, job_id: "j1", starts_at: iso(sydneyInstant("2026-11-11", "16:00")), ends_at: iso(sydneyInstant("2026-11-11", "19:00")), unpaid_break_minutes: 0 }],
    events: [{ id: "e1", user_id: U, title: "Band practice", starts_at: iso(sydneyInstant("2026-11-11", "18:00")), ends_at: iso(sydneyInstant("2026-11-11", "20:00")), all_day: false }],
  });

  const res = await runDueForUser(db as never, U, Date.now(), now);
  assert.deepEqual(res, { ran: 2, errors: 0 });

  // Specialist ran and saved an urgent clash finding for this user only.
  const runs = db.tables.agent_runs;
  assert.deepEqual(runs.map((r) => [r.agent_id, r.status]), [["a-dead", "ok"], ["a-brian", "ok"]]);
  const clash = db.tables.agent_findings.find((f) => f.category === "clash");
  assert.ok(clash, "clash finding saved");
  assert.equal(clash.user_id, U);
  assert.equal(clash.importance, 5);
  assert.equal(clash.consumed_at && typeof clash.consumed_at, "string", "The BRIAN marked it read");

  // The BRIAN wrote an alert and the morning briefing.
  const reports = db.tables.reports;
  assert.deepEqual(reports.map((r) => r.kind).sort(), ["alert", "briefing"]);
  const alert = reports.find((r) => r.kind === "alert")!;
  assert.match(String(alert.title), /Clash: .*Cleaning|Clash: .*Band practice/);
  assert.ok(reports.every((r) => r.user_id === U));

  // …and pushed both (stubbed push).
  assert.deepEqual(sentPushes.map((p) => [p.userId, p.msg.category]), [[U, "alerts"], [U, "briefing"]]);

  // Schedules moved on; the other user's agent wasn't touched.
  assert.ok(db.tables.agents.filter((a) => a.user_id === U).every((a) => String(a.next_run_at) > iso(now)));
  assert.equal(db.tables.agents.find((a) => a.id === "a-other")!.last_run_at, null);

  // A second tick straight after does nothing new.
  const again = await runDueForUser(db as never, U, Date.now(), now + 60_000);
  assert.equal(again.ran, 0);
  assert.equal(db.tables.reports.length, 2);
});
