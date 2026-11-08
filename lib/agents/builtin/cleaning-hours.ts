import { hoursMessage, lastPayWeek, type HoursJob, type HoursShift } from "@/lib/cleaning";
import { dayKey, sydneyInstant } from "@/lib/time";
import type { AgentDefinition, Finding } from "../types";

// Cleaning hours reporter (pure code, no AI). Each pay-week start day it adds up
// completed shifts for jobs flagged "weekly hours report" in the week that just
// ended, saves the message in the Inbox and (if switched on) sends a push. The
// iPhone Shortcut automation (Settings → iPhone & Siri) can text it at an exact time.

type Job = HoursJob & { name: string; weekly_hours_report?: boolean };

export const cleaningHours: AgentDefinition = {
  slug: "cleaning_hours",
  defaultName: "Cleaning hours",
  description: "Every Wednesday morning: adds up last pay week's hours for jobs with the weekly hours report switched on.",
  defaultSchedule: { type: "weekly", day: "wed", at: "07:00" },
  defaultSources: ["shifts"],
  defaultConfig: { push: true, include_pay: false, include_zero_days: false },
  needsAI: false,
  importanceMin: 2,
  dailyAiBudget: 0,
  async run(ctx): Promise<Finding[]> {
    const { jobs, shifts } = await ctx.read<{ jobs: Job[]; shifts: HoursShift[] }>("shifts");
    const flagged = jobs.filter((j) => j.weekly_hours_report);
    if (flagged.length === 0) {
      return [{ category: "setup", title: "Turn on the weekly hours report for a job", body: "Open Shifts, edit your cleaning job and tick “Send me a weekly hours report”.", importance: 1, dedupeKey: `cleaning-setup:${dayKey(ctx.now)}`, actionUrl: "/shifts" }];
    }
    // Once per day at most (Run now twice shouldn't send two texts).
    if ((await ctx.chief.reports("cleaning_hours", new Date(sydneyInstant(dayKey(ctx.now))).toISOString())).length) return [];

    const { payWeekStart } = await ctx.chief.settings();
    const week = lastPayWeek(ctx.now, payWeekStart);
    const ids = new Set(flagged.map((j) => j.id));
    const cfg = ctx.agent.config;
    const msg = hoursMessage(
      shifts.filter((s) => ids.has(s.job_id)),
      flagged,
      week,
      ctx.now,
      { includePay: cfg.include_pay === true, includeZeroDays: cfg.include_zero_days === true, label: flagged.length === 1 ? `${flagged[0].name} hours` : "Cleaning hours" },
    );
    const id = await ctx.chief.writeReport({ kind: "cleaning_hours", title: "Weekly hours", headline: msg.text, sections: [{ heading: "Copy and send", points: [msg.text] }] });
    if (id && cfg.push !== false) await ctx.chief.push({ title: "Your weekly hours", body: msg.text, url: "/inbox", category: "cleaning" });
    return [];
  },
};
