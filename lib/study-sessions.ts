import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSubject } from "@/lib/subjects";
import {
  countedOnFinish,
  dailyTotals,
  elapsedSeconds,
  hoursSpoken,
  MIN_COUNTED_SECONDS,
  sumBetween,
  sweepDecision,
  type SessionKind,
  type SessionSource,
  type StudySession,
} from "@/lib/study-time";
import { addDays, dayKey, mondayOf } from "@/lib/time";

// Every change to a study session goes through here: the timer page, Siri,
// the assistant, voice and the sweep. Each query is scoped by user_id as well
// as by RLS, so the service-role client (Siri, sweep) is safe to pass in too.

export const SESSION_COLUMNS =
  "id, subject, topic, kind, planned_seconds, started_at, ended_at, paused_seconds, paused_at, status, counted_seconds, source, planner_block_id, group_id, notes, counts_as_external";

type Db = SupabaseClient;
export type Result = { ok: boolean; message: string; session?: StudySession | null };

const KINDS: SessionKind[] = ["focus", "flashcards", "practice", "reading", "other"];
const iso = (ms: number) => new Date(ms).toISOString();

// The open (running or paused) session, after closing it if it was forgotten.
export async function activeSession(db: Db, userId: string, now = Date.now()): Promise<StudySession | null> {
  const { data } = await db.from("study_sessions").select(SESSION_COLUMNS).eq("user_id", userId).in("status", ["running", "paused"]).maybeSingle();
  if (!data) return null;
  const s = data as StudySession;
  const closed = await applySweep(db, userId, s, now);
  return closed ? null : s;
}

// Closes or discards a forgotten session. Returns true if it's no longer open.
export async function applySweep(db: Db, userId: string, s: StudySession, now: number): Promise<boolean> {
  const d = sweepDecision(s, now);
  if (d.action === "none") return false;
  if (d.action === "discard") {
    await db.from("study_sessions").delete().eq("id", s.id).eq("user_id", userId);
    return true;
  }
  await db
    .from("study_sessions")
    .update({ status: "auto_closed", ended_at: iso(d.ended_at), counted_seconds: d.counted, paused_at: null })
    .eq("id", s.id)
    .eq("user_id", userId)
    .in("status", ["running", "paused"]);
  if (s.planner_block_id) await db.from("study_blocks").update({ done: true }).eq("id", s.planner_block_id).eq("user_id", userId);
  return true;
}

export async function startSession(
  db: Db,
  userId: string,
  p: { minutes: number; subject?: string | null; topic?: string | null; kind?: string | null; source?: SessionSource; plannerBlockId?: string | null; groupId?: string | null },
): Promise<Result> {
  const minutes = Math.round(Number(p.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) return { ok: false, message: "Pick a time between 1 minute and 12 hours." };
  const existing = await activeSession(db, userId);
  if (existing) return { ok: false, message: `A ${existing.subject} timer is already going. Finish or discard it first.`, session: existing };
  const { data, error } = await db
    .from("study_sessions")
    .insert({
      user_id: userId,
      subject: cleanSubject(p.subject ?? "Study").slice(0, 80),
      topic: p.topic ? String(p.topic).trim().slice(0, 120) || null : null,
      kind: KINDS.includes(p.kind as SessionKind) ? p.kind : "focus",
      planned_seconds: minutes * 60,
      source: p.source ?? "timer",
      planner_block_id: p.plannerBlockId ?? null,
      group_id: p.groupId ?? null,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, message: "A timer is already going. Finish or discard it first." };
    console.error(`Timer start failed: ${error?.code ?? "no row"} ${error?.message ?? ""}`.slice(0, 300));
    return { ok: false, message: `Couldn't start the timer. ${dbReason(error)}` };
  }
  return { ok: true, message: `${minutes}-minute ${(data as StudySession).subject} timer started.`, session: data as StudySession };
}

// A plain-English reason for a failed database write, so a setup problem says
// what to fix instead of a vague "couldn't start". Never includes user data.
export function dbReason(error: { code?: string; message?: string } | null): string {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg))
    return "The study timer table isn't in the database yet: run supabase/phase6.sql in the Supabase SQL Editor, then try again.";
  if (code === "42703" || code === "PGRST204") return "The database is missing a column: run supabase/phase6.sql again.";
  if (code === "42501") return "The database refused it (permissions): run supabase/phase6.sql again.";
  if (code === "23503") return "Your account isn't fully set up in the database. Sign out and back in.";
  if (code === "23514") return "One of the timer settings was out of range. Pick a different length.";
  return code ? `(Database code ${code}.)` : "Try again in a moment.";
}

async function open(db: Db, userId: string, id?: string | null): Promise<StudySession | null> {
  const s = await activeSession(db, userId);
  return s && (!id || s.id === id) ? s : null;
}

export async function pauseSession(db: Db, userId: string, id?: string | null): Promise<Result> {
  const s = await open(db, userId, id);
  if (!s) return { ok: false, message: "There's no timer running." };
  if (s.status === "paused") return { ok: true, message: "Already paused.", session: s };
  const { data } = await db.from("study_sessions").update({ status: "paused", paused_at: iso(Date.now()) }).eq("id", s.id).eq("user_id", userId).eq("status", "running").select(SESSION_COLUMNS).maybeSingle();
  return data ? { ok: true, message: "Paused. Paused time doesn't count.", session: data as StudySession } : { ok: false, message: "Couldn't pause it." };
}

export async function resumeSession(db: Db, userId: string, id?: string | null): Promise<Result> {
  const s = await open(db, userId, id);
  if (!s || s.status !== "paused" || !s.paused_at) return { ok: false, message: "There's no paused timer." };
  const extra = Math.max(0, Math.floor((Date.now() - new Date(s.paused_at).getTime()) / 1000));
  const { data } = await db
    .from("study_sessions")
    .update({ status: "running", paused_at: null, paused_seconds: s.paused_seconds + extra })
    .eq("id", s.id)
    .eq("user_id", userId)
    .eq("status", "paused")
    .select(SESSION_COLUMNS)
    .maybeSingle();
  return data ? { ok: true, message: "Back to it.", session: data as StudySession } : { ok: false, message: "Couldn't resume it." };
}

// +5 / +10 / Keep going. Extending past zero keeps the time after zero counting.
export async function extendSession(db: Db, userId: string, minutes: number, id?: string | null): Promise<Result> {
  const s = await open(db, userId, id);
  if (!s) return { ok: false, message: "There's no timer running." };
  const add = Math.min(120, Math.max(1, Math.round(minutes)));
  // If it's past zero, extend from now (the time since zero counts once you choose to keep going).
  const elapsed = elapsedSeconds(s, Date.now());
  const base = Math.max(s.planned_seconds, elapsed);
  const planned = Math.min(43_200, base + add * 60);
  const { data } = await db.from("study_sessions").update({ planned_seconds: planned, alerted_at: null }).eq("id", s.id).eq("user_id", userId).select(SESSION_COLUMNS).maybeSingle();
  return data ? { ok: true, message: `Added ${add} minutes.`, session: data as StudySession } : { ok: false, message: "Couldn't add time." };
}

export async function finishSession(db: Db, userId: string, id?: string | null, at = Date.now()): Promise<Result> {
  const s = await open(db, userId, id);
  if (!s) return { ok: false, message: "There's no timer running." };
  const end = Math.min(at, Date.now());
  const counted = countedOnFinish(s, end);
  if (counted < MIN_COUNTED_SECONDS) {
    await db.from("study_sessions").delete().eq("id", s.id).eq("user_id", userId);
    return { ok: true, message: "Under a minute, so it wasn't saved.", session: null };
  }
  const { data } = await db
    .from("study_sessions")
    .update({ status: "completed", ended_at: iso(s.status === "paused" && s.paused_at ? new Date(s.paused_at).getTime() : end), counted_seconds: counted, paused_at: null })
    .eq("id", s.id)
    .eq("user_id", userId)
    .in("status", ["running", "paused"])
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (!data) return { ok: false, message: "Couldn't finish it." };
  if (s.planner_block_id) await db.from("study_blocks").update({ done: true }).eq("id", s.planner_block_id).eq("user_id", userId);
  return { ok: true, message: `Saved ${hoursSpoken(counted)} of ${s.subject}.`, session: data as StudySession };
}

export async function discardSession(db: Db, userId: string, id?: string | null): Promise<Result> {
  const s = await open(db, userId, id);
  if (!s) return { ok: false, message: "There's no timer running." };
  await db.from("study_sessions").delete().eq("id", s.id).eq("user_id", userId);
  return { ok: true, message: "Discarded. Nothing was saved.", session: null };
}

// Totals for Siri, the assistant, voice and The BRIAN.
export async function studySummary(db: Db, userId: string, now = Date.now()): Promise<{ today: number; yesterday: number; week: number; total: number; text: string }> {
  const { data } = await db.from("study_sessions").select("subject, started_at, counted_seconds, status, counts_as_external, source").eq("user_id", userId).in("status", ["completed", "auto_closed"]).limit(20_000);
  const days = dailyTotals((data ?? []) as StudySession[]);
  const today = dayKey(now);
  const monday = mondayOf(today);
  const total = [...days.values()].reduce((a, b) => a + b, 0);
  const week = sumBetween(days, monday, addDays(monday, 7));
  const t = days.get(today) ?? 0;
  const y = days.get(addDays(today, -1)) ?? 0;
  const text = total ? `You have studied ${hoursSpoken(week)} this week, ${hoursSpoken(total)} in total.` : "You haven't logged any study time yet. Start a timer to begin.";
  return { today: t, yesterday: y, week, total, text };
}
