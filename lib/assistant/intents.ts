// Fast paths for common spoken or typed requests: answered by code straight
// away, with no AI call. Pure, so it's unit-tested. Anything else goes to the AI.

import { ALL_SUBJECTS } from "@/lib/subjects";

export type Intent =
  | { kind: "due" }
  | { kind: "today" }
  | { kind: "next_shift" }
  | { kind: "study_week" }
  | { kind: "hsc" }
  | { kind: "cleaning" }
  | { kind: "timer_start"; minutes: number; subject: string }
  | { kind: "timer_stop" }
  | { kind: "timer_pause" }
  | { kind: "open"; page: string };

const ALIASES: [RegExp, string][] = [
  [/\b(maths? )?(ext(ension)?|x) ?(2|two)\b|\bmx2\b/i, "Mathematics Extension 2"],
  [/\b(maths? )?(ext(ension)?|x) ?(1|one)\b|\bmx1\b/i, "Mathematics Extension 1"],
  [/\b(maths? )?adv(anced)?\b|\bmaths?\b/i, "Mathematics Advanced"],
  [/\bengineering\b|\bengo\b/i, "Engineering Studies"],
  [/\bphysics\b|\bphys\b/i, "Physics"],
  [/\benglish\b/i, "English Standard"],
  [/\b(vet|entertainment)\b/i, "VET Entertainment"],
];

export function matchSubjectWords(text: string): string | null {
  const lower = text.toLowerCase();
  // Exact full names first (longest first, so "Mathematics Extension 1" beats "Mathematics").
  const full = [...ALL_SUBJECTS].sort((a, b) => b.length - a.length).find((s) => lower.includes(s.toLowerCase()));
  if (full) return full;
  for (const [re, s] of ALIASES) if (re.test(text)) return s;
  return null;
}

const WORD_NUM: Record<string, number> = { five: 5, ten: 10, fifteen: 15, twenty: 20, "twenty five": 25, "twenty-five": 25, thirty: 30, forty: 40, "forty five": 45, "forty-five": 45, sixty: 60, ninety: 90 };

function minutesIn(text: string): number | null {
  const m = /(\d{1,3})\s*(?:-|\s)?\s*(min(?:ute)?s?|hours?|hrs?|h)\b/i.exec(text);
  if (m) {
    const n = Number(m[1]);
    return /^h/i.test(m[2]) ? n * 60 : n;
  }
  const w = new RegExp(`\\b(${Object.keys(WORD_NUM).sort((a, b) => b.length - a.length).join("|")})\\s*(?:-\\s*)?(min(?:ute)?s?|hours?)\\b`, "i").exec(text);
  if (w) return /^h/i.test(w[2]) ? WORD_NUM[w[1].toLowerCase()] * 60 : WORD_NUM[w[1].toLowerCase()];
  if (/\bhalf an hour\b/i.test(text)) return 30;
  if (/\ban hour\b/i.test(text)) return 60;
  return null;
}

export function matchIntent(raw: string, pages: { slug: string; label: string }[]): Intent | null {
  const text = raw.trim().replace(/[?.!]+$/g, "");
  if (!text || text.length > 200) return null;
  const t = text.toLowerCase();

  if (/\b(start|begin|set)\b.*\btimer\b|\btimer\b.*\bfor\b|\bstart (studying|a study session)\b/.test(t)) {
    const minutes = minutesIn(text) ?? 25;
    if (minutes >= 1 && minutes <= 720) return { kind: "timer_start", minutes, subject: matchSubjectWords(text) ?? "Study" };
  }
  if (/\b(stop|finish|end)\b.*\b(timer|studying|session)\b|\bi'?m (done|finished) studying\b/.test(t)) return { kind: "timer_stop" };
  if (/\bpause\b/.test(t)) return { kind: "timer_pause" };
  if (/\bhow (many|much)\b.*\b(hours?|time)\b.*\bstud(y|ied)\b|\bstudy hours\b/.test(t)) return { kind: "study_week" };
  if (/\b(how long|how many days|when)\b.*\b(hsc|exams?)\b|\bhsc countdown\b/.test(t)) return { kind: "hsc" };
  if (/\bcleaning hours\b|\bcleaner hours\b/.test(t)) return { kind: "cleaning" };
  if (/\bnext shift\b|\bwhen (do|am) i work(ing)?\b/.test(t)) return { kind: "next_shift" };
  if (/\bwhat'?s due\b|\bwhat is due\b|\banything due\b|\bdue (soon|this week|tomorrow)\b/.test(t)) return { kind: "due" };
  if (/\bwhat'?s on today\b|\bwhat is on today\b|\bmy day\b|\btoday'?s (plan|schedule|briefing)\b/.test(t)) return { kind: "today" };
  const open = /^(open|go to|show( me)?|take me to)\s+(the\s+|my\s+)?(.+?)( page)?$/i.exec(text);
  if (open) {
    const want = open[4].toLowerCase();
    const page = pages.find((p) => p.label.toLowerCase() === want) ?? pages.find((p) => p.slug.replace(/-/g, " ") === want) ?? pages.find((p) => p.label.toLowerCase().includes(want) || want.includes(p.label.toLowerCase()));
    if (page) return { kind: "open", page: page.slug };
  }
  return null;
}
