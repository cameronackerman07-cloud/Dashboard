import { formatCents } from "@/lib/money";
import { paidMinutes, formatHours, type Job, type Shift } from "@/lib/shifts";
import { addDays, dayKey, formatTime, mondayOf, sydneyInstant, timeKey, weekday } from "@/lib/time";
import type { AgentContext, AgentDefinition, Finding, NewReport, ReportSection, StoredFinding } from "../types";

// The BRIAN: the chief agent. Every 30 minutes it checks whether a report is
// due: the morning briefing (default 07:00), the Sunday reset (default 18:30)
// and alerts for anything urgent (importance 5). Each report has a plain
// template; the AI (one call, if available) only writes the 2–3 sentence headline.

type Task = { id: string; title: string; course: string | null; due_at: string | null };
type Todo = { id: string; title: string; due_on: string | null; subject: string | null };
type Lesson = { day_of_week: number; period: string | null; subject: string; room: string | null; week: string };

const WEATHER: Record<number, string> = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "foggy", 48: "foggy",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms",
};

async function weather(ctx: AgentContext): Promise<string | null> {
  const { lat, lng } = await ctx.chief.settings();
  if (lat == null || lng == null) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Australia%2FSydney&forecast_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const d = (await res.json()) as { daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; weather_code?: number[] } };
    const max = d.daily?.temperature_2m_max?.[0];
    const min = d.daily?.temperature_2m_min?.[0];
    const rain = d.daily?.precipitation_probability_max?.[0];
    const code = d.daily?.weather_code?.[0];
    if (max == null) return null;
    return `${WEATHER[code ?? -1] ?? "Mixed weather"}, ${Math.round(min ?? max)}–${Math.round(max)}°${rain != null ? `, ${rain}% chance of rain` : ""}`;
  } catch {
    return null;
  }
}

function headlineFallback(sections: ReportSection[]): string {
  const due = sections.find((s) => s.heading.startsWith("Due"))?.points.length ?? 0;
  const shifts = sections.find((s) => s.heading.startsWith("Shifts"))?.points.length ?? 0;
  const bits = [due ? `${due} thing${due === 1 ? "" : "s"} due soon` : "Nothing due today or tomorrow", shifts ? `${shifts} shift${shifts === 1 ? "" : "s"} today` : null];
  return `${bits.filter(Boolean).join(", ")}.`;
}

async function headline(ctx: AgentContext, kind: string, sections: ReportSection[]): Promise<string> {
  if (!ctx.aiAvailable) return headlineFallback(sections);
  try {
    const text = sections.map((s) => `${s.heading}: ${s.points.join("; ")}`).join("\n").slice(0, 3000);
    return await ctx.ai({
      purpose: "report",
      system: `You write the 2-3 sentence headline of a NSW Year 11 student's ${kind}. Warm, practical, no guilt or pressure, protect sleep and rest. Reply with ONLY JSON {"headline": string}.`,
      messages: [{ role: "user", content: `<data>\n${text}\n</data>` }],
      json: (v) => {
        const h = (v as { headline?: unknown })?.headline;
        return typeof h === "string" && h.trim() ? h.trim().slice(0, 400) : null;
      },
    });
  } catch {
    return headlineFallback(sections);
  }
}

function findingsSection(ctx: AgentContext, findings: StoredFinding[], max: number): ReportSection | null {
  if (findings.length === 0) return null;
  return {
    heading: "From your agents",
    points: findings.slice(0, max).map((f) => `${ctx.chief.agentName(f.agent_id)}: ${f.title}`),
  };
}

async function briefing(ctx: AgentContext, findings: StoredFinding[]): Promise<NewReport> {
  const today = dayKey(ctx.now);
  const tomorrow = addDays(today, 1);
  const sections: ReportSection[] = [];

  const cal = await ctx.read<{ timetable: Lesson[] }>("calendar").catch(() => ({ timetable: [] as Lesson[] }));
  const lessons = cal.timetable.filter((l) => l.day_of_week === weekday(ctx.now));
  if (lessons.length) sections.push({ heading: "Classes", points: lessons.map((l) => [l.period, l.subject, l.room].filter(Boolean).join(" · ")) });

  const shiftData = await ctx.read<{ jobs: Job[]; shifts: Shift[] }>("shifts").catch(() => ({ jobs: [] as Job[], shifts: [] as Shift[] }));
  const jobName = new Map(shiftData.jobs.map((j) => [j.id, j.name]));
  const todayShifts = shiftData.shifts.filter((s) => dayKey(new Date(s.starts_at).getTime()) === today);
  if (todayShifts.length) {
    sections.push({
      heading: "Shifts and games",
      points: todayShifts.map((s) => `${jobName.get(s.job_id) ?? "Shift"} ${formatTime(new Date(s.starts_at).getTime())}–${formatTime(new Date(s.ends_at).getTime())}`),
    });
  }

  const a = await ctx.read<{ tasks: Task[] }>("assignments").catch(() => ({ tasks: [] as Task[] }));
  const todos = await ctx.read<Todo[]>("todos").catch(() => [] as Todo[]);
  const due = [
    ...a.tasks.filter((t) => t.due_at && dayKey(new Date(t.due_at).getTime()) <= tomorrow).map((t) => `${t.title}${t.course ? ` (${t.course})` : ""} — ${dayKey(new Date(t.due_at!).getTime()) < today ? "overdue" : dayKey(new Date(t.due_at!).getTime()) === today ? "today" : "tomorrow"}`),
    ...todos.filter((t) => t.due_on && t.due_on <= tomorrow).map((t) => `${t.title} — ${t.due_on! < today ? "overdue" : t.due_on === today ? "today" : "tomorrow"}`),
  ];
  if (due.length) sections.push({ heading: "Due today and tomorrow", points: due.slice(0, 10) });

  const w = await weather(ctx);
  if (w) sections.push({ heading: "Weather", points: [w] });

  const h = await ctx.read<{ habits: { id: string; name: string }[]; logs: { habit_id: string; day: string }[] }>("habits").catch(() => ({ habits: [], logs: [] }));
  const doneToday = new Set(h.logs.filter((l) => l.day === today).map((l) => l.habit_id));
  const habitsLeft = h.habits.filter((x) => !doneToday.has(x.id)).map((x) => x.name);
  if (habitsLeft.length) sections.push({ heading: "Habits to do", points: habitsLeft });

  const focus = findings.find((f) => f.category === "study_focus");
  if (focus) sections.push({ heading: "Study focus", points: [focus.title] });
  const fs = findingsSection(ctx, findings.filter((f) => f !== focus), 6);
  if (fs) sections.push(fs);

  return { kind: "briefing", title: "Morning briefing", headline: await headline(ctx, "morning briefing", sections), sections, findingIds: findings.slice(0, 12).map((f) => f.id) };
}

async function sundayReset(ctx: AgentContext, findings: StoredFinding[]): Promise<NewReport> {
  const today = dayKey(ctx.now);
  const nextMonday = addDays(mondayOf(today), 7);
  const sections: ReportSection[] = [];

  const a = await ctx.read<{ tasks: Task[] }>("assignments").catch(() => ({ tasks: [] as Task[] }));
  const todos = await ctx.read<Todo[]>("todos").catch(() => [] as Todo[]);
  const overdue = [
    ...a.tasks.filter((t) => t.due_at && dayKey(new Date(t.due_at).getTime()) < today).map((t) => t.title),
    ...todos.filter((t) => t.due_on && t.due_on < today).map((t) => t.title),
  ];
  if (overdue.length) sections.push({ heading: "Behind", points: overdue.slice(0, 8) });

  const weekEnd = addDays(nextMonday, 7);
  const upcoming = [
    ...a.tasks.filter((t) => t.due_at && dayKey(new Date(t.due_at).getTime()) >= nextMonday && dayKey(new Date(t.due_at).getTime()) < weekEnd),
    ...todos.filter((t) => t.due_on && t.due_on >= nextMonday && t.due_on < weekEnd).map((t) => ({ id: t.id, title: t.title, course: t.subject, due_at: new Date(sydneyInstant(t.due_on!, "23:59")).toISOString() })),
  ].sort((x, y) => (x.due_at ?? "").localeCompare(y.due_at ?? ""));
  const shiftData = await ctx.read<{ jobs: Job[]; shifts: Shift[] }>("shifts").catch(() => ({ jobs: [] as Job[], shifts: [] as Shift[] }));
  const weekShifts = shiftData.shifts.filter((s) => {
    const d = dayKey(new Date(s.starts_at).getTime());
    return d >= nextMonday && d < weekEnd;
  });
  const minutes = weekShifts.reduce((m, s) => m + paidMinutes(s), 0);
  const load = upcoming.length + weekShifts.length >= 8 ? "heavy" : upcoming.length + weekShifts.length >= 4 ? "normal" : "light";
  sections.push({
    heading: "The week ahead",
    points: [
      `Load: ${load} — ${upcoming.length} thing${upcoming.length === 1 ? "" : "s"} due, ${weekShifts.length} shift${weekShifts.length === 1 ? "" : "s"} (${formatHours(minutes)})`,
      ...upcoming.slice(0, 6).map((t) => `${t.title}${t.course ? ` (${t.course})` : ""}`),
    ],
  });

  const money = await ctx.read<{ incomeCents: number; spentCents: number }>("money_summary").catch(() => null);
  if (money) sections.push({ heading: "Money this month", points: [`In ${formatCents(money.incomeCents)}, spent ${formatCents(money.spentCents)}, left ${formatCents(money.incomeCents - money.spentCents)}`] });

  const fs = findingsSection(ctx, findings, 6);
  if (fs) sections.push(fs);

  const priorities = [...overdue.slice(0, 2), ...upcoming.slice(0, 3).map((t) => t.title)].slice(0, 3);
  sections.push({ heading: "3 priorities for Monday", points: priorities.length ? priorities : ["Plan a little study time and keep one evening free to rest."] });

  return { kind: "sunday_reset", title: "Sunday reset", headline: await headline(ctx, "Sunday reset", sections), sections, findingIds: findings.slice(0, 12).map((f) => f.id) };
}

export const brian: AgentDefinition = {
  slug: "brian",
  role: "chief",
  defaultName: "The BRIAN",
  description: "Your chief agent. Reads what every agent found and writes your morning briefing, Sunday reset and urgent alerts.",
  defaultSchedule: { type: "every", minutes: 30 },
  defaultSources: ["assignments", "todos", "shifts", "calendar", "habits", "money_summary", "flashcard_stats"],
  defaultConfig: { briefing_at: "07:00", reset_at: "18:30", tone: "warm and direct" },
  needsAI: false,
  importanceMin: 4,
  dailyAiBudget: 6,
  async run(ctx): Promise<Finding[]> {
    const today = dayKey(ctx.now);
    const startOfToday = new Date(sydneyInstant(today)).toISOString();
    const nowTime = timeKey(ctx.now);
    const briefingAt = typeof ctx.agent.config.briefing_at === "string" ? (ctx.agent.config.briefing_at as string) : "07:00";
    const resetAt = typeof ctx.agent.config.reset_at === "string" ? (ctx.agent.config.reset_at as string) : "18:30";
    let findings = await ctx.chief.unconsumed();

    // Alerts: anything urgent, merged into one digest.
    const urgent = findings.filter((f) => f.importance >= 5);
    if (urgent.length) {
      const id = await ctx.chief.writeReport({
        kind: "alert",
        title: urgent.length === 1 ? urgent[0].title : `${urgent.length} things need your attention`,
        headline: urgent.map((f) => f.title).join(" · ").slice(0, 400),
        sections: [{ heading: "Needs attention", points: urgent.map((f) => `${ctx.chief.agentName(f.agent_id)}: ${f.title}${f.body ? ` — ${f.body}` : ""}`) }],
        findingIds: urgent.map((f) => f.id),
      });
      if (id) {
        await ctx.chief.markConsumed(urgent.map((f) => f.id));
        await ctx.chief.push({ title: urgent.length === 1 ? urgent[0].title : `${urgent.length} urgent things`, body: urgent.map((f) => f.title).join(" · "), url: "/inbox", category: "alerts", importance: 5 });
      }
      findings = findings.filter((f) => f.importance < 5);
    }

    // Morning briefing, once a day after its time.
    if (nowTime >= briefingAt && (await ctx.chief.reports("briefing", startOfToday)).length === 0) {
      const report = await briefing(ctx, findings);
      if (await ctx.chief.writeReport(report)) {
        await ctx.chief.markConsumed(report.findingIds ?? []);
        await ctx.chief.push({ title: "Your morning briefing", body: report.headline, url: "/inbox", category: "briefing" });
      }
    }

    // Sunday reset, once on Sunday after its time.
    if (weekday(ctx.now) === 7 && nowTime >= resetAt && (await ctx.chief.reports("sunday_reset", startOfToday)).length === 0) {
      const left = await ctx.chief.unconsumed();
      const report = await sundayReset(ctx, left.filter((f) => f.importance < 5));
      if (await ctx.chief.writeReport(report)) {
        await ctx.chief.markConsumed(report.findingIds ?? []);
        await ctx.chief.push({ title: "Your Sunday reset", body: report.headline, url: "/inbox", category: "briefing" });
      }
    }
    return [];
  },
};
