import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAI } from "@/lib/ai";
import { hasUsableKey } from "@/lib/ai-keys";
import { expand, prefsFrom, type LifeCategory, type LifeItem, type LifePrefs } from "@/lib/life";
import { addDays, dayKey, formatDayKey, formatTime, sydneyInstant } from "@/lib/time";
import { advicePayload, defaultVerdict, evaluate, type Deadline, type Draft, type Evaluation, type Option, type Verdict } from "./evaluate";

// "Should I go?" step 2: one AI call with anonymised numbers only (no titles,
// names or places), or the same answer from templates when there's no AI.
// The student always makes the final call.

type Db = SupabaseClient;

export const CLOSING = "That's my honest advice. You make the final call, and I'll plan around whichever you pick.";

export { VERDICT_TEXT } from "./evaluate";

export type LabelledOption = { id: string; kind: Option["kind"]; label: string; option: Option };
export type Advice = {
  verdict: Verdict;
  reasons: string[];
  alternatives: LabelledOption[];
  options: LabelledOption[];
  evaluation: Evaluation;
  decisionId: string | null;
  byAI: boolean;
};

const iso = (ms: number) => new Date(ms).toISOString();
const when = (ms: number) => `${formatDayKey(dayKey(ms))} ${formatTime(ms)}`;

export async function gather(db: Db, userId: string, draft: Draft, now: number) {
  const day = dayKey(draft.start);
  const from = sydneyInstant(addDays(day, -3));
  const to = sydneyInstant(addDays(day, 4));
  const [{ data: items }, { data: prefRow }, { data: shifts }, { data: blocks }, { data: tasks }, { data: dates }, { data: sessions }] = await Promise.all([
    db.from("life_items").select("*").eq("user_id", userId).neq("status", "skipped").limit(500),
    db.from("life_preferences").select("*").eq("user_id", userId).maybeSingle(),
    db.from("shifts").select("id, starts_at, ends_at").eq("user_id", userId).lt("starts_at", iso(to)).gt("ends_at", iso(from)),
    db.from("study_blocks").select("id, starts_at, ends_at, kind, subject, done").eq("user_id", userId).not("starts_at", "is", null).lt("starts_at", iso(to)).gt("ends_at", iso(from)).eq("done", false),
    db.from("tasks").select("id, course, due_at").eq("user_id", userId).eq("done", false).gte("due_at", iso(now)).lt("due_at", iso(now + 10 * 86_400_000)).limit(50),
    db.from("key_dates").select("id, course, starts_at, kind").eq("user_id", userId).in("kind", ["exam", "trial", "assessment"]).gte("starts_at", iso(now)).lt("starts_at", iso(now + 10 * 86_400_000)).limit(30),
    db.from("study_sessions").select("subject, counted_seconds, started_at").eq("user_id", userId).in("status", ["completed", "auto_closed"]).gte("started_at", iso(now - 7 * 86_400_000)).limit(500),
  ]);
  const prefs = prefsFrom(prefRow as never);
  const life = expand(((items ?? []) as LifeItem[]).filter((i) => i.id !== draft.id), from, to, addDays(day, -3), 7);
  // "Ready" = at least an hour studied in the last week or planned before it's due, for that course.
  const studied = new Map<string, number>();
  for (const s of (sessions ?? []) as { subject: string; counted_seconds: number }[]) studied.set(s.subject, (studied.get(s.subject) ?? 0) + (s.counted_seconds ?? 0) / 60);
  const planned = (course: string | null, due: number) =>
    ((blocks ?? []) as { subject: string | null; starts_at: string; ends_at: string }[]).filter((b) => b.subject === course && new Date(b.ends_at).getTime() <= due).reduce((a, b) => a + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000, 0);
  const ready = (course: string | null, due: number) => !!course && (studied.get(course) ?? 0) + planned(course, due) >= 60;
  const deadlines: Deadline[] = [
    ...((tasks ?? []) as { id: string; course: string | null; due_at: string }[]).map((t) => ({ id: t.id, due: new Date(t.due_at).getTime(), kind: "task" as const, ready: ready(t.course, new Date(t.due_at).getTime()) })),
    ...((dates ?? []) as { id: string; course: string | null; starts_at: string; kind: "exam" | "trial" | "assessment" }[]).map((d) => ({ id: d.id, due: new Date(d.starts_at).getTime(), kind: d.kind, ready: ready(d.course, new Date(d.starts_at).getTime()) })),
  ];
  return {
    prefs,
    items: (items ?? []) as LifeItem[],
    input: {
      draft,
      prefs,
      now,
      life,
      shifts: ((shifts ?? []) as { id: string; starts_at: string; ends_at: string }[]).map((s) => ({ id: s.id, start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime(), source: "shift" as const, fixed: true })),
      study: ((blocks ?? []) as { id: string; starts_at: string; ends_at: string; kind: string }[]).map((b) => ({ id: b.id, start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime(), kind: b.kind })),
      deadlines,
    },
  };
}

export function labelOption(o: Option, draft: Draft, titles: Map<string, string>): string {
  switch (o.kind) {
    case "go":
      return "Go as planned";
    case "leave_earlier":
      return `Go, but leave at ${formatTime(o.end)} (home by ${formatTime(o.end + draft.travelAfter * 60_000)})`;
    case "arrive_later":
      return `Go, but arrive at ${formatTime(o.start)}`;
    case "swap":
      return `Go, and move ${titles.get(o.itemId) ?? "the other plan"} to ${when(o.to.start)}`;
    case "move_study":
      return `Go, and move that study block to ${when(o.to.start)}`;
    case "skip":
      return "Skip it this time";
  }
}

export function templateReasons(e: Evaluation, prefs: LifePrefs): string[] {
  const r: string[] = [];
  r.push(
    e.sleepAfter >= prefs.sleep_hours - 0.25
      ? `You'd still get about ${e.sleepAfter.toFixed(1)} hours of sleep.`
      : `You'd get about ${e.sleepAfter.toFixed(1)} hours of sleep that night (${e.sleepAfterWithout.toFixed(1)} if you stayed home)${e.highStakesNextDay ? ", and there's an assessment the next day" : ""}.`,
  );
  if (e.clashes.some((c) => c.fixed)) r.push("It clashes with something fixed in your calendar.");
  r.push(e.studyLostMin ? `It overlaps ${e.studyLostMin} minutes of planned study${e.options.some((o) => o.kind === "move_study") ? ", which can move to another free slot" : ""}.` : "It doesn't clash with any planned study.");
  if (e.urgentNotReady) r.push(`${e.urgentNotReady} thing${e.urgentNotReady === 1 ? " is" : "s are"} due soon after with not much study done yet.`);
  else if (e.deadlinesNext7) r.push(`${e.deadlinesNext7} thing${e.deadlinesNext7 === 1 ? " is" : "s are"} due in the next 7 days, and they look manageable.`);
  if (e.balance.socialMin < prefs.social_hours_per_week * 60 && r.length < 4) r.push(`You've only got ${Math.round(e.balance.socialMin / 6) / 10} hours of social time planned this week, so this counts.`);
  return r.slice(0, 4);
}

const VERDICTS: Verdict[] = ["go", "go but shorter", "swap", "skip"];

export async function advise(db: Db, userId: string, draft: Draft, opts: { itemId?: string | null; now?: number } = {}): Promise<Advice> {
  const now = opts.now ?? Date.now();
  const { prefs, items, input } = await gather(db, userId, draft, now);
  const e = evaluate(input);
  // Only one-off plans can be moved (a repeating plan has no single occurrence to move).
  e.options = e.options.filter((o) => o.kind !== "swap" || items.find((i) => i.id === o.itemId)?.kind === "one_off");
  const titles = new Map(items.map((i) => [i.id, i.title]));
  const labelled = e.options.map((o) => ({ id: o.id, kind: o.kind, label: labelOption(o, draft, titles), option: o }));
  let verdict = defaultVerdict(e, prefs);
  let reasons = templateReasons(e, prefs);
  let altIds = labelled.filter((o) => o.kind !== "go" && o.kind !== "skip").map((o) => o.id).slice(0, 3);
  let byAI = false;

  if (await hasUsableKey(userId)) {
    try {
      const { value } = await callAI({
        userId,
        purpose: "life_advice",
        messages: [{ role: "user", content: JSON.stringify(advicePayload(draft, e)) }],
        system: `You advise a NSW high school student on whether to go to something, using only the numbers given. Give a clear recommendation (say what you think they should do), warm and honest; they make the final call. Social life, exercise and rest are valid priorities: the answer should usually be "go" unless there is a real conflict (sleep under 8 hours before a high-stakes day, a deadline that can't be saved, or a clash with something fixed). Never lecture or moralise about parties or friends. No medical advice.
Our own check suggests "${verdict}". Reply with ONLY JSON: {"verdict": "go"|"go but shorter"|"swap"|"skip", "reasons": [2-4 short plain sentences that quote the numbers], "alternatives": [1-3 option ids from the list given]}.`,
        json: (v) => {
          if (!v || typeof v !== "object") return null;
          const o = v as Record<string, unknown>;
          const vd = VERDICTS.includes(o.verdict as Verdict) ? (o.verdict as Verdict) : null;
          const rs = (Array.isArray(o.reasons) ? o.reasons : []).filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim().slice(0, 220)).filter(Boolean).slice(0, 4);
          const ids = new Set(e.options.map((x) => x.id));
          const alts = (Array.isArray(o.alternatives) ? o.alternatives : []).filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 3);
          return vd && rs.length >= 1 ? { verdict: vd, reasons: rs, alts } : null;
        },
        temperature: 0.3,
        budgetMs: 25_000,
      });
      verdict = value.verdict;
      reasons = value.reasons;
      if (value.alts.length) altIds = value.alts;
      byAI = true;
    } catch {
      /* the template answer stands */
    }
  }

  const { data: row } = await db
    .from("schedule_decisions")
    .insert({ user_id: userId, item_id: opts.itemId ?? null, verdict, factors: advicePayload(draft, e), suggestion: { reasons, alternatives: altIds, byAI } })
    .select("id")
    .single();

  return {
    verdict,
    reasons,
    alternatives: labelled.filter((o) => altIds.includes(o.id)),
    options: labelled,
    evaluation: e,
    decisionId: (row?.id as string) ?? null,
    byAI,
  };
}

export function draftFrom(p: { id?: string | null; category: LifeCategory; start: number; end: number; travelBefore?: number; travelAfter?: number; want?: number }): Draft {
  return {
    id: p.id ?? "draft",
    category: p.category,
    start: p.start,
    end: p.end,
    travelBefore: Math.min(600, Math.max(0, Math.round(p.travelBefore ?? 0))),
    travelAfter: Math.min(600, Math.max(0, Math.round(p.travelAfter ?? 0))),
    want: Math.min(5, Math.max(1, Math.round(p.want ?? 3))),
  };
}
