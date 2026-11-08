import { mondayOf, dayKey } from "@/lib/time";
import type { AgentDefinition, Finding } from "../types";

// About me (Sunday 5 pm): refreshes the stats worked out in code and, only if
// you switched it on, asks your AI for a few guesses. Everything starts as
// "suggested" for you to confirm, edit or reject on the About me page.

export const aboutMe: AgentDefinition = {
  slug: "about_me",
  defaultName: "About me",
  description: "Every Sunday: refreshes what the app has learned about how you study and write, for you to confirm or reject. Only uses what you switch on.",
  defaultSchedule: { type: "weekly", day: "sun", at: "17:00" },
  defaultSources: ["profile_confirmed"],
  needsAI: false,
  importanceMin: 2,
  dailyAiBudget: 1,
  async run(ctx): Promise<Finding[]> {
    const { added, ready } = await ctx.profile.analyse();
    if (!ready || added === 0) return [];
    return [
      {
        category: "about_me",
        title: `${added} new thing${added === 1 ? "" : "s"} to review in About me`,
        body: "These are guesses that may be wrong. Confirm the ones that are right.",
        importance: 2,
        dedupeKey: `review:${mondayOf(dayKey(ctx.now))}`,
        actionUrl: "/profile",
      },
    ];
  },
};
