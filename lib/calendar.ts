import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { decryptToken } from "@/lib/crypto";
import { eventsBetween, parseIcs, type ParsedCalendar } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";

// The student's calendar link (Sentral, or any other .ics link) and imported
// calendar files, merged into one list of events.
//
// The link is a secret (anyone with it can read the calendar), so it's stored
// encrypted in `connections` and only decrypted here, on the server.

export const CALENDAR_PROVIDER = "sentral";
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

export class CalendarError extends Error {}

// ---------------------------------------------------------------------------
// Fetching a link safely. The link comes from the user, so the server must not
// be talked into fetching something private (its own network, cloud metadata).
// ---------------------------------------------------------------------------

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    (v6.startsWith("::ffff:") && isPrivateAddress(v6.slice(7)))
  );
}

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

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) {
    throw new CalendarError("That link points somewhere private, so it can't be used.");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new CalendarError("Couldn't find that website. Check the link is complete.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new CalendarError("That link points somewhere private, so it can't be used.");
  }
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new CalendarError("That calendar is too big to load (over 3 MB).");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
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

    const text = await readCapped(res);
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
  label: string | null;
  status: string;
  lastSyncedAt: string | null;
};

export async function getCalendarConnection(): Promise<CalendarConnection | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, account_label, status, last_synced_at")
    .eq("provider", CALENDAR_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row
    ? { id: row.id, label: row.account_label, status: row.status, lastSyncedAt: row.last_synced_at }
    : null;
}

async function linkEvents(fromMs: number, toMs: number): Promise<{ events: CalEvent[]; error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, encrypted_token, updated_at")
    .eq("provider", CALENDAR_PROVIDER)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row?.encrypted_token) return { events: [], error: null };

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
        const message = err instanceof CalendarError ? err.message : "Couldn't load your calendar link.";
        return { events: [], error: message };
      }
    }
  }

  return {
    events: eventsBetween(calendar.calendar, fromMs, toMs).map((e) => ({
      id: `link|${e.uid}|${e.start}`,
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
