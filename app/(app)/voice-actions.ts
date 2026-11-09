"use server";

import { revalidatePath } from "next/cache";
import { matchIntent } from "@/lib/assistant/intents";
import { hoursMessage, lastPayWeek, type HoursShift } from "@/lib/cleaning";
import { hscSentence } from "@/lib/hsc-dates";
import { ALL_ITEMS } from "@/lib/nav";
import { finishSession, pauseSession, startSession, studySummary } from "@/lib/study-sessions";
import { hoursSpoken } from "@/lib/study-time";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { addDays, dayKey, formatDayKey, formatTime, sydneyInstant } from "@/lib/time";

// The instant, free answers for voice (and the Home ask box): no AI involved.
// Returns null when the request needs the full assistant.

export type FastAnswer = { ok: boolean; text: string; href?: string } | null;

const PAGES = ALL_ITEMS.filter((i) => i.slug).map((i) => ({ slug: i.slug, label: i.label })).concat([{ slug: "settings", label: "Settings" }]);

export async function fastAnswer(raw: string): Promise<FastAnswer> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, text: "You've been signed out. Sign in again." };
  const intent = matchIntent(String(raw ?? "").slice(0, 200), PAGES);
  if (!intent) return null;
  const db = await createClient();
  const now = Date.now();
  const today = dayKey(now);

  switch (intent.kind) {
    case "timer_start": {
      const r = await startSession(db, userId, { minutes: intent.minutes, subject: intent.subject, source: "voice" });
      revalidatePath("/timer");
      return { ok: r.ok, text: r.message, href: r.ok ? "/timer" : undefined };
    }
    case "timer_stop": {
      const r = await finishSession(db, userId);
      revalidatePath("/timer");
      return { ok: r.ok, text: r.message };
    }
    case "timer_pause": {
      const r = await pauseSession(db, userId);
      revalidatePath("/timer");
      return { ok: r.ok, text: r.message };
    }
    case "study_week": {
      const s = await studySummary(db, userId, now);
      return { ok: true, text: s.total ? `You've studied ${hoursSpoken(s.week)} this week, and ${hoursSpoken(s.total)} in total. Today so far: ${hoursSpoken(s.today)}.` : s.text };
    }
    case "hsc":
      return { ok: true, text: hscSentence(now) };
    case "due": {
      const until = new Date(sydneyInstant(addDays(today, 3))).toISOString();
      const [{ data: tasks }, { data: todos }] = await Promise.all([
        db.from("tasks").select("title, due_at").eq("done", false).lt("due_at", until).order("due_at", { ascending: true }).limit(8),
        db.from("todos").select("title, due_on").eq("done", false).lte("due_on", addDays(today, 2)).order("due_on", { ascending: true }).limit(8),
      ]);
      const items = [
        ...((tasks ?? []) as { title: string; due_at: string }[]).map((t) => ({ title: t.title, day: dayKey(new Date(t.due_at).getTime()) })),
        ...((todos ?? []) as { title: string; due_on: string }[]).map((t) => ({ title: t.title, day: t.due_on })),
      ].sort((a, b) => a.day.localeCompare(b.day));
      const when = (d: string) => (d < today ? "overdue" : d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : formatDayKey(d));
      return { ok: true, text: items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} due soon. ${items.slice(0, 4).map((i) => `${i.title}, ${when(i.day)}`).join(". ")}.` : "Nothing's due in the next few days.", href: "/assignments" };
    }
    case "today": {
      const { data } = await db.from("reports").select("headline, created_at").eq("kind", "briefing").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const fresh = data && dayKey(new Date(data.created_at as string).getTime()) === today;
      return { ok: true, text: fresh ? String(data!.headline) : "There's no briefing for today yet. Open Home to see your day.", href: "/" };
    }
    case "next_shift": {
      const { data } = await db.from("shifts").select("job_id, starts_at, ends_at").gt("ends_at", new Date(now).toISOString()).order("starts_at", { ascending: true }).limit(1).maybeSingle();
      if (!data) return { ok: true, text: "No shifts coming up." };
      const { data: job } = await db.from("jobs").select("name").eq("id", data.job_id).maybeSingle();
      const s = new Date(data.starts_at as string).getTime();
      const d = dayKey(s) === today ? "today" : dayKey(s) === addDays(today, 1) ? "tomorrow" : formatDayKey(dayKey(s));
      return { ok: true, text: `${job?.name ?? "Your shift"} ${d} from ${formatTime(s)} to ${formatTime(new Date(data.ends_at as string).getTime())}.`, href: "/shifts" };
    }
    case "cleaning": {
      const [{ data: settings }, { data: jobs }] = await Promise.all([db.from("user_settings").select("pay_week_start").maybeSingle(), db.from("jobs").select("id, default_rate_cents").eq("weekly_hours_report", true)]);
      const ids = ((jobs ?? []) as { id: string }[]).map((j) => j.id);
      if (!ids.length) return { ok: true, text: "No job is set to send an hours report. Tick it on the job in Shifts.", href: "/shifts" };
      const week = lastPayWeek(now, (settings?.pay_week_start as number) ?? 3);
      const { data: shifts } = await db
        .from("shifts")
        .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents")
        .in("job_id", ids)
        .gte("starts_at", new Date(sydneyInstant(addDays(week.start, -1))).toISOString())
        .lt("starts_at", new Date(sydneyInstant(addDays(week.end, 2))).toISOString());
      return { ok: true, text: hoursMessage((shifts ?? []) as HoursShift[], (jobs ?? []) as { id: string; default_rate_cents: number }[], week, now).text };
    }
    case "open":
      return { ok: true, text: `Opening ${PAGES.find((p) => p.slug === intent.page)?.label ?? intent.page}.`, href: `/${intent.page}` };
  }
}
