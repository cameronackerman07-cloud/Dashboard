import "server-only";
import { createHash } from "node:crypto";
import { getConnections, updateConnection, type ConnRow } from "@/lib/oauth-store";
import { redactSecrets } from "@/lib/redact";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Google Calendar (all calendars, next 30 days) and Classroom (courses and
// coursework due dates), read-only. Calendar events are cached on the
// connection row; coursework goes into external_items (source "classroom").

export const GOOGLE_SCOPES: Record<string, string> = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  classroom: "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
};

export const BLOCKED_MESSAGE =
  "Your school may block this. Ask your school to allow it, or share your school calendar to your personal Google account and connect that instead.";

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export type GoogleEvent = { id: string; title: string; start: number; end: number; allDay: boolean; location: string | null; calendar: string };

class GoogleAuthError extends Error {
  constructor(public kind: "needs_reconnect" | "blocked", message: string) {
    super(message);
  }
}

export async function accessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    if (body.error === "invalid_grant") throw new GoogleAuthError("needs_reconnect", "Google asked you to sign in again. Press Reconnect.");
    if (body.error === "admin_policy_enforced" || body.error === "access_denied") throw new GoogleAuthError("blocked", BLOCKED_MESSAGE);
    throw new Error(`Google token refresh failed (${res.status})`);
  }
  return body.access_token;
}

async function gget<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (res.status === 403) {
    const text = await res.text().catch(() => "");
    if (/admin|policy|domain/i.test(text)) throw new GoogleAuthError("blocked", BLOCKED_MESSAGE);
    throw new Error("Google refused that request (403)");
  }
  if (res.status === 401) throw new GoogleAuthError("needs_reconnect", "Google asked you to sign in again. Press Reconnect.");
  if (!res.ok) throw new Error(`Google responded ${res.status}`);
  return (await res.json()) as T;
}

async function calendarEvents(token: string, now: number): Promise<GoogleEvent[]> {
  const list = await gget<{ items?: { id: string; summary?: string; selected?: boolean }[] }>(token, "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader");
  const out: GoogleEvent[] = [];
  const timeMin = new Date(now - 86_400_000).toISOString();
  const timeMax = new Date(now + 30 * 86_400_000).toISOString();
  for (const cal of (list.items ?? []).slice(0, 15)) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${timeMin}&timeMax=${timeMax}`;
    try {
      const ev = await gget<{ items?: { id: string; summary?: string; location?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] }>(token, url);
      for (const e of ev.items ?? []) {
        if (e.status === "cancelled" || !e.start) continue;
        const allDay = !!e.start.date && !e.start.dateTime;
        const start = new Date(e.start.dateTime ?? `${e.start.date}T00:00:00+10:00`).getTime();
        const end = new Date(e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00+10:00` : e.start.dateTime ?? start)).getTime();
        out.push({ id: `${cal.id}|${e.id}`.slice(0, 300), title: (e.summary ?? "(no title)").slice(0, 200), start, end, allDay, location: e.location?.slice(0, 200) ?? null, calendar: (cal.summary ?? "Calendar").slice(0, 80) });
      }
    } catch (err) {
      if (err instanceof GoogleAuthError) throw err;
    }
  }
  return out.slice(0, 1500);
}

async function classroom(token: string, userId: string): Promise<number> {
  if (!adminConfigured()) return 0;
  const db = createAdminClient();
  const courses = await gget<{ courses?: { id: string; name: string; courseState?: string }[] }>(token, "https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE&pageSize=50");
  let n = 0;
  for (const c of courses.courses ?? []) {
    const work = await gget<{ courseWork?: { id: string; title: string; alternateLink?: string; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours?: number; minutes?: number }; state?: string }[] }>(
      token,
      `https://classroom.googleapis.com/v1/courses/${c.id}/courseWork?pageSize=100&orderBy=dueDate%20desc`,
    ).catch(() => ({ courseWork: [] }));
    const now = new Date().toISOString();
    const rows = (work.courseWork ?? []).map((w) => {
      const due = w.dueDate
        ? new Date(Date.UTC(w.dueDate.year, w.dueDate.month - 1, w.dueDate.day, w.dueTime?.hours ?? 12, w.dueTime?.minutes ?? 59)).toISOString()
        : null;
      const hash = createHash("sha256").update(`${w.title}|${due}`).digest("hex").slice(0, 16);
      return { user_id: userId, source: "classroom", external_id: `${c.id}:${w.id}`, title: w.title.slice(0, 300), course: c.name.slice(0, 120), due_at: due, url: w.alternateLink ?? null, status: w.state ?? null, last_seen_at: now, content_hash: hash };
    });
    if (rows.length) {
      // Keep first_seen_at; update the rest (the Assignments agent compares hashes).
      await db.from("external_items").upsert(rows, { onConflict: "user_id,source,external_id" });
      n += rows.length;
    }
  }
  return n;
}

export type SyncResult = { id: string; label: string; ok: boolean; message: string };

export async function syncOne(userId: string, conn: ConnRow): Promise<SyncResult> {
  try {
    const token = await accessToken(conn.refreshToken);
    const cached: Record<string, unknown> = { ...conn.cached };
    let items = 0;
    if (conn.scopes.includes("calendar")) cached.events = await calendarEvents(token, Date.now());
    if (conn.scopes.includes("classroom")) items = await classroom(token, userId);
    await updateConnection(userId, conn.id, { status: "active", last_error: null, last_synced_at: new Date().toISOString(), cached });
    const ev = Array.isArray(cached.events) ? cached.events.length : 0;
    return { id: conn.id, label: conn.label, ok: true, message: `${conn.label}: ${ev} events${conn.scopes.includes("classroom") ? `, ${items} Classroom items` : ""}.` };
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      await updateConnection(userId, conn.id, { status: err.kind, last_error: err.message });
      return { id: conn.id, label: conn.label, ok: false, message: err.message };
    }
    const msg = redactSecrets(err instanceof Error ? err.message : "Sync failed");
    await updateConnection(userId, conn.id, { last_error: msg.slice(0, 200) });
    return { id: conn.id, label: conn.label, ok: false, message: `${conn.label}: couldn't sync just now.` };
  }
}

export async function syncGoogle(userId: string, opts: { onlyId?: string; olderThanMs?: number } = {}): Promise<SyncResult[]> {
  if (!googleConfigured()) return [];
  const conns = await getConnections(userId, "google");
  const out: SyncResult[] = [];
  for (const c of conns) {
    if (opts.onlyId && c.id !== opts.onlyId) continue;
    if (c.status === "blocked") continue;
    if (opts.olderThanMs && c.lastSyncedAt && Date.now() - new Date(c.lastSyncedAt).getTime() < opts.olderThanMs) continue;
    out.push(await syncOne(userId, c));
  }
  return out;
}

// Cached events from every connected Google account, for the Calendar page.
export async function googleEvents(userId: string): Promise<(GoogleEvent & { account: string })[]> {
  const conns = await getConnections(userId, "google");
  return conns.flatMap((c) => (Array.isArray(c.cached.events) ? (c.cached.events as GoogleEvent[]).map((e) => ({ ...e, account: c.label })) : []));
}

export async function revokeGoogle(refreshToken: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(8000) }).catch(() => {});
}
