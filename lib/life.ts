// My life: personal plans (training, family, social, work, rest) and the
// preferences that keep a week balanced. Pure code, shared by the page, the
// planner, the advisor and the tests. Times are Australia/Sydney.

import { addDays, isTimeKey, sydneyInstant, weekdayOfKey } from "@/lib/time";

export type LifeCategory = "social" | "fitness" | "family" | "work" | "hobby" | "rest" | "errands" | "travel" | "other";
export type Flexibility = "fixed" | "movable" | "optional";
export type Energy = "low" | "medium" | "high";
export type LifeStatus = "planned" | "confirmed" | "skipped" | "done";

export const CATEGORIES: { value: LifeCategory; label: string }[] = [
  { value: "social", label: "Social" },
  { value: "fitness", label: "Fitness and sport" },
  { value: "family", label: "Family" },
  { value: "work", label: "Work" },
  { value: "hobby", label: "Hobby" },
  { value: "rest", label: "Rest" },
  { value: "errands", label: "Errands" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
];

export type Recurrence = { days: number[]; start: string; end: string; until?: string | null };

export type LifeItem = {
  id: string;
  title: string;
  category: LifeCategory;
  kind: "one_off" | "recurring";
  starts_at: string | null;
  ends_at: string | null;
  recurrence: Recurrence | null;
  travel_before_min: number;
  travel_after_min: number;
  importance: number;
  flexibility: Flexibility;
  energy: Energy;
  notes: string | null;
  status: LifeStatus;
};

export type LifePrefs = {
  sleep_hours: number;
  school_wake: string;
  weekend_lie_in_min: number;
  wind_down_min: number;
  exercise_per_week: number;
  social_hours_per_week: number;
  downtime_min_per_day: number;
  max_study_school_day_min: number;
  max_study_weekend_min: number;
  rest_blocks_per_week: number;
  meal_times: { breakfast: string; lunch: string; dinner: string };
};

// Sensible defaults for a Year 11–12 student (8–10 hours' sleep is the
// recommendation for teenagers).
export const DEFAULT_PREFS: LifePrefs = {
  sleep_hours: 8.5,
  school_wake: "06:45",
  weekend_lie_in_min: 60,
  wind_down_min: 45,
  exercise_per_week: 3,
  social_hours_per_week: 6,
  downtime_min_per_day: 60,
  max_study_school_day_min: 180,
  max_study_weekend_min: 300,
  rest_blocks_per_week: 1,
  meal_times: { breakfast: "07:00", lunch: "12:30", dinner: "18:30" },
};

export const SLEEP_MINIMUM_HOURS = 8;

export function prefsFrom(row: Partial<LifePrefs> | null | undefined): LifePrefs {
  const p = { ...DEFAULT_PREFS, ...(row ?? {}) } as LifePrefs;
  p.sleep_hours = Number(p.sleep_hours) || DEFAULT_PREFS.sleep_hours;
  p.social_hours_per_week = Number(p.social_hours_per_week);
  if (!p.meal_times || typeof p.meal_times !== "object") p.meal_times = DEFAULT_PREFS.meal_times;
  if (!isTimeKey(p.school_wake)) p.school_wake = DEFAULT_PREFS.school_wake;
  return p;
}

export type Occurrence = {
  itemId: string;
  category: LifeCategory;
  start: number;
  end: number;
  travelBefore: number; // minutes
  travelAfter: number;
  importance: number;
  flexibility: Flexibility;
  energy: Energy;
  status: LifeStatus;
};

const MIN = 60_000;

function occ(item: LifeItem, start: number, end: number): Occurrence {
  return {
    itemId: item.id,
    category: item.category,
    start,
    end,
    travelBefore: item.travel_before_min ?? 0,
    travelAfter: item.travel_after_min ?? 0,
    importance: item.importance ?? 3,
    flexibility: item.flexibility ?? "movable",
    energy: item.energy ?? "medium",
    status: item.status,
  };
}

// Every occurrence that overlaps [from, to). Skipped items are left out.
export function expand(items: LifeItem[], from: number, to: number, fromDay: string, days: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const item of items) {
    if (item.status === "skipped") continue;
    if (item.kind === "recurring" && item.recurrence) {
      const r = item.recurrence;
      if (!isTimeKey(r.start) || !isTimeKey(r.end)) continue;
      for (let i = -1; i <= days; i++) {
        const day = addDays(fromDay, i);
        if (!r.days.includes(weekdayOfKey(day))) continue;
        if (r.until && day > r.until) continue;
        const s = sydneyInstant(day, r.start);
        const e = r.end > r.start ? sydneyInstant(day, r.end) : sydneyInstant(addDays(day, 1), r.end);
        if (e > from && s < to) out.push(occ(item, s, e));
      }
    } else if (item.starts_at && item.ends_at) {
      const s = new Date(item.starts_at).getTime();
      const e = new Date(item.ends_at).getTime();
      if (e > s && e > from && s < to) out.push(occ(item, s, e));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// Busy time for the planner, travel included.
export function busyIntervals(list: Occurrence[]): { start: number; end: number }[] {
  return list.map((o) => ({ start: o.start - o.travelBefore * MIN, end: o.end + o.travelAfter * MIN }));
}

// When the student plans to wake on a day (school days use the school wake
// time; weekends allow the lie-in).
export function wakeTime(prefs: LifePrefs, day: string): number {
  const base = sydneyInstant(day, prefs.school_wake);
  return weekdayOfKey(day) >= 6 ? base + prefs.weekend_lie_in_min * MIN : base;
}

// The planned sleep window for the night that starts on `day`.
export function sleepWindow(prefs: LifePrefs, day: string): { start: number; end: number } {
  const end = wakeTime(prefs, addDays(day, 1));
  return { start: end - prefs.sleep_hours * 60 * MIN, end };
}

// Sleep actually possible on the night that starts on `day`, given commitments
// (late finishes push bedtime back; early starts the next day pull waking forward).
// Allows 30 minutes to get to bed after getting home, and 30 minutes to get ready.
export function sleepFor(prefs: LifePrefs, day: string, commitments: { start: number; end: number; travelBefore?: number; travelAfter?: number }[]): { hours: number; bedtime: number; wake: number } {
  const planned = sleepWindow(prefs, day);
  const eveningFrom = sydneyInstant(day, "15:00");
  let bedtime = planned.start;
  let wake = planned.end;
  // Something that starts before the middle of the night is a late finish;
  // something that starts after it is an early start the next morning.
  const middle = (planned.start + planned.end) / 2;
  for (const c of commitments) {
    const home = c.end + (c.travelAfter ?? 0) * MIN;
    if (c.start < middle && c.end > eveningFrom && home + 30 * MIN > bedtime) bedtime = home + 30 * MIN;
  }
  for (const c of commitments) {
    const leave = c.start - (c.travelBefore ?? 0) * MIN - 30 * MIN;
    if (c.start >= middle && c.start < planned.end + 6 * 60 * MIN && leave < wake) wake = Math.max(leave, bedtime);
  }
  return { hours: Math.max(0, (wake - bedtime) / (60 * MIN)), bedtime, wake };
}

// "Gym Tue and Thu 6pm for 1 hour", "Party Saturday 8pm to 11:30pm",
// "Family dinner Sunday 6:30pm 2h". Returns null if it can't tell.
const DAY_WORDS: [RegExp, number][] = [
  [/\bmon(day)?s?\b/i, 1],
  [/\btue(s|sday)?s?\b/i, 2],
  [/\bwed(nesday)?s?\b/i, 3],
  [/\bthu(r|rs|rsday)?s?\b/i, 4],
  [/\bfri(day)?s?\b/i, 5],
  [/\bsat(urday)?s?\b/i, 6],
  [/\bsun(day)?s?\b/i, 7],
];

function parseClock(s: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 7) h += 12; // "6" with no am/pm → 6pm
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type QuickAdd = { title: string; days: number[]; start: string; minutes: number; category: LifeCategory; recurring: boolean };

export function guessCategory(title: string): LifeCategory {
  const t = title.toLowerCase();
  if (/gym|run|swim|train|footy|soccer|football|basketball|netball|tennis|cricket|ref|sport|yoga|walk/.test(t)) return "fitness";
  if (/party|friend|movie|hang|date|formal|concert|birthday/.test(t)) return "social";
  if (/family|mum|dad|nan|grand|dinner with|cousin/.test(t)) return "family";
  if (/work|shift|job/.test(t)) return "work";
  if (/rest|chill|nap|relax/.test(t)) return "rest";
  if (/shop|errand|appointment|dentist|doctor|haircut/.test(t)) return "errands";
  if (/trip|travel|flight|holiday/.test(t)) return "travel";
  if (/guitar|piano|music|draw|game|art|band|lesson/.test(t)) return "hobby";
  return "other";
}

export function parseQuickAdd(text: string): QuickAdd | null {
  const s = text.trim().slice(0, 200);
  if (!s) return null;
  const days = DAY_WORDS.filter(([re]) => re.test(s)).map(([, d]) => d);
  const every = /\b(every|each|weekly)\b/i.test(s) || /\b(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i.test(s) || days.length > 1;
  const range = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i.exec(s);
  const at = /(?:\bat\s+)?\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b|\bat\s+(\d{1,2}(?::\d{2})?)\b/i.exec(s);
  let start: string | null = null;
  let minutes = 60;
  if (range) {
    let a = range[1];
    const b = range[2];
    // "8 to 11:30pm": the am/pm on the end applies to both.
    if (!/am|pm/i.test(a) && /pm/i.test(b)) a = `${a}pm`;
    start = parseClock(a);
    const end = parseClock(b);
    if (start && end) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      let d = eh * 60 + em - (sh * 60 + sm);
      if (d <= 0) d += 24 * 60;
      minutes = d;
    }
  } else if (at) {
    start = parseClock(at[1] ?? at[2]);
  }
  const dur = /\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?)\b|\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|mins?|minutes?)\b/i.exec(s);
  if (dur && !range) {
    const n = Number(dur[1] ?? dur[3]);
    const unit = (dur[2] ?? dur[4]).toLowerCase();
    minutes = Math.round(unit.startsWith("h") ? n * 60 : n);
  }
  if (!start || !days.length || minutes < 5 || minutes > 16 * 60) return null;
  // The title is whatever comes before the first day or time word.
  const cut = s.search(/\b(every|each|on|at|from)\b|\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\d/i);
  const title = (cut > 0 ? s.slice(0, cut) : s).replace(/\s+(and|&)\s*$/i, "").trim().slice(0, 120) || "Plan";
  return { title, days, start, minutes, category: guessCategory(title), recurring: every };
}
