"use server";

import { revalidatePath } from "next/cache";
import {
  CALENDAR_SOURCES,
  CalendarError,
  fetchCalendarText,
  IMPORT_SOURCE,
  isCalendarSource,
  normaliseLink,
} from "@/lib/calendar";
import {
  CANVAS_PROVIDER,
  CANVAS_SOURCE,
  CanvasError,
  cleanToken,
  errorText,
  normaliseCanvasBase,
  syncCanvas,
  syncMessage,
  syncWithConfig,
  testCanvasToken,
  type CanvasConfig,
} from "@/lib/canvas";
import { encryptToken } from "@/lib/crypto";
import { eventsBetween, parseIcs } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";

// RLS keeps every row scoped to the signed-in user.

const DAY_MS = 86_400_000;
const MAX_FILE_BYTES = 3_000_000;
const MAX_IMPORT = 5_000;

export type CalendarReply = { ok: boolean; message: string };

function refresh() {
  for (const path of ["/settings", "/calendar", "/timetable", "/assignments", "/"]) revalidatePath(path);
}

function countMessage(count: number, what: string) {
  return count === 0
    ? `Connected, but there's nothing in the next 8 weeks. If that's wrong, check it's the right ${what}.`
    : `Connected: ${count} ${count === 1 ? "event" : "events"} in the next 8 weeks.`;
}

export async function connectCalendar(formData: FormData): Promise<CalendarReply> {
  const link = String(formData.get("link") ?? "").trim();
  const source = String(formData.get("source") ?? "");
  if (!isCalendarSource(source)) return { ok: false, message: "Choose where the link is from first." };
  if (!link) return { ok: false, message: "Paste your calendar link first." };

  let count: number;
  try {
    normaliseLink(link);
    // Load it once now, so a bad link is caught here rather than on every page.
    const now = Date.now();
    count = eventsBetween(parseIcs(await fetchCalendarText(link)), now, now + 56 * DAY_MS).length;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof CalendarError ? err.message : "Couldn't check that link. Try again.",
    };
  }

  const supabase = await createClient();
  // One link per source: a new Sentral link replaces the old Sentral link, but
  // leaves Atlantis alone. Insert first, so a failed save keeps the old link.
  const { data: old } = await supabase.from("connections").select("id").eq("provider", source);
  const { error } = await supabase.from("connections").insert({
    provider: source,
    account_label: CALENDAR_SOURCES[source],
    encrypted_token: encryptToken(link),
    status: "connected",
    last_synced_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: "The link works, but it couldn't be saved. Try again." };
  const oldIds = (old ?? []).map((r: { id: string }) => r.id);
  if (oldIds.length) await supabase.from("connections").delete().in("id", oldIds);

  refresh();
  return { ok: true, message: `${CALENDAR_SOURCES[source]} ${countMessage(count, "link").replace(/^C/, "c")}` };
}

export async function disconnectCalendar(source: string): Promise<CalendarReply> {
  if (!isCalendarSource(source)) return { ok: false, message: "Couldn't disconnect. Try again." };
  const supabase = await createClient();
  const { error } = await supabase.from("connections").delete().eq("provider", source);
  refresh();
  return error
    ? { ok: false, message: "Couldn't disconnect. Try again." }
    : { ok: true, message: `${CALENDAR_SOURCES[source]} disconnected.` };
}

// A downloaded .ics file, for when there's no link to subscribe to. It's a
// snapshot: importing again replaces the last import.
export async function importCalendarFile(formData: FormData): Promise<CalendarReply> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a calendar file first." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "That file is too big (over 3 MB)." };

  const text = await file.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    return { ok: false, message: "That isn't a calendar file. It should end in .ics." };
  }

  const now = Date.now();
  const events = eventsBetween(parseIcs(text), now - 7 * DAY_MS, now + 400 * DAY_MS).slice(0, MAX_IMPORT);
  const rows = events.map((e) => ({
    source: IMPORT_SOURCE,
    external_id: `${e.uid}|${e.start}`.slice(0, 500),
    title: e.title,
    location: e.location,
    starts_at: new Date(e.start).toISOString(),
    ends_at: new Date(e.end).toISOString(),
    all_day: e.allDay,
  }));

  const supabase = await createClient();
  const { error: clearError } = await supabase.from("events").delete().eq("source", IMPORT_SOURCE);
  if (clearError) return { ok: false, message: "Couldn't replace your last import. Try again." };

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("events").insert(rows.slice(i, i + 500));
    if (error) {
      refresh();
      return { ok: false, message: `Only part of the file was imported (${i} events). Try again.` };
    }
  }

  refresh();
  return {
    ok: true,
    message: rows.length === 0
      ? "Imported, but the file has nothing from last week onwards."
      : `Imported ${rows.length} ${rows.length === 1 ? "event" : "events"}.`,
  };
}

export async function clearImportedCalendar(): Promise<CalendarReply> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("source", IMPORT_SOURCE);
  refresh();
  return error ? { ok: false, message: "Couldn't remove them. Try again." } : { ok: true, message: "Imported events removed." };
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export async function connectCanvas(formData: FormData): Promise<CalendarReply> {
  const method = String(formData.get("method") ?? "");
  let config: CanvasConfig;
  let host: string;
  try {
    if (method === "token") {
      const base = normaliseCanvasBase(String(formData.get("base") ?? ""));
      const token = cleanToken(String(formData.get("token") ?? ""));
      await testCanvasToken(base, token);
      config = { method: "token", base, token };
      host = new URL(base).host;
    } else if (method === "feed") {
      const link = String(formData.get("link") ?? "").trim();
      if (!link) return { ok: false, message: "Paste your Canvas calendar feed link first." };
      const url = normaliseLink(link);
      // Fails here, before saving, if the link doesn't give a calendar.
      parseIcs(await fetchCalendarText(link));
      config = { method: "feed", link: url.toString() };
      host = url.host;
    } else {
      return { ok: false, message: "Choose how Canvas should connect first." };
    }
  } catch (err) {
    return { ok: false, message: err instanceof CanvasError || err instanceof CalendarError ? err.message : errorText(err) };
  }

  const supabase = await createClient();
  const { data: old } = await supabase.from("connections").select("id").eq("provider", CANVAS_PROVIDER);
  const now = new Date().toISOString();
  const { data: saved, error } = await supabase
    .from("connections")
    .insert({
      provider: CANVAS_PROVIDER,
      account_label: host,
      encrypted_token: encryptToken(JSON.stringify(config)),
      status: "connected",
    })
    .select("id")
    .single();
  if (error || !saved) return { ok: false, message: "Canvas works, but the details couldn't be saved. Try again." };
  const oldIds = (old ?? []).map((r: { id: string }) => r.id);
  if (oldIds.length) await supabase.from("connections").delete().in("id", oldIds);

  try {
    const result = await syncWithConfig(config);
    await supabase.from("connections").update({ last_synced_at: now, updated_at: now }).eq("id", saved.id);
    refresh();
    return { ok: true, message: `Connected. ${syncMessage(result)}` };
  } catch (err) {
    refresh();
    return { ok: false, message: `Connected, but the first sync failed: ${errorText(err)}` };
  }
}

export async function syncCanvasNow(): Promise<CalendarReply> {
  const result = await syncCanvas();
  refresh();
  return result ?? { ok: false, message: "Canvas isn't connected." };
}

export async function disconnectCanvas(removeTasks: boolean): Promise<CalendarReply> {
  const supabase = await createClient();
  const { error } = await supabase.from("connections").delete().eq("provider", CANVAS_PROVIDER);
  if (error) return { ok: false, message: "Couldn't disconnect. Try again." };
  if (removeTasks) await supabase.from("tasks").delete().eq("source", CANVAS_SOURCE);
  refresh();
  return {
    ok: true,
    message: removeTasks ? "Canvas disconnected and its tasks removed." : "Canvas disconnected. Its tasks stay on Assignments.",
  };
}
