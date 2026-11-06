import "server-only";
import { fetchCalendarText, normaliseLink } from "@/lib/calendar";
import { matchCourse } from "@/lib/courses";
import { decryptToken } from "@/lib/crypto";
import { eventsBetween, parseIcs } from "@/lib/ics";
import { assertPublicHost, readCapped, SafeFetchError } from "@/lib/safe-fetch";
import { createClient } from "@/lib/supabase/server";

// Canvas → the `tasks` table (source "canvas"), so Canvas work shows on
// Assignments, Home and Calendar next to your own tasks.
//
// Two ways in, both saved encrypted in `connections` (provider "canvas"):
//  - "token": your school's Canvas address + a personal access token. Reads the
//    planner API, which knows what you've already submitted.
//  - "feed":  your Canvas calendar feed link. Works even where tokens are off,
//    but can't tell what you've submitted.
// The token is only ever decrypted here, on the server, and only sent to the
// Canvas address it was saved with.

export const CANVAS_PROVIDER = "canvas";
export const CANVAS_SOURCE = "canvas";

export type CanvasConfig =
  | { method: "token"; base: string; token: string }
  | { method: "feed"; link: string };

export type CanvasStatus = {
  method: "token" | "feed";
  host: string;
  status: string; // "connected" | "error"
  lastSyncedAt: string | null;
};

export type SyncResult = { ok: boolean; message: string };

export class CanvasError extends Error {
  constructor(
    message: string,
    readonly fatal = false, // the saved details no longer work: stop auto-syncing
  ) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
const PAST_DAYS = 14;
const FUTURE_DAYS = 180;
const MAX_PAGES = 5;
const MAX_JSON_BYTES = 4_000_000;
const AUTO_SYNC_MS = 30 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const MAX_TITLE = 300;

// Planner item types that are real work with a due date.
const WORK_TYPES = new Set(["assignment", "quiz", "discussion_topic", "sub_assignment"]);

// ---------------------------------------------------------------------------
// The Canvas address
// ---------------------------------------------------------------------------

// "yourschool.instructure.com", "https://yourschool.instructure.com/courses/12"
// → "https://yourschool.instructure.com"
export function normaliseCanvasBase(raw: string): string {
  const text = raw.trim();
  if (!text) throw new CanvasError("Paste your school's Canvas address first.");
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new CanvasError("That doesn't look like a web address. Copy it from your browser, e.g. yourschool.instructure.com.");
  }
  if (url.protocol !== "https:") throw new CanvasError("The Canvas address needs to start with https://.");
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new CanvasError("That address can't be used. Copy it exactly as your browser shows it.");
  }
  if (!url.hostname.includes(".")) throw new CanvasError("That address isn't complete. It should look like yourschool.instructure.com.");
  return url.origin;
}

export function cleanToken(raw: string): string {
  const token = raw.trim().replace(/^Bearer\s+/i, "");
  if (!token) throw new CanvasError("Paste your access token first.");
  if (token.length > 400 || !/^[A-Za-z0-9~._-]+$/.test(token)) {
    throw new CanvasError("That doesn't look like a Canvas access token. Copy the whole token, with nothing around it.");
  }
  return token;
}

// ---------------------------------------------------------------------------
// Talking to the Canvas API
// ---------------------------------------------------------------------------

function nextLink(header: string | null, origin: string): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (!m) continue;
    try {
      const url = new URL(m[1]);
      // Never send the token anywhere but the saved Canvas address.
      return url.origin === origin ? url.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function canvasGet(base: string, token: string, path: string, signal: AbortSignal): Promise<{ data: unknown; next: string | null }> {
  const url = new URL(path, base);
  if (url.origin !== base) throw new CanvasError("Canvas sent a link to a different website, so it was ignored.");
  await assertPublicHost(url);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "manual", // a redirect here is usually a sign-in page; never follow it with the token
      cache: "no-store",
      signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new CanvasError("Couldn't reach Canvas. Check the address opens in your browser, then try again.");
  }

  if (res.status >= 300 && res.status < 400) {
    throw new CanvasError(
      "That address sends you somewhere else (often a sign-in page). Use the address your browser shows once you're inside Canvas, e.g. yourschool.instructure.com.",
    );
  }
  if (res.status === 401) {
    throw new CanvasError("Canvas didn't accept that token. Check you copied all of it, or make a new one.", true);
  }
  if (res.status === 403) {
    throw new CanvasError("Canvas refused the token. Your school may have turned tokens off for students: try the Calendar feed option instead.", true);
  }
  if (res.status === 404) throw new CanvasError("That doesn't look like a Canvas address. Check it, e.g. yourschool.instructure.com.");
  if (!res.ok) throw new CanvasError(`Canvas had a problem (error ${res.status}). Try again in a few minutes.`);

  const text = await readCapped(res, MAX_JSON_BYTES, "Canvas sent back too much at once.");
  try {
    return { data: JSON.parse(text.replace(/^while\(1\);/, "")), next: nextLink(res.headers.get("link"), base) };
  } catch {
    throw new CanvasError("That address answered, but not like Canvas does. Check it's your school's Canvas address.");
  }
}

// Checks the address and token work. Reads nothing personal: only that it worked.
export async function testCanvasToken(base: string, token: string): Promise<void> {
  await canvasGet(base, token, "/api/v1/users/self", AbortSignal.timeout(10_000));
}

type DraftTask = { externalId: string; title: string; course: string | null; dueAt: string | null; done: boolean };

async function tokenTasks(base: string, token: string, signal: AbortSignal): Promise<DraftTask[]> {
  const now = Date.now();
  const start = new Date(now - PAST_DAYS * DAY_MS).toISOString();
  const end = new Date(now + FUTURE_DAYS * DAY_MS).toISOString();

  // Course names, to match each item to one of your subjects.
  const courseNames = new Map<number, string>();
  try {
    const { data } = await canvasGet(base, token, "/api/v1/courses?enrollment_state=active&per_page=100", signal);
    for (const c of Array.isArray(data) ? data : []) {
      if (c && typeof c.id === "number" && typeof c.name === "string") courseNames.set(c.id, c.name);
    }
  } catch (err) {
    if (err instanceof CanvasError && err.fatal) throw err;
    // Without course names, items still come in, just without a subject.
  }

  const out: DraftTask[] = [];
  let path: string | null = `/api/v1/planner/items?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&per_page=100`;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const { data, next } = await canvasGet(base, token, path, signal);
    for (const item of Array.isArray(data) ? data : []) {
      if (!item || typeof item !== "object" || !WORK_TYPES.has(item.plannable_type)) continue;
      const plannable = item.plannable ?? {};
      const title = typeof plannable.title === "string" ? plannable.title.trim() : "";
      if (!title || item.plannable_id == null) continue;
      const due = plannable.due_at ?? plannable.todo_date ?? item.plannable_date ?? null;
      const subs = item.submissions;
      const done = Boolean(
        (subs && (subs.submitted || subs.excused)) || item.planner_override?.marked_complete,
      );
      const courseName = courseNames.get(item.course_id) ?? (typeof item.context_name === "string" ? item.context_name : "");
      out.push({
        externalId: `${item.plannable_type === "quiz" ? "quiz" : item.plannable_type === "discussion_topic" ? "discussion" : "assignment"}:${item.plannable_id}`,
        title: title.slice(0, MAX_TITLE),
        course: matchCourse(courseName),
        dueAt: typeof due === "string" && !Number.isNaN(Date.parse(due)) ? new Date(due).toISOString() : null,
        done,
      });
    }
    path = next;
  }
  return out;
}

async function feedTasks(link: string): Promise<DraftTask[]> {
  const now = Date.now();
  const calendar = parseIcs(await fetchCalendarText(link));
  const out: DraftTask[] = [];
  for (const e of eventsBetween(calendar, now - PAST_DAYS * DAY_MS, now + FUTURE_DAYS * DAY_MS)) {
    // Canvas marks assignments as "event-assignment-123"; other entries are
    // ordinary calendar events, which belong on the calendar, not in tasks.
    const id = e.uid.match(/assignment-(?:override-)?(\d+)/i)?.[1];
    if (!id || /calendar-event/i.test(e.uid)) continue;
    const course = e.title.match(/\[([^\]]+)\]\s*$/)?.[1] ?? "";
    const title = e.title.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
    if (!title) continue;
    // An all-day due date means "by the end of that day".
    const due = e.allDay ? e.start + DAY_MS - 60_000 : e.start;
    out.push({
      externalId: `assignment:${id}`,
      title: title.slice(0, MAX_TITLE),
      course: matchCourse(course),
      dueAt: new Date(due).toISOString(),
      done: false,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Saved connection
// ---------------------------------------------------------------------------

type Row = { id: string; encrypted_token: string | null; status: string; last_synced_at: string | null };

async function loadRow(): Promise<Row | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, encrypted_token, status, last_synced_at")
    .eq("provider", CANVAS_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as Row | undefined) ?? null;
}

function readConfig(row: Row): CanvasConfig | null {
  if (!row.encrypted_token) return null;
  try {
    const parsed = JSON.parse(decryptToken(row.encrypted_token));
    if (parsed?.method === "token" && typeof parsed.base === "string" && typeof parsed.token === "string") return parsed;
    if (parsed?.method === "feed" && typeof parsed.link === "string") return parsed;
  } catch {
    // fall through
  }
  return null;
}

export async function getCanvasStatus(): Promise<CanvasStatus | null> {
  const row = await loadRow();
  if (!row) return null;
  const config = readConfig(row);
  if (!config) return null;
  let host = "";
  try {
    host = config.method === "token" ? new URL(config.base).host : normaliseLink(config.link).host;
  } catch {
    host = "Canvas";
  }
  return { method: config.method, host, status: row.status, lastSyncedAt: row.last_synced_at };
}

// ---------------------------------------------------------------------------
// Syncing into tasks
// ---------------------------------------------------------------------------

async function saveTasks(drafts: DraftTask[]): Promise<{ added: number; updated: number }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, external_id, title, course, due_at, done")
    .eq("source", CANVAS_SOURCE)
    .limit(5000);

  const byId = new Map<string, { id: string; title: string; course: string | null; due_at: string | null; done: boolean }>();
  for (const t of existing ?? []) if (t.external_id) byId.set(t.external_id, t);

  const unique = new Map<string, DraftTask>();
  for (const d of drafts) unique.set(d.externalId, d);

  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  for (const d of unique.values()) {
    const old = byId.get(d.externalId);
    if (!old) {
      inserts.push({ source: CANVAS_SOURCE, external_id: d.externalId, title: d.title, course: d.course, due_at: d.dueAt, done: d.done });
      continue;
    }
    const sameDue = (old.due_at ? Date.parse(old.due_at) : null) === (d.dueAt ? Date.parse(d.dueAt) : null);
    const patch: Record<string, unknown> = {};
    if (old.title !== d.title) patch.title = d.title;
    if (!sameDue) patch.due_at = d.dueAt;
    if (!old.course && d.course) patch.course = d.course;
    // Submitting in Canvas ticks it off here. Ticking it off here is your call,
    // so it's never un-ticked by a sync.
    if (d.done && !old.done) patch.done = true;
    if (Object.keys(patch).length) {
      await supabase.from("tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", old.id);
      updated++;
    }
  }

  let added = 0;
  for (let i = 0; i < inserts.length; i += 200) {
    const batch = inserts.slice(i, i + 200);
    const { error } = await supabase.from("tasks").insert(batch);
    if (!error) {
      added += batch.length;
      continue;
    }
    // Another sync may have added some already (the unique index stops
    // duplicates), so add the rest one by one.
    for (const row of batch) {
      const { error: oneError } = await supabase.from("tasks").insert(row);
      if (!oneError) added++;
    }
  }

  // Work deleted in Canvas, still not done, due inside the window we just read.
  const seen = new Set(unique.keys());
  const now = Date.now();
  const stale = (existing ?? []).filter(
    (t: { external_id: string | null; done: boolean; due_at: string | null }) =>
      t.external_id &&
      !seen.has(t.external_id) &&
      !t.done &&
      t.due_at &&
      Date.parse(t.due_at) > now - PAST_DAYS * DAY_MS &&
      Date.parse(t.due_at) < now + FUTURE_DAYS * DAY_MS,
  );
  if (stale.length) await supabase.from("tasks").delete().in("id", stale.map((t: { id: string }) => t.id));

  return { added, updated };
}

export async function syncWithConfig(config: CanvasConfig, timeoutMs = 25_000): Promise<{ added: number; updated: number; total: number }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const drafts = config.method === "token" ? await tokenTasks(config.base, config.token, signal) : await feedTasks(config.link);
  const { added, updated } = await saveTasks(drafts);
  return { added, updated, total: drafts.length };
}

function syncMessage(r: { added: number; updated: number; total: number }): string {
  if (r.total === 0) return "Synced. Canvas has nothing due from two weeks ago onwards.";
  const parts = [`${r.total} Canvas ${r.total === 1 ? "item" : "items"}`];
  if (r.added) parts.push(`${r.added} new`);
  if (r.updated) parts.push(`${r.updated} updated`);
  return `Synced: ${parts.join(", ")}.`;
}

export function errorText(err: unknown): string {
  return err instanceof CanvasError || err instanceof SafeFetchError ? err.message : "Couldn't sync Canvas. Try again.";
}

const lastAttempt = new Map<string, number>();

// Syncs the saved connection. With `maxAgeMs`, only if the last sync is older
// than that (used when a page opens). Returns null when Canvas isn't connected
// or nothing needed doing.
export async function syncCanvas(opts: { maxAgeMs?: number } = {}): Promise<SyncResult | null> {
  const row = await loadRow();
  if (!row) return null;
  const config = readConfig(row);
  if (!config) return { ok: false, message: "Your Canvas details couldn't be read. Connect Canvas again in Settings." };

  if (opts.maxAgeMs != null) {
    if (row.status !== "connected") return null;
    const age = row.last_synced_at ? Date.now() - Date.parse(row.last_synced_at) : Infinity;
    if (age < opts.maxAgeMs) return null;
    if (Date.now() - (lastAttempt.get(row.id) ?? 0) < RETRY_MS) return null;
  }
  lastAttempt.set(row.id, Date.now());

  const supabase = await createClient();
  try {
    // Opening a page waits for this, so keep the automatic sync short.
    const result = await syncWithConfig(config, opts.maxAgeMs != null ? 8_000 : 25_000);
    const at = new Date().toISOString();
    await supabase.from("connections").update({ status: "connected", last_synced_at: at, updated_at: at }).eq("id", row.id);
    return { ok: true, message: syncMessage(result) };
  } catch (err) {
    if (err instanceof CanvasError && err.fatal) {
      await supabase.from("connections").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", row.id);
    }
    return { ok: false, message: errorText(err) };
  }
}

export { syncMessage, AUTO_SYNC_MS };
