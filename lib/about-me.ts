// "About me" helpers (pure code, no AI): writing-style stats, behaviour facts,
// the sensitive-topic filter, and the short style guide agents use.

export const FACT_CATEGORIES = ["interests", "goals", "skills", "communication style", "study habits", "schedule patterns", "preferences"] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];
export type Fact = { category: FactCategory; text: string; source: "user" | "computed" | "ai"; origin?: string; confidence?: number };

// Never stored: health or mental health, sexuality, religion, politics, family problems, immigration status.
const SENSITIVE =
  /\b(anxi|depress|adhd|autis|diagnos|disorder|medicat|therap|illness|disab|mental health|suicid|self[- ]harm|eating disorder|sexual|gay|lesbian|bisexual|trans(gender)?|queer|religio|church|christian|muslim|islam|jewish|hindu|buddhis|atheis|politic|labor|liberal|greens|vote|divorce|custody|abuse|parents? (fight|split)|visa|immigra|refugee|citizenship)/i;

export function isSensitive(text: string): boolean {
  return SENSITIVE.test(text);
}

export function cleanFact(category: unknown, text: unknown): { category: FactCategory; text: string } | null {
  if (!FACT_CATEGORIES.includes(category as FactCategory) || typeof text !== "string") return null;
  const t = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!t || isSensitive(t)) return null;
  return { category: category as FactCategory, text: t };
}

const AU_US: [RegExp, RegExp][] = [
  [/\b\w+ise[ds]?\b/gi, /\b\w+ize[ds]?\b/gi],
  [/\b\w+our\b/gi, /\b\w+or\b/gi],
  [/\b\w+tre\b/gi, /\b\w+ter\b/gi],
];
const COMMON_US_OR = /^(for|or|nor|door|floor|poor|major|minor|motor|author|actor|doctor|mirror|error|terror|horror|sensor|factor|tutor|editor|visitor)$/i;
const COMMON_TER = /^(after|water|better|letter|later|matter|enter|winter|computer|master|sister|chapter|character|semester|quarter|register|monster|filter|printer|daughter|shelter|counter|center)$/i;

export type StyleStats = { words: number; avgSentence: number; vocabRange: number; commasPer100: number; exclaimPer100: number; spelling: "Australian" | "US" | "mixed" | "unclear"; formality: "casual" | "neutral" | "formal"; phrases: string[] };

export function writingStats(texts: string[]): StyleStats | null {
  const all = texts.join("\n").slice(0, 100_000);
  const words = all.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 50) return null;
  const sentences = all.split(/[.!?]+\s/).filter((s) => s.trim().split(/\s+/).length > 2);
  const per100 = (re: RegExp) => Math.round(((all.match(re) ?? []).length / words.length) * 1000) / 10;
  let au = 0;
  let us = 0;
  for (const [a, u] of AU_US) {
    au += (all.match(a) ?? []).length;
    us += (all.match(u) ?? []).filter((w) => !COMMON_US_OR.test(w) && !COMMON_TER.test(w) && !/ise[ds]?$/i.test(w)).length;
  }
  const contractions = words.filter((w) => w.includes("'")).length / words.length;
  const casualWords = words.filter((w) => /^(gonna|wanna|yeah|nah|lol|heaps|reckon|pretty|stuff|kinda)$/.test(w)).length / words.length;
  const longWords = words.filter((w) => w.length >= 9).length / words.length;
  const formality = casualWords > 0.01 || contractions > 0.04 ? "casual" : longWords > 0.12 && contractions < 0.01 ? "formal" : "neutral";
  const stop = /^(the|a|an|and|or|of|to|in|is|it|that|this|i|you|we|for|on|with|as|be|was|are|at|by)$/;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    if (stop.test(words[i]) && stop.test(words[i + 1])) continue;
    const k = `${words[i]} ${words[i + 1]}`;
    bigrams.set(k, (bigrams.get(k) ?? 0) + 1);
  }
  return {
    words: words.length,
    avgSentence: Math.round((words.length / Math.max(1, sentences.length)) * 10) / 10,
    vocabRange: Math.round((new Set(words).size / words.length) * 100) / 100,
    commasPer100: per100(/,/g),
    exclaimPer100: per100(/!/g),
    spelling: au + us < 3 ? "unclear" : au > us * 2 ? "Australian" : us > au * 2 ? "US" : "mixed",
    formality,
    phrases: [...bigrams.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
  };
}

export function styleFacts(s: StyleStats): Fact[] {
  const out: Fact[] = [
    { category: "communication style", text: `Writes ${s.avgSentence <= 12 ? "short" : s.avgSentence <= 20 ? "medium-length" : "long"} sentences (about ${Math.round(s.avgSentence)} words)`, source: "computed", origin: "style", confidence: 0.7 },
    { category: "communication style", text: `Writing tone is mostly ${s.formality}`, source: "computed", origin: "style", confidence: 0.6 },
  ];
  if (s.spelling === "Australian" || s.spelling === "US") out.push({ category: "preferences", text: `Uses ${s.spelling} spelling`, source: "computed", origin: "style", confidence: 0.7 });
  return out;
}

export type Behaviour = { studyStarts: number[]; habitDaysDone: number; habitDaysPossible: number; tasksEarlyDays: number[]; weakTopics: string[] };

// Hour of day is Sydney time (0–23).
export function behaviourFacts(b: Behaviour): Fact[] {
  const out: Fact[] = [];
  if (b.studyStarts.length >= 5) {
    const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    for (const h of b.studyStarts) buckets[h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night"]++;
    const best = (Object.entries(buckets) as [keyof typeof buckets, number][]).sort((x, y) => y[1] - x[1])[0];
    out.push({ category: "study habits", text: `Usually studies in the ${best[0]}`, source: "computed", origin: "behaviour", confidence: Math.min(0.9, best[1] / b.studyStarts.length) });
  }
  if (b.habitDaysPossible >= 7) {
    const rate = b.habitDaysDone / b.habitDaysPossible;
    out.push({ category: "schedule patterns", text: `Keeps habits on ${rate >= 0.75 ? "most" : rate >= 0.4 ? "about half of" : "a few"} days`, source: "computed", origin: "behaviour", confidence: 0.7 });
  }
  if (b.tasksEarlyDays.length >= 3) {
    const sorted = [...b.tasksEarlyDays].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    out.push({ category: "study habits", text: median >= 2 ? `Usually finishes work ${Math.round(median)} days early` : median >= 0 ? "Usually finishes work close to the due date" : "Often finishes work after the due date", source: "computed", origin: "behaviour", confidence: 0.6 });
  }
  if (b.weakTopics.length) out.push({ category: "study habits", text: `Finds these topics tricky: ${b.weakTopics.slice(0, 3).join(", ")}`, source: "computed", origin: "behaviour", confidence: 0.6 });
  return out;
}

// A short style guide from CONFIRMED facts only. Never names or contact details.
export function styleGuide(facts: { category: string; text: string }[]): string {
  const useful = facts.filter((f) => ["communication style", "preferences", "study habits", "goals"].includes(f.category) && !isSensitive(f.text));
  if (!useful.length) return "";
  return `About this student (they confirmed these): ${useful.slice(0, 10).map((f) => f.text.replace(/[.;]+$/, "")).join("; ")}.`.slice(0, 700);
}

export type Questionnaire = { goals: string; interests: string; strengths: string; feedback: string; focus: string; bluntness: string };
export const QUESTIONS: { key: keyof Questionnaire; label: string; category: FactCategory; prefix: string }[] = [
  { key: "goals", label: "What are your goals this year?", category: "goals", prefix: "Goal" },
  { key: "interests", label: "What are you into outside school?", category: "interests", prefix: "Interested in" },
  { key: "strengths", label: "What are you good at?", category: "skills", prefix: "Strong at" },
  { key: "feedback", label: "How do you like feedback? (e.g. hints first, short and direct)", category: "communication style", prefix: "Likes feedback that is" },
  { key: "focus", label: "When do you focus best?", category: "study habits", prefix: "Focuses best" },
  { key: "bluntness", label: "How blunt should the agents be? (gentle, balanced, very direct)", category: "preferences", prefix: "Wants agents to be" },
];

export function questionnaireFacts(q: Partial<Questionnaire>): Fact[] {
  const out: Fact[] = [];
  for (const item of QUESTIONS) {
    const v = (q[item.key] ?? "").trim();
    if (!v) continue;
    const c = cleanFact(item.category, `${item.prefix}: ${v}`);
    if (c) out.push({ ...c, source: "user", origin: "questionnaire" });
  }
  return out;
}
