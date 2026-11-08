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
  report: () => ({ headline: "Mock briefing: nothing urgent today.", sections: [{ heading: "Today", points: ["Mock point."] }] }),
};

export function mockReply(purpose: string, messages: Msg[], _system: string): string {
  const make = MOCKS[purpose];
  if (make) return JSON.stringify(make(lastUser(messages)));
  return `Mock answer (AI_MOCK=1). You asked: ${lastUser(messages).slice(0, 120)}`;
}
