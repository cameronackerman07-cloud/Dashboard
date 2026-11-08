import { staleSubjects, weakestTopics, type Assessment, type TopicStat } from "@/lib/coach";
import { dayKey, formatShortDate, sydneyInstant } from "@/lib/time";
import type { AgentDefinition, Finding } from "../types";

// Study coach (pure code): weakest flashcard topics, subjects you haven't
// touched for a few days, and assessments coming up. The top item becomes the
// "study focus" in The BRIAN's morning briefing.

export const study: AgentDefinition = {
  slug: "study",
  defaultName: "Study coach",
  description: "Daily at 4 pm: finds your weakest flashcard topics, subjects you haven't studied lately and upcoming assessments, and picks a focus.",
  defaultSchedule: { type: "daily", at: "16:00" },
  defaultSources: ["flashcard_stats", "assessments"],
  defaultConfig: { stale_days: 4 },
  needsAI: false,
  importanceMin: 3,
  dailyAiBudget: 0,
  async run(ctx): Promise<Finding[]> {
    const today = dayKey(ctx.now);
    const [stats, assessments] = await Promise.all([ctx.read<TopicStat[]>("flashcard_stats"), ctx.read<Assessment[]>("assessments").catch(() => [] as Assessment[])]);
    const weak = weakestTopics(stats, 5);
    const stale = staleSubjects(stats, ctx.now, Number(ctx.agent.config.stale_days) || 4).slice(0, 3);
    const soon = assessments
      .filter((a) => a.mark == null && a.date && a.date >= today && sydneyInstant(a.date) - ctx.now <= 14 * 86_400_000)
      .sort((a, b) => a.date!.localeCompare(b.date!));

    const focus: string[] = [
      ...soon.slice(0, 2).map((a) => `${a.course}: ${a.task} on ${formatShortDate(sydneyInstant(a.date!))}`),
      ...weak.slice(0, 3).map((t) => `${t.subject} — ${t.topic === "General" ? t.module : t.topic} (${t.lapses} misses, ${t.due} due)`),
      ...stale.map((s) => `${s.subject} — ${s.daysSince == null ? "not studied yet" : `${s.daysSince} days since you studied it`}`),
    ];
    if (focus.length === 0) return [];
    return [
      {
        category: "study_focus",
        title: `Study focus: ${focus[0]}`,
        body: focus.slice(1, 6).join("\n"),
        importance: soon.length && sydneyInstant(soon[0].date!) - ctx.now <= 3 * 86_400_000 ? 4 : 3,
        dedupeKey: `focus:${today}`,
        data: { weak: weak.map((t) => ({ subject: t.subject, module: t.module, topic: t.topic, score: t.score })), stale, soon: soon.map((a) => ({ course: a.course, task: a.task, date: a.date })) },
        actionUrl: "/flashcards",
      },
    ];
  },
};
