import { ATAR_LINKS, courseProgress, methodOfTheWeek, weakestTopics, type Assessment, type TopicStat } from "@/lib/coach";
import { addDays, dayKey, mondayOf } from "@/lib/time";
import type { AgentDefinition, Finding } from "../types";

// School coach — the 99 ATAR agent. Weekly (Monday 4:30 pm): marks trend,
// weak topics, whether last week's plan was followed, 3 changes for next week
// and one technique to try. Pure code; topic guides (AI) are made on demand
// from the Coach page. It never invents ATAR or scaling numbers.

type Block = { starts_at?: string | null; done?: boolean; kind?: string };

export const schoolCoach: AgentDefinition = {
  slug: "school_coach",
  defaultName: "School coach",
  description: "Your 99 ATAR coach. Every Monday: marks trend, weak topics, how last week's plan went, 3 changes and one study technique to try.",
  defaultSchedule: { type: "weekly", day: "mon", at: "16:30" },
  defaultSources: ["flashcard_stats", "assessments", "calendar"],
  defaultConfig: { target_atar: 99, targets: {}, key_dates: [] },
  needsAI: false,
  importanceMin: 3,
  dailyAiBudget: 3,
  async run(ctx): Promise<Finding[]> {
    const [stats, assessments, cal] = await Promise.all([
      ctx.read<TopicStat[]>("flashcard_stats"),
      ctx.read<Assessment[]>("assessments").catch(() => [] as Assessment[]),
      ctx.read<{ blocks: Block[] }>("calendar"),
    ]);
    const thisMonday = mondayOf(dayKey(ctx.now));
    const lastMonday = addDays(thisMonday, -7);
    const lastWeek = cal.blocks.filter((b) => b.starts_at && b.kind !== "rest" && dayKey(new Date(b.starts_at).getTime()) >= lastMonday && dayKey(new Date(b.starts_at).getTime()) < thisMonday);
    const done = lastWeek.filter((b) => b.done).length;
    const progress = courseProgress(assessments);
    const weak = weakestTopics(stats, 3);
    const method = methodOfTheWeek(ctx.now);

    const lines: string[] = [];
    const marked = progress.filter((p) => p.average != null);
    if (marked.length) lines.push(`Marks: ${marked.map((p) => `${p.course} ${p.average}%${p.trend ? ` (${p.trend})` : ""}`).join(", ")}.`);
    else lines.push("No marks yet — add your assessment results on the Coach page to see trends.");
    lines.push(lastWeek.length ? `Last week's plan: ${done} of ${lastWeek.length} study blocks done.` : "No study blocks were planned last week.");
    if (weak.length) lines.push(`Weak topics: ${weak.map((t) => `${t.subject} — ${t.topic === "General" ? t.module : t.topic}`).join("; ")}.`);

    const changes: string[] = [];
    if (weak[0]) changes.push(`Do 15 minutes of flashcards on ${weak[0].topic === "General" ? weak[0].module : weak[0].topic} three times this week.`);
    const down = progress.find((p) => p.trend === "down");
    if (down) changes.push(`Do one timed past-paper question for ${down.course} and mark it against the NESA guideline.`);
    if (lastWeek.length && done / lastWeek.length < 0.5) changes.push("Plan fewer, shorter blocks this week so they're easier to keep.");
    else changes.push("Keep one evening free to rest — it helps you remember what you studied.");
    if (changes.length < 3) changes.push("Pick one topic and make a guide for it on the Coach page.");
    lines.push(`This week: ${changes.slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join(" ")}`);
    lines.push(`Try: ${method.technique} — ${method.summary}`);

    return [
      {
        category: "school_review",
        title: "Your weekly school review",
        body: lines.join("\n"),
        importance: 3,
        dedupeKey: `review:${thisMonday}`,
        data: { links: ATAR_LINKS.slice(0, 1), method: method.id },
        actionUrl: "/coach",
      },
    ];
  },
};
