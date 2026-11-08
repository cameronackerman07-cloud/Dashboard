// The assistant's reply shape and the strict allowlist of actions it may ask
// for. Everything the model sends is checked here before anything happens;
// unknown actions, extra fields and oversize values are dropped.
// No "server-only" import, so the tests can load it.

export type AssistantMode = "tutor" | "chat" | "action";

export type AssistantAction =
  | { type: "create_study_plan"; week: "this" | "next"; focus: string | null }
  | { type: "add_study_block"; day: string; start: string; minutes: number; subject: string; topic: string | null; kind: "study" | "flashcards" | "practice" | "rest" }
  | { type: "add_todo"; title: string; due_on: string | null; subject: string | null; priority: 1 | 2 | 3 }
  | { type: "add_note"; title: string; body: string; subject: string | null }
  | { type: "create_flashcards"; subject: string; module: string | null; topic: string | null; cards: { front: string; back: string }[] }
  | { type: "log_habit"; habit: string }
  | { type: "create_budget_plan"; note: string | null }
  | { type: "research_topic"; topic: string }
  | { type: "rename_agent"; agent: string; new_name: string }
  | { type: "run_agent"; agent: string }
  | { type: "open_page"; page: string };

export type ActionType = AssistantAction["type"];

export const ACTION_TYPES: ActionType[] = [
  "create_study_plan",
  "add_study_block",
  "add_todo",
  "add_note",
  "create_flashcards",
  "log_habit",
  "create_budget_plan",
  "research_topic",
  "rename_agent",
  "run_agent",
  "open_page",
];

// Small enough to apply straight away when "Ask before changing things" is off.
export const TINY_ACTIONS = new Set<ActionType>(["add_todo", "log_habit", "open_page"]);

export const MAX_ACTIONS = 5;
export const MAX_CARDS = 30;
export const MAX_REPLY = 6000;

export type AssistantReply = { mode: AssistantMode; reply: string; actions: AssistantAction[]; dropped: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = ["study", "flashcards", "practice", "rest"] as const;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
}
function opt(v: unknown, max: number): string | null {
  return str(v, max) || null;
}

export function parseAction(raw: unknown, pages: string[]): AssistantAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "create_study_plan": {
      const week = o.week === "next" ? "next" : "this";
      return { type: "create_study_plan", week, focus: opt(o.focus, 300) };
    }
    case "add_study_block": {
      const day = str(o.day, 10);
      const start = str(o.start, 5).padStart(5, "0");
      const minutes = Math.round(Number(o.minutes));
      if (!DAY.test(day) || !TIME.test(start) || !Number.isFinite(minutes) || minutes < 10 || minutes > 240) return null;
      const kind = KINDS.includes(o.kind as (typeof KINDS)[number]) ? (o.kind as (typeof KINDS)[number]) : "study";
      return { type: "add_study_block", day, start, minutes, subject: str(o.subject, 80) || "Study", topic: opt(o.topic, 120), kind };
    }
    case "add_todo": {
      const title = str(o.title, 200);
      if (!title) return null;
      const due = str(o.due_on, 10);
      const p = Number(o.priority);
      return { type: "add_todo", title, due_on: DAY.test(due) ? due : null, subject: opt(o.subject, 80), priority: p === 1 || p === 3 ? p : 2 };
    }
    case "add_note": {
      const body = str(o.body, 20_000);
      if (!body) return null;
      return { type: "add_note", title: str(o.title, 200) || "Note", body, subject: opt(o.subject, 80) };
    }
    case "create_flashcards": {
      if (!Array.isArray(o.cards)) return null;
      const cards = o.cards
        .slice(0, MAX_CARDS)
        .map((c) => (c && typeof c === "object" ? { front: str((c as Record<string, unknown>).front, 500), back: str((c as Record<string, unknown>).back, 1500) } : null))
        .filter((c): c is { front: string; back: string } => !!c && !!c.front && !!c.back);
      if (!cards.length) return null;
      return { type: "create_flashcards", subject: str(o.subject, 80) || "General / Other", module: opt(o.module, 120), topic: opt(o.topic, 120), cards };
    }
    case "log_habit": {
      const habit = str(o.habit, 60);
      return habit ? { type: "log_habit", habit } : null;
    }
    case "create_budget_plan":
      return { type: "create_budget_plan", note: opt(o.note, 300) };
    case "research_topic": {
      const topic = str(o.topic, 200);
      return topic ? { type: "research_topic", topic } : null;
    }
    case "rename_agent": {
      const agent = str(o.agent, 40);
      const name = str(o.new_name, 24);
      return agent && name ? { type: "rename_agent", agent, new_name: name } : null;
    }
    case "run_agent": {
      const agent = str(o.agent, 40);
      return agent ? { type: "run_agent", agent } : null;
    }
    case "open_page": {
      const page = str(o.page, 40).replace(/^\//, "");
      return pages.includes(page) ? { type: "open_page", page } : null;
    }
    default:
      return null;
  }
}

export function parseAssistantReply(value: unknown, pages: string[]): AssistantReply | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const reply = str(o.reply, MAX_REPLY);
  const rawActions = Array.isArray(o.actions) ? o.actions : [];
  const actions: AssistantAction[] = [];
  let dropped = 0;
  for (const a of rawActions.slice(0, 20)) {
    const parsed = actions.length < MAX_ACTIONS ? parseAction(a, pages) : null;
    if (parsed) actions.push(parsed);
    else dropped++;
  }
  const mode: AssistantMode = o.mode === "tutor" || o.mode === "action" ? o.mode : "chat";
  if (!reply && !actions.length) return null;
  return { mode: actions.length ? "action" : mode === "action" ? "chat" : mode, reply, actions, dropped };
}

export const ACTION_GUIDE = `Allowed actions (JSON objects with a "type"):
- {"type":"create_study_plan","week":"this"|"next","focus":string?}  (the site works out the times itself)
- {"type":"add_study_block","day":"YYYY-MM-DD","start":"HH:MM","minutes":number,"subject":string,"topic":string?,"kind":"study"|"flashcards"|"practice"|"rest"}
- {"type":"add_todo","title":string,"due_on":"YYYY-MM-DD"?,"subject":string?,"priority":1|2|3}
- {"type":"add_note","title":string,"body":string,"subject":string?}
- {"type":"create_flashcards","subject":string,"module":string?,"topic":string?,"cards":[{"front":string,"back":string}]}  (at most 30)
- {"type":"log_habit","habit":string}
- {"type":"create_budget_plan","note":string?}
- {"type":"research_topic","topic":string}
- {"type":"rename_agent","agent":string,"new_name":string}  (max 24 characters)
- {"type":"run_agent","agent":string}
- {"type":"open_page","page":string}
You cannot delete or edit existing things.`;
