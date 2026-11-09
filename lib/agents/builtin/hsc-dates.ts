import { HSC_DATES, WRITTEN_START_PHRASE } from "@/lib/hsc-dates";
import { fetchPage, htmlToText } from "@/lib/safe-fetch";
import type { AgentDefinition, Finding } from "../types";

// HSC dates check (pure code, no AI). Once a week it reads the official NSW
// Government HSC key dates page and makes a finding if the 2027 written exam
// start date in lib/hsc-dates.ts no longer appears there. It never edits dates.

export function datesStillMatch(pageText: string): boolean {
  const text = pageText.replace(/\s+/g, " ");
  return text.includes(WRITTEN_START_PHRASE) || text.includes(WRITTEN_START_PHRASE.replace(/^(\d+)/, "$1th"));
}

export const hscDates: AgentDefinition = {
  slug: "hsc_dates",
  defaultName: "HSC dates check",
  description: "Every Monday: checks the official HSC key dates page still says the 2027 written exams start on 13 October 2027.",
  defaultSchedule: { type: "weekly", day: "mon", at: "06:00" },
  defaultSources: [],
  defaultConfig: {},
  needsAI: false,
  importanceMin: 2,
  dailyAiBudget: 0,
  async run(ctx): Promise<Finding[]> {
    let text: string;
    try {
      text = htmlToText((await fetchPage(HSC_DATES.source)).text, 200_000);
    } catch {
      return []; // the page couldn't be read this week; try again next week
    }
    if (!text.includes(String(HSC_DATES.year))) return []; // not the page we expect: don't cry wolf
    if (datesStillMatch(text)) return [];
    return [
      {
        category: "hsc_dates",
        title: "The official HSC dates page may have changed",
        body: `The NSW Government HSC key dates page no longer mentions "${WRITTEN_START_PHRASE}" as the start of the ${HSC_DATES.year} written exams. Check ${HSC_DATES.source} and update lib/hsc-dates.ts if the date moved. The countdown hasn't been changed.`,
        importance: 4,
        dedupeKey: `hsc-dates:${HSC_DATES.writtenStart}:${new Date(ctx.now).toISOString().slice(0, 7)}`,
        actionUrl: "/key-dates",
      },
    ];
  },
};
