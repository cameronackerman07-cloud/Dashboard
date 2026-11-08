// Coach maths (pure code, no AI): weakest flashcard topics, subjects not
// studied lately, assessment trends, and a small library of evidence-based
// study methods with their sources.

export type TopicStat = { subject: string; module: string; topic: string; cards: number; due: number; lapses: number; avgEase: number; lastStudied: string | null };
export type Assessment = { course: string; task: string; date: string | null; weighting: number | null; mark: number | null; max_mark: number | null };

// Higher = weaker. Lapses per card, low ease and overdue cards all count.
export function weaknessScore(t: TopicStat): number {
  if (t.cards === 0) return 0;
  return (t.lapses / t.cards) * 3 + Math.max(0, 2.5 - t.avgEase) * 2 + (t.due / t.cards) * 1.5;
}

export function weakestTopics(stats: TopicStat[], n = 5): (TopicStat & { score: number })[] {
  return stats
    .filter((t) => t.cards >= 3)
    .map((t) => ({ ...t, score: Math.round(weaknessScore(t) * 100) / 100 }))
    .filter((t) => t.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// Subjects with cards that haven't been studied for `days` or more.
export function staleSubjects(stats: TopicStat[], now: number, days = 4): { subject: string; daysSince: number | null }[] {
  const last = new Map<string, string | null>();
  for (const t of stats) {
    const prev = last.get(t.subject);
    if (prev === undefined || (t.lastStudied && (!prev || t.lastStudied > prev))) last.set(t.subject, t.lastStudied);
  }
  return [...last.entries()]
    .map(([subject, at]) => ({ subject, daysSince: at ? Math.floor((now - new Date(at).getTime()) / 86_400_000) : null }))
    .filter((s) => s.daysSince === null || s.daysSince >= days)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));
}

export const percent = (a: Pick<Assessment, "mark" | "max_mark">): number | null =>
  a.mark != null && a.max_mark ? Math.round((Number(a.mark) / Number(a.max_mark)) * 1000) / 10 : null;

// Per course: average so far (weighted when weightings are known) and the trend
// between the last two marked tasks.
export function courseProgress(list: Assessment[]): { course: string; average: number | null; trend: "up" | "down" | "steady" | null; marked: number; upcoming: number }[] {
  const by = new Map<string, Assessment[]>();
  for (const a of list) by.set(a.course, [...(by.get(a.course) ?? []), a]);
  return [...by.entries()].map(([course, items]) => {
    const marked = items.filter((a) => percent(a) != null).sort((x, y) => (x.date ?? "").localeCompare(y.date ?? ""));
    const w = marked.map((a) => Number(a.weighting) || 1);
    const sumW = w.reduce((s, x) => s + x, 0);
    const average = marked.length ? Math.round((marked.reduce((s, a, i) => s + percent(a)! * w[i], 0) / sumW) * 10) / 10 : null;
    let trend: "up" | "down" | "steady" | null = null;
    if (marked.length >= 2) {
      const d = percent(marked[marked.length - 1])! - percent(marked[marked.length - 2])!;
      trend = d > 3 ? "up" : d < -3 ? "down" : "steady";
    }
    return { course, average, trend, marked: marked.length, upcoming: items.filter((a) => percent(a) == null).length };
  });
}

export type Method = { id: string; technique: string; summary: string; maths: string; sciences: string; english: string; practical: string; sources: { label: string; href: string }[] };

// Each method lists where it comes from. Anything without a source is shown as "verify".
export const STUDY_METHODS: Method[] = [
  {
    id: "retrieval",
    technique: "Retrieval practice",
    summary: "Test yourself from memory before re-reading. Pulling an answer out of memory strengthens it far more than reading it again.",
    maths: "Cover the worked solution and redo the question; check only once you've finished.",
    sciences: "Write the definition or explain the experiment from memory, then check.",
    english: "Write your thesis and three key quotes from memory before checking your notes.",
    practical: "Explain the steps of the process aloud before you open the instructions.",
    sources: [{ label: "The Learning Scientists: retrieval practice", href: "https://www.learningscientists.org/retrieval-practice" }],
  },
  {
    id: "spacing",
    technique: "Spaced repetition",
    summary: "Spread practice over days and weeks instead of cramming. Your flashcards already do this.",
    maths: "Come back to each topic a few days later with a couple of mixed questions.",
    sciences: "Review each module's key ideas again after 2 days, a week, then a month.",
    english: "Revisit quotes and essay plans on a schedule, not just the night before.",
    practical: "Practise the skill in short sessions across the week.",
    sources: [{ label: "The Learning Scientists: spaced practice", href: "https://www.learningscientists.org/spaced-practice" }],
  },
  {
    id: "interleaving",
    technique: "Interleaving",
    summary: "Mix different kinds of problems in one session, so you practise choosing the method, not just using it.",
    maths: "Do a mixed set (calculus, trig, probability) instead of 20 of the same type.",
    sciences: "Mix calculation and explanation questions from different modules.",
    english: "Practise short answers on different texts and question types in one sitting.",
    practical: "Alternate between sub-skills rather than repeating one.",
    sources: [{ label: "The Learning Scientists: interleaving", href: "https://www.learningscientists.org/interleaving" }],
  },
  {
    id: "worked-examples",
    technique: "Worked examples, then fading",
    summary: "Study a full worked solution, then do similar questions with fewer and fewer steps shown.",
    maths: "Read one worked example, do a half-finished one, then one on your own.",
    sciences: "Follow a model calculation, then repeat with new numbers.",
    english: "Study a high-band sample paragraph, then write your own with the same structure.",
    practical: "Copy a model design step, then adapt it for your project.",
    sources: [{ label: "The Learning Scientists: concrete examples", href: "https://www.learningscientists.org/concrete-examples" }],
  },
  {
    id: "feedback",
    technique: "Mark against the guidelines",
    summary: "Mark your practice answers against NESA marking guidelines so you learn what earns the marks.",
    maths: "Compare your working with the marking guideline: where were the marks?",
    sciences: "Check which key words the guideline rewards and use them.",
    english: "Compare your response with the band descriptors and sample answers.",
    practical: "Check your project against the published criteria before submitting.",
    sources: [{ label: "NESA HSC exam papers and marking guidelines", href: "https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers" }],
  },
  {
    id: "elaboration",
    technique: "Elaboration",
    summary: "Ask yourself how and why things work, and connect new ideas to what you already know.",
    maths: "Explain why each step works, not just what it is.",
    sciences: "Link each formula to the physical idea behind it.",
    english: "Explain how a technique creates meaning, not just name it.",
    practical: "Explain why each design choice was made.",
    sources: [{ label: "The Learning Scientists: elaboration", href: "https://www.learningscientists.org/elaboration" }],
  },
];

export function methodOfTheWeek(now: number): Method {
  return STUDY_METHODS[Math.floor(now / 604_800_000) % STUDY_METHODS.length];
}

export const ATAR_LINKS = [
  { label: "UAC: how the ATAR is calculated", href: "https://www.uac.edu.au/future-applicants/atar" },
  { label: "UAC: scaling and the ATAR (Scaling Report)", href: "https://www.uac.edu.au/media-centre/publications" },
  { label: "NESA: HSC exam timetable", href: "https://www.nsw.gov.au/education-and-training/nesa/hsc/exams" },
];

export type CoachSettings = { targetAtar: number; targets: Record<string, number>; keyDates: { label: string; date: string }[] };

export function coachSettings(config: Record<string, unknown> | null | undefined): CoachSettings {
  const c = config ?? {};
  const t = Number(c.target_atar);
  const targets: Record<string, number> = {};
  if (c.targets && typeof c.targets === "object") {
    for (const [k, v] of Object.entries(c.targets as Record<string, unknown>)) if (Number(v) > 0 && Number(v) <= 100) targets[k] = Number(v);
  }
  const keyDates = Array.isArray(c.key_dates)
    ? (c.key_dates as { label?: unknown; date?: unknown }[]).filter((d) => typeof d.label === "string" && typeof d.date === "string").map((d) => ({ label: d.label as string, date: d.date as string }))
    : [];
  return { targetAtar: t >= 30 && t <= 99.95 ? t : 99, targets, keyDates: keyDates.sort((a, b) => a.date.localeCompare(b.date)) };
}
