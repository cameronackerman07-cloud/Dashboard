import { formatShortDate } from "@/lib/time";
import type { AgentDefinition, Finding } from "../types";
import { diffItems, importanceFor, snapshot, type Seen, type WatchItem } from "../watch";

// Assignments watcher (pure code). Reads Canvas (synced into tasks) and Google
// Classroom (synced into external_items), keeps its own copy in external_items,
// and reports new work, moved due dates and newly overdue items.

type Task = { id: string; title: string; course: string | null; source: string | null; external_id: string | null; due_at: string | null };
type External = { source: string; external_id: string; title: string; course: string | null; due_at: string | null; url?: string | null };

const isoWeek = (ms: number) => Math.floor((ms + 3 * 86_400_000) / 604_800_000);

export const assignments: AgentDefinition = {
  slug: "assignments",
  defaultName: "Assignments watcher",
  description: "Checks Canvas and Google Classroom every hour for new work, changed due dates and anything that has just become overdue.",
  defaultSchedule: { type: "every", minutes: 60 },
  defaultSources: ["assignments"],
  needsAI: false,
  importanceMin: 3,
  dailyAiBudget: 0,
  async run(ctx): Promise<Finding[]> {
    const data = await ctx.read<{ tasks: Task[]; external: External[] }>("assignments");
    const canvas = data.tasks.filter((t) => t.source === "canvas" && t.external_id);
    const items: WatchItem[] = [
      ...canvas.map((t) => ({ key: `canvas:${t.external_id}`, title: t.title, course: t.course, due: t.due_at ? new Date(t.due_at).getTime() : null, url: null })),
      ...data.external
        .filter((e) => e.source === "classroom")
        .map((e) => ({ key: `classroom:${e.external_id}`, title: e.title, course: e.course, due: e.due_at ? new Date(e.due_at).getTime() : null, url: null })),
    ];

    // Keep Canvas items in external_items too, so every source lives in one place.
    if (canvas.length) {
      await ctx.upsertExternal(
        canvas.map((t) => ({ source: "canvas" as const, external_id: t.external_id!, title: t.title, course: t.course, due_at: t.due_at, url: null, status: "open" })),
      );
    }

    const seen = (ctx.agent.config._seen as Seen | undefined) ?? null;
    const lastRun = ctx.agent.last_run_at ? new Date(ctx.agent.last_run_at).getTime() : null;
    const changes = diffItems(items, seen, lastRun, ctx.now);
    ctx.agent.config = { ...ctx.agent.config, _seen: snapshot(items, ctx.now) };

    const findings: Finding[] = changes.slice(0, 30).map((c) => {
      const when = c.item.due ? formatShortDate(c.item.due) : "no due date";
      const course = c.item.course ? ` (${c.item.course})` : "";
      if (c.type === "new")
        return { category: "assignment_new", title: `New: ${c.item.title}${course}`, body: `Due ${when}.`, importance: importanceFor(c.item.due, ctx.now), dedupeKey: `new:${c.item.key}`, actionUrl: "/assignments" };
      if (c.type === "moved")
        return {
          category: "assignment_moved",
          title: `Due date changed: ${c.item.title}${course}`,
          body: `Was ${c.from ? formatShortDate(c.from) : "no due date"}, now ${when}.`,
          importance: Math.max(3, importanceFor(c.item.due, ctx.now) - (c.from != null && c.item.due != null && c.item.due > c.from ? 1 : 0)),
          dedupeKey: `moved:${c.item.key}:${c.item.due ?? "none"}`,
          actionUrl: "/assignments",
        };
      return { category: "assignment_overdue", title: `Now overdue: ${c.item.title}${course}`, body: `It was due ${when}.`, importance: 4, dedupeKey: `overdue:${c.item.key}`, actionUrl: "/assignments" };
    });

    // A gentle weekly nudge when nothing is connected.
    const conn = await ctx.connections();
    if (!conn.canvas && !conn.classroom)
      findings.push({ category: "setup", title: "Connect Canvas in Settings", body: "Connect Canvas or Google Classroom and I'll watch for new work every hour.", importance: 2, dedupeKey: `connect:${isoWeek(ctx.now)}`, actionUrl: "/settings" });
    return findings;
  },
};
