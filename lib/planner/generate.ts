import "server-only";
import { aiJson } from "@/lib/ai";
import { hasUsableKey } from "@/lib/ai-keys";
import { sanitizeForAI } from "@/lib/agents/sanitize";
import { loadEvents } from "@/lib/calendar";
import { COURSES } from "@/lib/nav";
import { googleEvents } from "@/lib/sources/google";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, sydneyInstant, timeKey, weekdayOfKey } from "@/lib/time";
import { freeWindows, type Interval } from "./free-time";
import { parseProposed, validateBlocks, type Limits, type ProposedBlock, type ValidBlock } from "./validate";

// Makes a study plan for one week. The AI decides WHAT to study (subjects,
// topics, kinds); code decides WHEN (free windows) and checks every block.

export type PlanDraft = { weekStart: string; title: string; rationale: string; blocks: ValidBlock[]; note: string | null; byAI: boolean };

type Priority = { subject: string; reason: string };

export async function draftPlan(userId: string, weekStart: string, opts: { model?: string; focus?: string } = {}): Promise<PlanDraft> {
  const supabase = await createClient();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = sydneyInstant(weekStart);
  const to = sydneyInstant(addDays(weekStart, 7));
  const iso = (ms: number) => new Date(ms).toISOString();

  const [{ data: settings }, { data: shifts }, { data: blocks }, { data: tasks }, { data: todos }, { data: cards }, { data: assessments }, links, google] = await Promise.all([
    supabase.from("user_settings").select("sleep_start, sleep_end, max_study_min_school_day, max_study_min_free_day, rest_day").maybeSingle(),
    supabase.from("shifts").select("starts_at, ends_at").lt("starts_at", iso(to)).gt("ends_at", iso(from)),
    supabase.from("study_blocks").select("starts_at, ends_at, source").not("starts_at", "is", null).lt("starts_at", iso(to)).gt("ends_at", iso(from)),
    supabase.from("tasks").select("title, course, due_at").eq("done", false).lt("due_at", iso(to + 7 * 86_400_000)).order("due_at", { ascending: true }).limit(30),
    supabase.from("todos").select("title, subject, due_on").eq("done", false).not("subject", "is", null).lte("due_on", addDays(weekStart, 13)).limit(30),
    supabase.from("flashcards").select("subject, module, topic, lapses, ease, due_at").is("duplicate_of", null).limit(3000),
    supabase.from("assessments").select("course, task, date").gte("date", weekStart).lte("date", addDays(weekStart, 28)).limit(20),
    loadEvents(from, to).catch(() => ({ events: [] as { start: number; end: number; allDay: boolean }[], error: null })),
    googleEvents(userId).catch(() => []),
  ]);

  const busy: Interval[] = [
    ...((shifts ?? []) as { starts_at: string; ends_at: string }[]).map((s) => ({ start: new Date(s.starts_at).getTime() - 30 * 60_000, end: new Date(s.ends_at).getTime() + 30 * 60_000 })),
    ...((blocks ?? []) as { starts_at: string; ends_at: string; source: string }[]).filter((b) => b.source === "manual").map((b) => ({ start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() })),
    ...links.events.filter((e) => !e.allDay).map((e) => ({ start: e.start, end: e.end })),
    ...google.filter((g) => !g.allDay && g.start < to && g.end > from).map((g) => ({ start: g.start, end: g.end })),
  ];

  const sleepStart = (settings?.sleep_start as string) ?? "22:00";
  const sleepEnd = (settings?.sleep_end as string) ?? "06:30";
  const windows = freeWindows({ weekStart, busy, sleepStart, sleepEnd, now: Date.now() });

  const dueItems = ((tasks ?? []) as { title: string; course: string | null; due_at: string }[]).filter((t) => t.due_at);
  const load = dueItems.filter((t) => new Date(t.due_at).getTime() < to).length + ((shifts ?? []) as unknown[]).length;
  const heavy = load >= 8;
  const limits: Limits = {
    maxSchoolDayMin: Math.round(((settings?.max_study_min_school_day as number) ?? 210) * (heavy ? 0.7 : 1)),
    maxFreeDayMin: Math.round(((settings?.max_study_min_free_day as number) ?? 300) * (heavy ? 0.7 : 1)),
    restDay: (settings?.rest_day as number) ?? 7,
  };

  // Priorities, worked out in code.
  const priorities: Priority[] = [];
  for (const t of dueItems.slice(0, 8)) priorities.push({ subject: t.course ?? "General", reason: `${t.title} due ${formatDayKey(dayKey(new Date(t.due_at).getTime()))}` });
  for (const t of ((todos ?? []) as { title: string; subject: string; due_on: string | null }[]).slice(0, 5)) priorities.push({ subject: t.subject, reason: `${t.title}${t.due_on ? ` due ${formatDayKey(t.due_on)}` : ""}` });
  for (const a of ((assessments ?? []) as { course: string; task: string; date: string }[])) priorities.push({ subject: a.course, reason: `Assessment: ${a.task} on ${formatDayKey(a.date)}` });
  const weak = new Map<string, { subject: string; topic: string; score: number }>();
  for (const c of (cards ?? []) as { subject: string; module: string | null; topic: string | null; lapses: number; ease: number; due_at: string }[]) {
    const key = `${c.subject}|${c.topic ?? c.module ?? "General"}`;
    const w = weak.get(key) ?? { subject: c.subject, topic: c.topic ?? c.module ?? "General", score: 0 };
    w.score += (c.lapses ?? 0) * 2 + (Number(c.ease) < 2 ? 2 : 0) + (new Date(c.due_at).getTime() < Date.now() ? 1 : 0);
    weak.set(key, w);
  }
  const weakTopics = [...weak.values()].filter((w) => w.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  for (const w of weakTopics) priorities.push({ subject: w.subject, reason: `Weak flashcard topic: ${w.topic}` });

  const subjects = [...new Set([...COURSES, ...priorities.map((p) => p.subject)])];
  const windowText = weekDays
    .map((d) => `${d} (${formatDayKey(d)}): ${windows.filter((w) => w.day === d).map((w) => `${timeKey(w.start)}-${timeKey(w.end)}`).join(", ") || "no free time"}`)
    .join("\n");

  let proposed: ProposedBlock[] | null = null;
  let title = "Study plan";
  let rationale = "";
  let byAI = false;
  if (await hasUsableKey(userId)) {
    try {
      const { value } = await aiJson(
        [
          {
            role: "user",
            content: sanitizeForAI(
              `Week starting ${weekStart}.\nSubjects: ${subjects.join(", ")}\nPriorities:\n${priorities.map((p) => `- ${p.subject}: ${p.reason}`).join("\n") || "- none listed: spread time across subjects"}\n${opts.focus ? `The student asked: ${opts.focus}\n` : ""}Free time (only use these):\n${windowText}\nLimits: at most ${limits.maxSchoolDayMin} min of study on school days, ${limits.maxFreeDayMin} min on other days, no study on weekday ${limits.restDay} (1=Mon), include at least one "rest" block.${heavy ? " This is a heavy week: keep it lighter." : ""}`,
            ),
          },
        ],
        (v) => {
          const blocks = parseProposed(v);
          if (!blocks) return null;
          const o = v as { title?: unknown; rationale?: unknown };
          return { blocks, title: typeof o.title === "string" ? o.title.slice(0, 80) : "Study plan", rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 600) : "" };
        },
        {
          userId,
          model: opts.model,
          purpose: "plan",
          system: `You plan a NSW Year 11/12 student's study week. Decide WHAT to study: mix "study", "practice" (exam-style questions), "flashcards" (15-30 min) and at least one "rest" block. Put urgent and weak topics first, vary subjects, blocks of 25-90 minutes, only inside the free times given, never late at night. Reply with ONLY JSON: {"title": string, "rationale": string (1-2 sentences), "blocks": [{"day": "YYYY-MM-DD", "start": "HH:MM", "minutes": number, "subject": string, "topic": string, "kind": "study"|"practice"|"flashcards"|"rest"}]} with at most 25 blocks.`,
          temperature: 0.4,
        },
      );
      proposed = value.blocks;
      title = value.title;
      rationale = value.rationale;
      byAI = true;
    } catch {
      proposed = null;
    }
  }

  // No AI (or it failed): a simple plan in code.
  if (!proposed) {
    const order = priorities.length ? [...new Set(priorities.map((p) => p.subject))] : COURSES;
    proposed = [];
    let i = 0;
    for (const w of windows) {
      if (weekdayOfKey(w.day) === limits.restDay) continue;
      const start = timeKey(w.start);
      const minutes = Math.min(60, Math.floor((w.end - w.start) / 60_000));
      if (minutes < 25) continue;
      proposed.push({ day: w.day, start, minutes, subject: order[i % order.length], kind: i % 3 === 2 ? "flashcards" : "study" });
      i++;
      if (proposed.length >= 14) break;
    }
    rationale = "Made without AI: time spread across your priorities. Add an AI key for a smarter plan.";
  }

  const { blocks: valid, rejected, addedRest } = validateBlocks(proposed, windows, limits, weekDays);
  const notes = [heavy ? "It's a heavy week, so this plan is lighter than usual. Look after your sleep." : null, rejected ? `${rejected} suggested block${rejected === 1 ? " didn't" : "s didn't"} fit your free time and ${rejected === 1 ? "was" : "were"} left out.` : null, addedRest ? "A rest block was added." : null].filter(Boolean);
  return { weekStart, title, rationale, blocks: valid, note: notes.join(" ") || null, byAI };
}
