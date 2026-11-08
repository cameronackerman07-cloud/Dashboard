import { dueWithoutStudy, findClashes, lateBeforeDue, loadRating, type DueItem, type TimedItem } from "@/lib/deadlines";
import { addDays, dayKey, formatShortDate, formatTime, mondayOf, sydneyInstant, weekday } from "@/lib/time";
import type { AgentDefinition, Finding } from "../types";

// Deadlines & clashes (pure code, no AI): overlapping shifts, games, gigs,
// events and study; work due within 48 hours with no study planned; late
// shifts the night before something is due; and a week load rating.
// Classes have periods but no clock times, so they can't be checked for clashes.

type Job = { id: string; name: string };
type Shift = { id: string; job_id: string; starts_at: string; ends_at: string };
type Event = { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean };
type Block = { id: string; subject: string | null; label: string | null; starts_at?: string | null; ends_at?: string | null };
type Task = { id: string; title: string; due_at: string | null };
type Todo = { id: string; title: string; due_on: string | null };

const ms = (s: string) => new Date(s).getTime();

export const deadlines: AgentDefinition = {
  slug: "deadlines",
  defaultName: "Deadlines & clashes",
  description: "Every 2 hours: spots clashes, work due soon with no study planned, and late shifts before a due date. Rates how heavy your week is.",
  defaultSchedule: { type: "every", minutes: 120 },
  defaultSources: ["assignments", "todos", "shifts", "calendar"],
  defaultConfig: { late_after: "21:00" },
  needsAI: false,
  importanceMin: 3,
  dailyAiBudget: 0,
  async run(ctx): Promise<Finding[]> {
    const [shiftData, cal, a, todos] = await Promise.all([
      ctx.read<{ jobs: Job[]; shifts: Shift[] }>("shifts"),
      ctx.read<{ events: Event[]; blocks: Block[] }>("calendar"),
      ctx.read<{ tasks: Task[] }>("assignments"),
      ctx.read<Todo[]>("todos"),
    ]);
    const jobName = new Map(shiftData.jobs.map((j) => [j.id, j.name]));
    const shifts: TimedItem[] = shiftData.shifts
      .filter((s) => ms(s.ends_at) > ctx.now)
      .map((s) => ({ id: s.id, kind: "shift", title: jobName.get(s.job_id) ?? "Shift", start: ms(s.starts_at), end: ms(s.ends_at) }));
    const events: TimedItem[] = cal.events
      .filter((e) => !e.all_day && e.ends_at && ms(e.ends_at) > ctx.now)
      .map((e) => ({ id: e.id, kind: "event", title: e.title, start: ms(e.starts_at), end: ms(e.ends_at!) }));
    const blocks: TimedItem[] = cal.blocks
      .filter((b) => b.starts_at && b.ends_at && ms(b.ends_at) > ctx.now)
      .map((b) => ({ id: b.id, kind: "study", title: b.label || b.subject || "Study", start: ms(b.starts_at!), end: ms(b.ends_at!) }));
    const due: DueItem[] = [
      ...a.tasks.filter((t) => t.due_at).map((t) => ({ id: t.id, title: t.title, due: ms(t.due_at!) })),
      ...todos.filter((t) => t.due_on).map((t) => ({ id: t.id, title: t.title, due: sydneyInstant(t.due_on!, "23:59") })),
    ].filter((t) => t.due > ctx.now);

    const findings: Finding[] = [];
    for (const c of findClashes([...shifts, ...events, ...blocks]).slice(0, 10)) {
      findings.push({
        category: "clash",
        title: `Clash: ${c.a.title} and ${c.b.title}`,
        body: `${formatShortDate(c.a.start)}, ${formatTime(c.a.start)}–${formatTime(c.a.end)} overlaps ${formatTime(c.b.start)}–${formatTime(c.b.end)}.`,
        importance: c.a.start - ctx.now < 2 * 86_400_000 ? 5 : 4,
        dedupeKey: c.key,
        actionUrl: c.a.kind === "shift" || c.b.kind === "shift" ? "/shifts" : "/calendar",
      });
    }
    for (const t of dueWithoutStudy(due, blocks, ctx.now).slice(0, 8)) {
      findings.push({ category: "no_study", title: `No study planned before ${t.title}`, body: `It's due ${formatShortDate(t.due)}. Add a block in the Study planner.`, importance: 4, dedupeKey: `nostudy:${t.id}`, actionUrl: "/planner" });
    }
    const lateAt = typeof ctx.agent.config.late_after === "string" ? (ctx.agent.config.late_after as string) : "21:00";
    for (const { shift, task } of lateBeforeDue(shifts, due, lateAt).slice(0, 5)) {
      findings.push({
        category: "late_shift",
        title: `Late finish before ${task.title} is due`,
        body: `${shift.title} ends at ${formatTime(shift.end)} the night before. Try to finish it earlier.`,
        importance: 4,
        dedupeKey: `late:${shift.id}:${task.id}`,
        actionUrl: "/shifts",
      });
    }

    // Week load: this week, or next week on the Sunday look-ahead (from 17:00).
    const today = dayKey(ctx.now);
    const weekStart = weekday(ctx.now) === 7 && ctx.now >= sydneyInstant(today, "17:00") ? addDays(mondayOf(today), 7) : mondayOf(today);
    const from = sydneyInstant(weekStart);
    const to = sydneyInstant(addDays(weekStart, 7));
    const inWeek = (t: number) => t >= from && t < to;
    const load = loadRating(due.filter((t) => inWeek(t.due)).length, shifts.filter((s) => inWeek(s.start)).length, events.filter((e) => inWeek(e.start)).length);
    findings.push({
      category: "week_load",
      title: `Week of ${formatShortDate(from)}: ${load} load`,
      body: load === "heavy" ? "A heavy week. Keep study blocks short, protect sleep, and say no to extra shifts if you can." : undefined,
      importance: load === "heavy" ? 3 : 1,
      dedupeKey: `load:${weekStart}:${load}`,
      data: { load, weekStart },
    });
    return findings;
  },
};
