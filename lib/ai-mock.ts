// AI_MOCK=1: canned answers so every AI feature can be tried with no keys.
// Each purpose returns something the real feature's validator accepts.

type Msg = { role: string; content: unknown };

function lastUser(messages: Msg[]): string {
  const m = [...messages].reverse().find((x) => x.role === "user");
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  return Array.isArray(m.content) ? m.content.map((p: { text?: string }) => p.text ?? "").join(" ") : "";
}

const MOCKS: Record<string, (user: string) => unknown> = {
  summary: () => ({
    title: "Mock summary",
    subject: "General / Other",
    sections: [{ heading: "Key points", points: ["This is a mock summary.", "Turn off AI_MOCK to use a real model."] }],
    flashcards: [
      { front: "What does AI_MOCK=1 do?", back: "It returns canned AI answers for testing.", module: "Testing", topic: "Mock mode" },
    ],
  }),
  dedupe: () => ({ groups: [] }),
  findings: () => ({ findings: [] }),
  assistant: (user) =>
    /plan/i.test(user)
      ? { mode: "action", reply: "Here's a plan for this week (mock).", actions: [{ type: "create_study_plan", week: "this" }] }
      : /to-?do/i.test(user)
        ? { mode: "action", reply: "I'll add that (mock).", actions: [{ type: "add_todo", title: user.replace(/^.*to-?do:?\s*/i, "").slice(0, 80) || "Mock to-do", priority: 2 }] }
        : { mode: "chat", reply: `Mock answer (AI_MOCK=1). You asked: ${user.slice(0, 120)}`, actions: [] },
  budget_question: () => ({ done: true }),
  budget_plan: () => ({
    fixed: [{ label: "Phone plan", amount: 15 }],
    allowance: [{ category: "Food", amount: 40 }, { category: "Transport", amount: 20 }],
    buffer: 10,
    savings: 30,
    tips: ["Mock tip: pack lunch twice this week."],
  }),
  slides: (user) => {
    const nums = [...user.matchAll(/\[(?:Slide|Part) (\d+)/g)].map((m) => Number(m[1]));
    return {
      slide_summaries: nums.map((n) => ({ slide: n, bullets: [`Mock point for ${n}.`] })),
      flashcards: nums.slice(0, 3).map((n) => ({ front: `Mock question about part ${n}?`, back: "A mock answer.", slide: n, module: "Mock module", topic: "Mock topic" })),
    };
  },
  pictures: () => ({ pictures: [{ n: 1, useful: true, text: "Mock: a labelled diagram of a wave showing wavelength and amplitude." }] }),
  life_advice: () => ({ verdict: "go", reasons: ["Mock: you'd still get about 8.5 hours of sleep.", "Mock: it doesn't clash with any study."], alternatives: [] }),
  deck_final: () => ({ title: "Mock deck", subject: "Physics", module: "Kinematics", topic: "Motion", key_points: ["Mock key point one.", "Mock key point two."] }),
  report: () => ({ headline: "Mock briefing: nothing urgent today.", sections: [{ heading: "Today", points: ["Mock point."] }] }),
};

export function mockReply(purpose: string, messages: Msg[], _system: string): string {
  const make = MOCKS[purpose];
  if (make) return JSON.stringify(make(lastUser(messages)));
  return `Mock answer (AI_MOCK=1). You asked: ${lastUser(messages).slice(0, 120)}`;
}
