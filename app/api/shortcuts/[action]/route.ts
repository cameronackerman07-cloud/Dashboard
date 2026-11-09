import { NextResponse } from "next/server";
import { aiChat, aiErrorMessage } from "@/lib/ai";
import { hoursMessage, lastPayWeek, payWeekStart, type HoursShift } from "@/lib/cleaning";
import { rateLimited, verifyDeviceToken } from "@/lib/device-tokens";
import { optionalSubject } from "@/lib/subjects";
import { createAdminClient } from "@/lib/supabase/admin";
import { activePlan } from "@/lib/budget-plan";
import { planTotals } from "@/lib/budget-plan-core";
import { formatCents } from "@/lib/money";
import { countdownLabel, hscSentence } from "@/lib/hsc-dates";
import { addDays, dayKey, formatDayKey, formatTime, mondayOf, sydneyInstant } from "@/lib/time";

// JSON endpoints for iPhone Shortcuts and Siri. Auth: "Authorization: Bearer
// dash_…" (a device token from Settings → iPhone & Siri). Add ?format=text for
// one sentence Siri can read aloud. Every query is scoped to the token's user.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ action: string }> };
const READ = new Set(["due", "today", "next-shift", "cleaner-hours", "todos", "budget", "ping", "hsc"]);
const WRITE = new Set(["add-todo", "add-note", "log-habit", "ask"]);

function reply(request: Request, json: Record<string, unknown>, text: string, status = 200) {
  if (new URL(request.url).searchParams.get("format") === "text") {
    return new NextResponse(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ ...json, text }, { status });
}

async function handle(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (!READ.has(action) && !WRITE.has(action)) return reply(request, { ok: false }, "Unknown shortcut.", 404);
  const who = await verifyDeviceToken(request);
  if (!who) return reply(request, { ok: false }, "That token isn't valid. Make a new one in Settings, iPhone and Siri.", 401);
  if (rateLimited(who.tokenId)) return reply(request, { ok: false }, "Too many requests. Try again in a minute.", 429);
  if (WRITE.has(action) && (who.scope !== "write" || request.method !== "POST")) {
    return reply(request, { ok: false }, "This shortcut needs a token with write access, sent with POST.", 403);
  }

  const db = createAdminClient();
  const uid = who.userId;
  const now = Date.now();
  const today = dayKey(now);
  const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  switch (action) {
    case "ping":
      return reply(request, { ok: true }, "Connected to Dashboard.");

    case "hsc": {
      const c = countdownLabel(now);
      const { data: exam } = await db.from("key_dates").select("title, course, starts_at").eq("user_id", uid).eq("kind", "exam").gte("starts_at", new Date(now).toISOString()).order("starts_at", { ascending: true }).limit(1).maybeSingle();
      let text = hscSentence(now);
      if (exam) {
        const d = Math.round((sydneyInstant(dayKey(new Date(exam.starts_at as string).getTime())) - sydneyInstant(today)) / 86_400_000);
        text += ` Your first exam, ${exam.course ?? exam.title}, is in ${d} day${d === 1 ? "" : "s"}.`;
      }
      return reply(request, { ok: true, days: c.days, date: c.date }, text);
    }

    case "due": {
      const until = new Date(sydneyInstant(addDays(today, 3))).toISOString();
      const [{ data: tasks }, { data: todos }] = await Promise.all([
        db.from("tasks").select("title, due_at").eq("user_id", uid).eq("done", false).lt("due_at", until).order("due_at", { ascending: true }).limit(10),
        db.from("todos").select("title, due_on").eq("user_id", uid).eq("done", false).lte("due_on", addDays(today, 2)).order("due_on", { ascending: true }).limit(10),
      ]);
      const items = [
        ...((tasks ?? []) as { title: string; due_at: string }[]).map((t) => ({ title: t.title, day: dayKey(new Date(t.due_at).getTime()) })),
        ...((todos ?? []) as { title: string; due_on: string }[]).map((t) => ({ title: t.title, day: t.due_on })),
      ].sort((a, b) => a.day.localeCompare(b.day));
      const when = (d: string) => (d < today ? "overdue" : d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : formatDayKey(d));
      const text = items.length ? `${items.length} due soon: ${items.slice(0, 5).map((i) => `${i.title}, ${when(i.day)}`).join("; ")}.` : "Nothing due in the next few days.";
      return reply(request, { ok: true, items }, text);
    }

    case "today": {
      const { data } = await db.from("reports").select("headline, created_at").eq("user_id", uid).eq("kind", "briefing").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const fresh = data && dayKey(new Date(data.created_at as string).getTime()) === today;
      const text = fresh ? (data!.headline as string) : "There's no briefing for today yet.";
      return reply(request, { ok: true, briefing: fresh ? data!.headline : null }, text);
    }

    case "budget": {
      // This week's budget plan (made on Pay & budget or by asking The BRIAN).
      const found = await activePlan(db, uid, mondayOf(today));
      if (!found) return reply(request, { ok: true, plan: null }, "No budget plan for this week yet. Open Pay and budget and tap Plan my week.");
      const p = found.plan;
      const { data: spent } = await db.from("transactions").select("amount_cents").eq("user_id", uid).eq("type", "expense").gte("occurred_on", mondayOf(today)).lt("occurred_on", addDays(mondayOf(today), 7));
      const used = ((spent ?? []) as { amount_cents: number }[]).reduce((a, t) => a + t.amount_cents, 0);
      const t = planTotals(p);
      const text = `This week you planned ${formatCents(t.spend)} of spending and you've spent ${formatCents(used)}. Put ${formatCents(p.savingsCents)} towards savings.`;
      return reply(request, { ok: true, plan: { spend_cents: t.spend, spent_cents: used, savings_cents: p.savingsCents, income_cents: p.income.cents } }, text);
    }

    case "next-shift": {
      const { data } = await db.from("shifts").select("job_id, starts_at, ends_at").eq("user_id", uid).gt("ends_at", new Date(now).toISOString()).order("starts_at", { ascending: true }).limit(1).maybeSingle();
      if (!data) return reply(request, { ok: true, shift: null }, "No shifts coming up.");
      const { data: job } = await db.from("jobs").select("name").eq("user_id", uid).eq("id", data.job_id).maybeSingle();
      const s = new Date(data.starts_at as string).getTime();
      const day = dayKey(s) === today ? "today" : dayKey(s) === addDays(today, 1) ? "tomorrow" : formatDayKey(dayKey(s));
      const text = `${job?.name ?? "Your shift"} ${day} from ${formatTime(s)} to ${formatTime(new Date(data.ends_at as string).getTime())}.`;
      return reply(request, { ok: true, shift: { job: job?.name ?? null, starts_at: data.starts_at, ends_at: data.ends_at } }, text);
    }

    case "cleaner-hours": {
      const [{ data: settings }, { data: jobs }] = await Promise.all([
        db.from("user_settings").select("pay_week_start").eq("user_id", uid).maybeSingle(),
        db.from("jobs").select("id, default_rate_cents").eq("user_id", uid).eq("weekly_hours_report", true),
      ]);
      const startDay = (settings?.pay_week_start as number) ?? 3;
      const jobIds = ((jobs ?? []) as { id: string }[]).map((j) => j.id);
      if (jobIds.length === 0) return reply(request, { ok: true }, "No job is set to send an hours report. Tick it on the job in Shifts.");
      const last = lastPayWeek(now, startDay);
      const thisStart = payWeekStart(today, startDay);
      const { data: shifts } = await db
        .from("shifts")
        .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents")
        .eq("user_id", uid)
        .in("job_id", jobIds)
        .gte("starts_at", new Date(sydneyInstant(addDays(last.start, -1))).toISOString())
        .lt("starts_at", new Date(sydneyInstant(addDays(thisStart, 7))).toISOString());
      const list = (shifts ?? []) as HoursShift[];
      const lastWeek = hoursMessage(list, (jobs ?? []) as { id: string; default_rate_cents: number }[], last, now);
      const soFar = hoursMessage(list, [], { start: thisStart, end: addDays(thisStart, 6) }, now, { label: "This week so far" });
      return reply(request, { ok: true, lastWeek: lastWeek.text, thisWeek: soFar.text }, lastWeek.text);
    }

    case "todos": {
      const { data } = await db.from("todos").select("id, title, due_on, priority").eq("user_id", uid).eq("done", false).order("due_on", { ascending: true, nullsFirst: false }).limit(50);
      const list = (data ?? []) as { title: string }[];
      return reply(request, { ok: true, todos: data ?? [] }, list.length ? `${list.length} to-dos: ${list.slice(0, 5).map((t) => t.title).join("; ")}.` : "Your to-do list is empty.");
    }

    case "add-todo": {
      const title = str(body.title ?? body.text, 200);
      if (!title) return reply(request, { ok: false }, "Say what to add.", 400);
      const due = str(body.due_on, 10);
      await db.from("todos").insert({ user_id: uid, title, due_on: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null, subject: optionalSubject(body.subject) });
      return reply(request, { ok: true }, `Added "${title}" to your to-do list.`);
    }

    case "add-note": {
      const text = str(body.text ?? body.url, 20_000);
      if (!text) return reply(request, { ok: false }, "There was nothing to save.", 400);
      const title = str(body.title, 200) || text.split("\n")[0].slice(0, 80) || "Saved from iPhone";
      await db.from("notes").insert({ user_id: uid, title, body: text });
      return reply(request, { ok: true }, "Saved to your notes.");
    }

    case "log-habit": {
      const name = str(body.habit ?? body.name, 60).toLowerCase();
      const { data: habits } = await db.from("habits").select("id, name").eq("user_id", uid).eq("archived", false);
      const habit = ((habits ?? []) as { id: string; name: string }[]).find((h) => h.name.toLowerCase() === name) ?? ((habits ?? []) as { id: string; name: string }[]).find((h) => name && h.name.toLowerCase().includes(name));
      if (!habit) return reply(request, { ok: false }, "I couldn't find that habit.", 404);
      const { error } = await db.from("habit_logs").insert({ user_id: uid, habit_id: habit.id, day: today });
      return reply(request, { ok: true }, error && error.code !== "23505" ? "Couldn't log it." : `Logged ${habit.name} for today.`);
    }

    case "ask": {
      const question = str(body.question ?? body.text, 1000);
      if (!question) return reply(request, { ok: false }, "Ask a question.", 400);
      try {
        const res = await aiChat([{ role: "user", content: question }], {
          userId: uid,
          purpose: "ask",
          system: "You are The BRIAN, a friendly study and life assistant for a NSW high-school student. Answer in 1-3 short sentences that can be read aloud. Hints first for homework questions.",
          temperature: 0.4,
          budgetMs: 40_000,
        });
        return reply(request, { ok: true, answer: res.text }, res.text.slice(0, 600));
      } catch (err) {
        return reply(request, { ok: false }, aiErrorMessage(err), 200);
      }
    }
  }
  return reply(request, { ok: false }, "Unknown shortcut.", 404);
}

export const GET = handle;
export const POST = handle;
