"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  discardSession,
  extendSession,
  finishSession,
  pauseSession,
  resumeSession,
  startSession,
  type Result,
} from "@/lib/study-sessions";
import { checkManual, SESSION_KINDS } from "@/lib/study-time";
import { cleanSubject } from "@/lib/subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { dayKey, isDayKey, isTimeKey, sydneyInstant } from "@/lib/time";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

export type TimerReply = Result & { serverNow: number };

async function withUser(fn: (db: Awaited<ReturnType<typeof createClient>>, userId: string) => Promise<Result>): Promise<TimerReply> {
  const userId = await currentUserId();
  if (!userId) return { ...SIGNED_OUT, serverNow: Date.now() };
  const db = await createClient();
  const res = await fn(db, userId);
  revalidatePath("/timer");
  revalidatePath("/");
  return { ...res, serverNow: Date.now() };
}

export async function startTimer(p: { minutes: number; subject: string; topic?: string; kind?: string; plannerBlockId?: string; pomodoro?: boolean; groupId?: string }) {
  return withUser((db, userId) =>
    startSession(db, userId, {
      minutes: p.minutes,
      subject: p.subject,
      topic: p.topic,
      kind: p.kind,
      source: isUuid(p.plannerBlockId) ? "planner" : "timer",
      plannerBlockId: isUuid(p.plannerBlockId) ? p.plannerBlockId : null,
      groupId: isUuid(p.groupId) ? p.groupId : p.pomodoro ? randomUUID() : null,
    }),
  );
}

export async function pauseTimer(id: string) {
  return withUser((db, userId) => pauseSession(db, userId, isUuid(id) ? id : null));
}
export async function resumeTimer(id: string) {
  return withUser((db, userId) => resumeSession(db, userId, isUuid(id) ? id : null));
}
export async function extendTimer(id: string, minutes: number) {
  return withUser((db, userId) => extendSession(db, userId, Number(minutes) || 5, isUuid(id) ? id : null));
}
// `at` lets an offline Finish (queued in the browser) count up to when it was pressed.
export async function finishTimer(id: string, at?: number) {
  const when = Number.isFinite(at) && at! > 0 ? Number(at) : Date.now();
  return withUser((db, userId) => finishSession(db, userId, isUuid(id) ? id : null, when));
}
export async function discardTimer(id: string) {
  return withUser((db, userId) => discardSession(db, userId, isUuid(id) ? id : null));
}

export async function addManualSession(f: { day: string; time?: string; minutes: number; subject: string; topic?: string; kind?: string; notes?: string }): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const minutes = Math.round(Number(f.minutes));
  if (!isDayKey(f.day)) return { ok: false, message: "Pick the day you studied." };
  const problem = checkManual(f.day, minutes, dayKey(Date.now()));
  if (problem) return { ok: false, message: problem };
  const start = sydneyInstant(f.day, isTimeKey(f.time) ? f.time : "16:00");
  if (start > Date.now()) return { ok: false, message: "That time hasn't happened yet." };
  const db = await createClient();
  const { error } = await db.from("study_sessions").insert({
    subject: cleanSubject(f.subject).slice(0, 80),
    topic: f.topic?.trim().slice(0, 120) || null,
    kind: SESSION_KINDS.some((k) => k.value === f.kind) ? f.kind : "focus",
    planned_seconds: minutes * 60,
    started_at: new Date(start).toISOString(),
    ended_at: new Date(start + minutes * 60_000).toISOString(),
    status: "completed",
    counted_seconds: minutes * 60,
    source: "manual",
    notes: f.notes?.trim().slice(0, 300) || null,
  });
  if (error) return SAVE_FAILED;
  revalidatePath("/timer");
  return { ok: true, message: `Added ${minutes} minutes of ${cleanSubject(f.subject)} (marked as manual).` };
}

export async function editSession(id: string, f: { subject: string; topic?: string; minutes: number; notes?: string; external: boolean }): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isUuid(id)) return SAVE_FAILED;
  const minutes = Math.round(Number(f.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) return { ok: false, message: "Minutes must be between 1 and 720." };
  const db = await createClient();
  const { data: s } = await db.from("study_sessions").select("planned_seconds, source").eq("id", id).maybeSingle();
  if (!s) return SAVE_FAILED;
  // Timed sessions can be shortened but never made longer than they really were planned.
  const max = s.source === "manual" ? 360 : Math.round((s.planned_seconds as number) / 60);
  const { error } = await db
    .from("study_sessions")
    .update({
      subject: cleanSubject(f.subject).slice(0, 80),
      topic: f.topic?.trim().slice(0, 120) || null,
      counted_seconds: Math.min(minutes, max) * 60,
      notes: f.notes?.trim().slice(0, 300) || null,
      counts_as_external: !!f.external,
    })
    .eq("id", id)
    .in("status", ["completed", "auto_closed"]);
  if (error) return SAVE_FAILED;
  revalidatePath("/timer");
  return { ok: true, message: minutes > max ? `Saved. Capped at ${max} minutes, the time that was planned.` : "Saved." };
}

export async function deleteSession(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  if (!(await currentUserId())) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db.from("study_sessions").delete().eq("id", id).not("status", "in", "(running,paused)");
  if (error) return SAVE_FAILED;
  revalidatePath("/timer");
  return { ok: true, message: "Deleted." };
}

export async function saveStudySettings(f: FormData): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const num = (k: string, min: number, max: number) => {
    const v = String(f.get(k) ?? "").trim();
    if (!v) return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const db = await createClient();
  const { error } = await db.from("study_settings").upsert(
    {
      user_id: userId,
      target_total_hours: num("target_total_hours", 1, 5000),
      weekly_target_hours: num("weekly_target_hours", 1, 100),
      default_minutes: num("default_minutes", 1, 720) ?? 25,
      break_reminder_minutes: num("break_reminder_minutes", 15, 600) ?? 90,
      pomodoro: f.get("pomodoro") === "on",
      pomodoro_focus: num("pomodoro_focus", 5, 120) ?? 25,
      pomodoro_short: num("pomodoro_short", 1, 60) ?? 5,
      pomodoro_long: num("pomodoro_long", 1, 90) ?? 15,
      sound: f.get("sound") === "on",
      vibration: f.get("vibration") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return SAVE_FAILED;
  revalidatePath("/timer");
  return { ok: true, message: "Timer settings saved." };
}
