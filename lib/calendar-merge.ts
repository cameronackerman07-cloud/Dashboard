import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayKey, sydneyInstant, weekdayOfKey } from "@/lib/time";

// One list of everything with a time: shifts, due dates, study blocks, Google
// events and linked calendars. Used by /calendar and the Apple Calendar feed.
// Every query names the user_id, so it's also safe with the service-role client.

export type CalSource = "class" | "google" | "shift" | "due" | "study";
export const CAL_SOURCES: { id: CalSource; label: string }[] = [
  { id: "class", label: "Classes and school calendar" },
  { id: "google", label: "Google" },
  { id: "shift", label: "Shifts" },
  { id: "due", label: "Due" },
  { id: "study", label: "Study" },
];

export type CalItem = { id: string; title: string; start: number; end: number; allDay: boolean; source: CalSource; label: string; location?: string | null };

type StudyRow = { id: string; day_of_week?: number | null; start_min?: number | null; duration_min?: number | null; subject: string | null; label?: string | null; topic?: string | null; starts_at?: string | null; ends_at?: string | null; kind?: string | null };

export async function collectItems(db: SupabaseClient, userId: string, from: number, to: number): Promise<CalItem[]> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const [jobs, shifts, tasks, todos, blocks] = await Promise.all([
    db.from("jobs").select("id, name").eq("user_id", userId),
    db.from("shifts").select("id, job_id, starts_at, ends_at").eq("user_id", userId).lt("starts_at", iso(to)).gt("ends_at", iso(from)),
    db.from("tasks").select("id, title, course, due_at").eq("user_id", userId).eq("done", false).gte("due_at", iso(from)).lt("due_at", iso(to)),
    db.from("todos").select("id, title, due_on").eq("user_id", userId).eq("done", false).gte("due_on", dayKey(from)).lt("due_on", dayKey(to)),
    db.from("study_blocks").select("*").eq("user_id", userId).limit(1000),
  ]);
  const jobName = new Map(((jobs.data ?? []) as { id: string; name: string }[]).map((j) => [j.id, j.name]));
  const items: CalItem[] = [];

  for (const s of (shifts.data ?? []) as { id: string; job_id: string; starts_at: string; ends_at: string }[]) {
    items.push({ id: `shift-${s.id}`, title: jobName.get(s.job_id) ?? "Shift", start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime(), allDay: false, source: "shift", label: "Shift" });
  }
  for (const t of (tasks.data ?? []) as { id: string; title: string; course: string | null; due_at: string }[]) {
    const at = new Date(t.due_at).getTime();
    items.push({ id: `task-${t.id}`, title: `Due: ${t.title}`, start: at, end: at + 30 * 60_000, allDay: false, source: "due", label: t.course ?? "Due" });
  }
  for (const t of (todos.data ?? []) as { id: string; title: string; due_on: string }[]) {
    const day = sydneyInstant(t.due_on);
    items.push({ id: `todo-${t.id}`, title: `To-do: ${t.title}`, start: day, end: sydneyInstant(addDays(t.due_on, 1)), allDay: true, source: "due", label: "To-do" });
  }
  for (const b of (blocks.data ?? []) as StudyRow[]) {
    const title = [b.subject, b.topic ?? b.label].filter(Boolean).join(" · ") || "Study";
    if (b.starts_at && b.ends_at) {
      const s = new Date(b.starts_at).getTime();
      const e = new Date(b.ends_at).getTime();
      if (s < to && e > from) items.push({ id: `study-${b.id}`, title: b.kind === "rest" ? "Rest" : title, start: s, end: e, allDay: false, source: "study", label: "Study plan" });
    } else if (b.day_of_week != null && b.start_min != null) {
      // Weekly repeating block: one copy per matching day in the range.
      for (let day = dayKey(from); sydneyInstant(day) < to; day = addDays(day, 1)) {
        if (weekdayOfKey(day) !== b.day_of_week) continue;
        const hh = String(Math.floor(b.start_min / 60)).padStart(2, "0");
        const mm = String(b.start_min % 60).padStart(2, "0");
        const s = sydneyInstant(day, `${hh}:${mm}`);
        items.push({ id: `study-${b.id}-${day}`, title, start: s, end: s + (b.duration_min ?? 30) * 60_000, allDay: false, source: "study", label: "Study" });
      }
    }
  }
  return items;
}
