// Where a calendar link comes from. Shared by the server (lib/calendar.ts) and the
// Settings card. The key is the `connections.provider` value; one link per source.
export const CALENDAR_SOURCES = {
  sentral: "Sentral",
  atlantis: "Atlantis",
  ical: "Other calendar",
} as const;

export type CalendarSource = keyof typeof CALENDAR_SOURCES;

export const CALENDAR_SOURCE_IDS = Object.keys(CALENDAR_SOURCES) as CalendarSource[];

export function isCalendarSource(value: string): value is CalendarSource {
  return (CALENDAR_SOURCE_IDS as string[]).includes(value);
}
