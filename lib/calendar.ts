import "server-only";
import {
  CALENDAR_SOURCE_IDS as PROVIDERS,
  CALENDAR_SOURCES,
  isCalendarSource,
  type CalendarSource,
} from "@/lib/calendar-sources";
import { decryptToken } from "@/lib/crypto";
import { eventsBetween, parseIcs, type ParsedCalendar } from "@/lib/ics";
import { assertPublicHost, readCapped, SafeFetchError } from "@/lib/safe-fetch";
import { createClient } from "@/lib/supabase/server";

// The student's calendar links (Sentral, Atlantis, or any other .ics link) and
// imported calendar files, merged into one list of events.
//
// A link is a secret (anyone with it can read the calendar), so it's stored
// encrypted in `connections` and only decrypted here, on the server.

export { CALENDAR_SOURCES, isCalendarSource, type CalendarSource };

export const IMPORT_SOURCE = "sentral-file";

export type CalEvent = {
  id: string;
  title: string;
  location: string | null;
  start: number;
  end: number;
  allDay: boolean;
  source: "link" | "file" | "task";
};

const MAX_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_MS = 15 * 60 * 1000;
const MAX_REDIRECTS = 3;

export const CalendarError = SafeFetchError;

// ---------------------------------------------------------------------------
// Fetching a link safely (see lib/safe-fetch.ts).
// ---------------------------------------------------------------------------

// Accepts https and webcal links, and turns webcal into https.
export function normaliseLink(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new CalendarError("That doesn't look like a link. Copy the whole address, starting with https:// or webcal://.");
  }
  if (url.protocol !== "https:") {
    throw new CalendarError("The link needs to start with https:// or webcal://.");
  }
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new CalendarError("That link can't be used. Copy the calendar link exactly as your school gives it.");
  }
  return url;
}

export async function fetchCalendarText(link: string): Promise<string> {
  let url = normaliseLink(link);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual", // each hop is checked above before it's followed
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      });
    } catch {
      throw new CalendarError("Couldn't reach that link. Check it opens in your browser, then try again.");
    }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) break;
      url = normaliseLink(new URL(next, url).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new CalendarError("That link needs a login, so the dashboard can't read it. Use the calendar's share or subscribe link instead.");
    }
    if (!res.ok) throw new CalendarError(`That link didn't work (error ${res.status}).`);

    const text = await readCapped(res, MAX_BYTES, "That calendar is too big to load (over 3 MB).");
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new CalendarError("That link opens a web page, not a calendar. Look for a link marked iCal, ICS, subscribe or webcal.");
    }
    return text;
  }
  throw new CalendarError("That link redirects too many times.");
}

// ---------------------------------------------------------------------------
// Loading events
// ---------------------------------------------------------------------------

// Parsed calendars, per server instance, so pages don't refetch on every visit.
const linkCache = new Map<string, { at: number; calendar: ParsedCalendar }>();

export type CalendarConnection = {
  id: string;
  source: CalendarSource;
  name: string; // "Sentral", "Atlantis" or "Other calendar"
  status: string;
  lastSyncedAt: string | null;
};

// Every connected calendar link, in a fixed order (Sentral, Atlantis, other).
export async function getCalendarConnections(): Promise<CalendarConnection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, provider, status, last_synced_at")
    .in("provider", PROVIDERS)
    .order("created_at", { ascending: false });
  const seen = new Set<string>();
  const rows: CalendarConnection[] = [];
  for (const row of (data ?? []) as { id: string; provider: string; status: string; last_synced_at: string | null }[]) {
    if (!isCalendarSource(row.provider) || seen.has(row.provider)) continue;
    seen.add(row.provider);
    rows.push({
      id: row.id,
      source: row.provider,
      name: CALENDAR_SOURCES[row.provider],
      status: row.status,
      lastSyncedAt: row.last_synced_at,
    });
  }
  return rows.sort((x, y) => PROVIDERS.indexOf(x.source) - PROVIDERS.indexOf(y.source));
}

async function oneLink(row: { id: string; provider: string; encrypted_token: string; updated_at: string }, fromMs: number, toMs: number): Promise<{ events: CalEvent[]; error: string | null }> {
  const key = `${row.id}|${row.updated_at}`;
  let calendar = linkCache.get(key);
  if (!calendar || Date.now() - calendar.at > CACHE_MS) {
    try {
      const text = await fetchCalendarText(decryptToken(row.encrypted_token));
      calendar = { at: Date.now(), calendar: parseIcs(text) };
      linkCache.set(key, calendar);
    } catch (err) {
      // Keep showing the last copy we had, if any, rather than nothing.
      if (!calendar) {
        const name = isCalendarSource(row.provider) ? CALENDAR_SOURCES[row.provider] : "Calendar";
        const message = err instanceof CalendarError ? err.message : "Couldn't load your calendar link.";
        return { events: [], error: `${name}: ${message}` };
      }
    }
  }

  return {
    events: eventsBetween(calendar.calendar, fromMs, toMs).map((e) => ({
      id: `link|${row.provider}|${e.uid}|${e.start}`,
      title: e.title,
      location: e.location,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      source: "link",
    })),
    error: null,
  };
}

async function linkEvents(fromMs: number, toMs: number): Promise<{ events: CalEvent[]; error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, provider, encrypted_token, updated_at")
    .in("provider", PROVIDERS)
    .eq("status", "connected")
    .order("created_at", { ascending: false });

  // Newest link per source only.
  const seen = new Set<string>();
  const rows = ((data ?? []) as { id: string; provider: string; encrypted_token: string | null; updated_at: string }[])
    .filter((r) => r.encrypted_token && !seen.has(r.provider) && seen.add(r.provider))
    .map((r) => ({ ...r, encrypted_token: r.encrypted_token as string }));
  if (rows.length === 0) return { events: [], error: null };

  const results = await Promise.all(rows.map((r) => oneLink(r, fromMs, toMs)));
  const errors = results.map((r) => r.error).filter(Boolean);
  return { events: results.flatMap((r) => r.events), error: errors.length ? errors.join(" ") : null };
}

async function importedEvents(fromMs: number, toMs: number): Promise<CalEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, location, starts_at, ends_at, all_day")
    .lt("starts_at", new Date(toMs).toISOString())
    .gt("ends_at", new Date(fromMs).toISOString())
    .order("starts_at", { ascending: true })
    .limit(2000);
  return (data ?? []).map((e: { id: string; title: string | null; location: string | null; starts_at: string; ends_at: string; all_day: boolean }) => ({
    id: e.id,
    title: e.title ?? "Untitled",
    location: e.location,
    start: new Date(e.starts_at).getTime(),
    end: new Date(e.ends_at).getTime(),
    allDay: e.all_day,
    source: "file" as const,
  }));
}

async function taskEvents(fromMs: number, toMs: number): Promise<CalEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, title, course, due_at")
    .eq("done", false)
    .gte("due_at", new Date(fromMs).toISOString())
    .lt("due_at", new Date(toMs).toISOString())
    .limit(500);
  return (data ?? []).map((t: { id: string; title: string; course: string | null; due_at: string }) => {
    const start = new Date(t.due_at).getTime();
    return {
      id: `task|${t.id}`,
      title: `Due: ${t.title}`,
      location: t.course,
      start,
      end: start + 1,
      allDay: true,
      source: "task" as const,
    };
  });
}

export async function loadEvents(
  fromMs: number,
  toMs: number,
  opts: { includeTasks?: boolean } = {},
): Promise<{ events: CalEvent[]; error: string | null }> {
  const [link, imported, tasks] = await Promise.all([
    linkEvents(fromMs, toMs),
    importedEvents(fromMs, toMs),
    opts.includeTasks ? taskEvents(fromMs, toMs) : Promise.resolve([]),
  ]);
  const events = [...link.events, ...imported, ...tasks].sort((a, b) => a.start - b.start);
  return { events, error: link.error };
}
