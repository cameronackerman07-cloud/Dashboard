import { loadRating } from "@/lib/deadlines";
import { formatCents } from "@/lib/money";
import { BASICS_LINKS, CATALOGUE, estimate, MONEY_BASICS, parseAiIdeas, parseSituation, scoreIdea, slugKey, type IdeaSeed, type Situation } from "@/lib/money-ideas";
import { addDays, dayKey, mondayOf, sydneyInstant, timeKey, weekday } from "@/lib/time";
import type { AgentContext, AgentDefinition, Finding } from "../types";

// Money ideas. Daily: ranks realistic, safe ways to earn for your situation
// (scored in code) and, once a week with an AI key, adds up to 3 ideas from
// general knowledge labelled "verify before acting". Saturday 9 am: a weekly
// strategy report. It only drafts — it never applies, contacts anyone or buys anything.

type Shift = { starts_at: string };
type Task = { due_at: string | null };

const week = (ms: number) => mondayOf(dayKey(ms));

function row(seed: IdeaSeed, s: Situation, status: string, heavy: boolean, verify: boolean) {
  const est = estimate(seed, s.hoursPerWeek);
  return {
    type: seed.type,
    title: seed.title,
    summary: seed.summary,
    effort: seed.effort,
    startup_cost_cents: seed.startupCents,
    hours_per_week: seed.hours,
    est_weekly_low_cents: est.low,
    est_weekly_high_cents: est.high,
    assumptions: est.assumptions,
    age_legal_notes: seed.ageLegal,
    first_steps: seed.firstSteps,
    links: seed.links,
    score: scoreIdea(seed, s, status, heavy),
    dedupe_key: seed.key,
    verify,
  };
}

async function aiIdeas(ctx: AgentContext, s: Situation, have: string[]): Promise<IdeaSeed[]> {
  const ideas = await ctx.ai({
    purpose: "money_ideas",
    system:
      'You suggest realistic, safe, legal ways for an Australian secondary student to earn money. Reply with ONLY JSON {"ideas":[{"type":"job|apprenticeship|gig|service|tutoring|selling|freelance|scholarship|extras","title","summary","effort":1-5,"hours":1-10,"firstSteps":[...]}]} with at most 3 ideas. Never include gambling, crypto or trading, multi-level marketing, pay-to-join offers, anything asking for bank details or upfront fees, or anything unsafe. Don\'t quote pay rates.',
    messages: [
      {
        role: "user",
        content: `<data>\nAge: ${s.ageBracket}\nHours a week: ${s.hoursPerWeek}\nSkills: ${s.skills.join(", ") || "none listed"}\nTransport: ${s.transport}\nStartup budget: ${formatCents(s.startupBudgetCents)}\nAlready listed: ${have.slice(0, 30).join("; ")}\n</data>`,
      },
    ],
    json: parseAiIdeas,
  });
  return ideas.map((i) => ({ key: slugKey(i.title), type: i.type, title: i.title, summary: i.summary, effort: i.effort, startupCents: 0, hours: i.hours, ageLegal: "Idea — verify before acting: check age limits, licences and checks you might need.", firstSteps: i.firstSteps, links: [] }));
}

export const opportunities: AgentDefinition = {
  slug: "opportunities",
  defaultName: "Money ideas",
  description: "Finds easy, safe ways for you to earn, ranks them for your situation, and writes a weekly money strategy every Saturday.",
  defaultSchedule: { type: "daily", at: "09:00" }, // the Saturday run also writes the strategy
  defaultSources: ["shifts", "assignments", "money_summary"],
  defaultConfig: { situation: {}, strategy_at: "09:00" },
  needsAI: false,
  importanceMin: 3,
  dailyAiBudget: 2,
  async run(ctx): Promise<Finding[]> {
    const s = parseSituation(ctx.agent.config.situation);
    const [shiftData, a, existing] = await Promise.all([
      ctx.read<{ shifts: Shift[] }>("shifts"),
      ctx.read<{ tasks: Task[] }>("assignments"),
      ctx.ideas.list(),
    ]);
    const mon = week(ctx.now);
    const inWeek = (iso: string | null) => !!iso && week(new Date(iso).getTime()) === mon;
    const heavy = loadRating(a.tasks.filter((t) => inWeek(t.due_at)).length, shiftData.shifts.filter((x) => inWeek(x.starts_at)).length) === "heavy";
    const status = new Map(existing.map((e) => [e.dedupe_key, e.status]));

    const seeds = [...CATALOGUE];
    // AI ideas once a week, only with a key.
    if (ctx.aiAvailable && ctx.agent.config._ai_week !== mon) {
      try {
        const extra = (await aiIdeas(ctx, s, existing.map((e) => e.title))).filter((x) => !status.has(x.key));
        seeds.push(...extra);
        ctx.agent.config = { ...ctx.agent.config, _ai_week: mon };
      } catch {
        // No AI today; the catalogue still works.
      }
    }
    const rows = seeds
      .filter((seed) => seed.key.startsWith("ai:") ? !status.has(seed.key) : true)
      .map((seed) => row(seed, s, status.get(seed.key) ?? "new", heavy, seed.key.startsWith("ai:")));
    await ctx.ideas.save(rows);

    const findings: Finding[] = [];
    const ranked = rows.filter((r) => status.get(r.dedupe_key) !== "dismissed").sort((x, y) => y.score - x.score);
    const fresh = ranked.filter((r) => !status.has(r.dedupe_key) && r.dedupe_key.startsWith("ai:"));
    if (fresh.length) findings.push({ category: "money_idea", title: `${fresh.length} new money idea${fresh.length === 1 ? "" : "s"} to look at`, body: fresh.map((r) => r.title).join("\n"), importance: 2, dedupeKey: `ideas:${mon}`, actionUrl: "/money-ideas" });

    // Weekly strategy: Saturday after its time, once.
    const at = typeof ctx.agent.config.strategy_at === "string" ? (ctx.agent.config.strategy_at as string) : "09:00";
    const today = dayKey(ctx.now);
    if (weekday(ctx.now) === 6 && timeKey(ctx.now) >= at && (await ctx.chief.reports("strategy", new Date(sydneyInstant(today)).toISOString())).length === 0) {
      const logs = await ctx.ideas.logged(addDays(today, -14));
      const byIdea = new Map<string, { hours: number; cents: number }>();
      for (const l of logs) {
        const v = byIdea.get(l.idea_id) ?? { hours: 0, cents: 0 };
        byIdea.set(l.idea_id, { hours: v.hours + Number(l.hours), cents: v.cents + l.earned_cents });
      }
      const trying = existing.filter((e) => e.status === "trying");
      const stop = trying.filter((e) => {
        const v = byIdea.get(e.id);
        return v && v.hours >= 3 && v.cents / v.hours < 500;
      });
      const top = ranked.filter((r) => !stop.some((x) => x.dedupe_key === r.dedupe_key)).slice(0, 3);
      const hours = heavy ? Math.max(1, Math.floor(s.hoursPerWeek / 2)) : s.hoursPerWeek;
      const sections = [
        { heading: "Goal vs time", points: [`Goal: ${formatCents(s.weeklyGoalCents)} a week. Realistic time: about ${hours} h${heavy ? " (a heavy school week, so half your usual)" : ""}.`] },
        { heading: "Top 3 to try this week", points: top.map((r, i) => `${i + 1}. ${r.title}${r.verify ? " (idea — verify before acting)" : ""} — ${r.assumptions}`) },
        {
          heading: "7-day plan",
          points: top[0]
            ? [`Sat: ${(top[0].first_steps as string[])[0] ?? "Read the first steps"}`, `Sun: ${(top[0].first_steps as string[])[1] ?? "Make a short list of people to ask"}`, `Mon–Thu: school first; 15 minutes on ${top[1]?.title ?? "your top idea"}`, "Fri: check what worked and log any hours and earnings"]
            : ["Fill in your situation on the Money ideas page."],
        },
        { heading: "Backups", points: ranked.slice(3, 6).map((r) => r.title) },
        ...(stop.length ? [{ heading: "Think about stopping", points: stop.map((e) => `${e.title}: low earnings for the time it took`) }] : []),
        { heading: "Copy and paste", points: ["Hi! I'm a Year 11 student in the area looking for a little weekend work. I'm reliable and happy to start small — would you have anything I could help with?"] },
        { heading: "Money basics", points: [MONEY_BASICS, ...BASICS_LINKS.map((l) => `${l.label}: ${l.href}`)] },
      ];
      const headline = heavy ? "A heavy school week — keep money plans light and protect your study time." : `Your top idea this week: ${top[0]?.title ?? "set up your situation first"}.`;
      const id = await ctx.chief.writeReport({ kind: "strategy", title: "Weekly money strategy", headline, sections });
      if (id) await ctx.chief.push({ title: "Your weekly money strategy", body: headline, url: "/inbox", category: "money" });
    }
    return findings;
  },
};
