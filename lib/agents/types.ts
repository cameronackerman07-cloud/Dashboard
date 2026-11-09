import type { AiMessage } from "@/lib/ai";
import type { Schedule } from "./schedule";

// What an agent may read. Notes are sensitive and off unless the user ticks them.
export type SourceId =
  | "assignments"
  | "todos"
  | "shifts"
  | "calendar"
  | "flashcard_stats"
  | "habits"
  | "money_summary"
  | "assessments"
  | "notes"
  | "profile_confirmed"
  | "web_sources"
  | "study_time"
  | "key_dates"
  | "life_balance";

export const SOURCES: { id: SourceId; label: string; sensitive?: boolean }[] = [
  { id: "assignments", label: "Assignments and due dates" },
  { id: "todos", label: "To-do list" },
  { id: "shifts", label: "Shifts and jobs" },
  { id: "calendar", label: "Timetable and calendar" },
  { id: "flashcard_stats", label: "Flashcard progress" },
  { id: "habits", label: "Habits" },
  { id: "money_summary", label: "Money summary (totals only)" },
  { id: "assessments", label: "Assessment marks" },
  { id: "notes", label: "Notes", sensitive: true },
  { id: "profile_confirmed", label: "About me (confirmed facts only)" },
  { id: "web_sources", label: "Web pages and RSS feeds you add" },
  { id: "study_time", label: "Study timer totals (hours only)" },
  { id: "key_dates", label: "Your key dates and the HSC countdown" },
  { id: "life_balance", label: "My life balance (totals only, never titles)" },
];

// Totals-only sources every agent may read without ticking them.
export const ALWAYS_SOURCES = new Set<SourceId>(["study_time", "key_dates", "life_balance"]);

export type Finding = {
  category: string;
  title: string;
  body?: string;
  importance: number; // 1–5
  dedupeKey: string; // stable, so the same thing is only reported once
  data?: Record<string, unknown>;
  actionUrl?: string;
  expiresAt?: string;
};

export type AgentRow = {
  id: string;
  user_id: string;
  slug: string;
  role: "specialist" | "chief";
  name: string;
  description: string;
  enabled: boolean;
  schedule: unknown;
  instructions: string;
  config: Record<string, unknown>;
  sources: string[];
  importance_min: number;
  daily_ai_budget: number;
  is_builtin: boolean;
  kind: "builtin" | "custom";
  last_run_at: string | null;
  next_run_at: string | null;
};

export type AgentContext = {
  userId: string;
  agent: AgentRow;
  now: number;
  deadline: number;
  // Read-only data, limited to the agent's allowed sources.
  read: <T = unknown>(source: SourceId) => Promise<T>;
  // One AI call with the user's own keys; counts towards the agent's and the user's budget.
  ai: <T>(args: { messages: AiMessage[]; system: string; json: (v: unknown) => T | null; purpose: string }) => Promise<T>;
  aiAvailable: boolean;
  // A short text-only fingerprint of anything: lets an agent skip the AI when nothing changed.
  lastHash: string | null;
  setHash: (hash: string) => void;
  // Only for the chief (The BRIAN): read other agents' findings, write reports, notify.
  chief: {
    unconsumed: () => Promise<StoredFinding[]>;
    markConsumed: (ids: string[]) => Promise<void>;
    reports: (kind: ReportKind, sinceIso: string) => Promise<{ id: string; created_at: string }[]>;
    writeReport: (r: NewReport) => Promise<string | null>;
    push: (msg: { title: string; body: string; url: string; category: "briefing" | "alerts" | "cleaning" | "money" | "school"; importance?: number }) => Promise<void>;
    agentName: (agentId: string) => string;
    settings: () => Promise<{ lat: number | null; lng: number | null; region: string | null; payWeekStart: number }>;
  };
  // Which sources are connected (yes/no only — never tokens).
  connections: () => Promise<{ canvas: boolean; classroom: boolean }>;
  // Agents may keep their own copy of school items (external_items) — nothing else is written.
  // Money ideas: read your ideas (status, score, logged earnings) and save ranked ideas. Status you set is never changed.
  ideas: {
    list: () => Promise<{ id: string; dedupe_key: string; title: string; status: string; score: number; hours_per_week: number }[]>;
    logged: (sinceDay: string) => Promise<{ idea_id: string; hours: number; earned_cents: number }[]>;
    save: (rows: Record<string, unknown>[]) => Promise<void>;
  };
  // About me: refresh computed facts (and the AI pass, only if opted in) as "suggested".
  profile: { analyse: () => Promise<{ added: number; ready: boolean }> };
  upsertExternal: (rows: { source: "canvas" | "classroom"; external_id: string; title: string; course: string | null; due_at: string | null; url: string | null; status: string | null }[]) => Promise<void>;
};

export type ReportKind = "briefing" | "sunday_reset" | "alert" | "strategy" | "cleaning_hours" | "custom";
export type ReportSection = { heading: string; points: string[] };
export type NewReport = { kind: ReportKind; title: string; headline: string; sections: ReportSection[]; findingIds?: string[] };
export type StoredFinding = {
  id: string;
  agent_id: string;
  category: string;
  title: string;
  body: string;
  importance: number;
  action_url: string | null;
  created_at: string;
};

export type AgentDefinition = {
  slug: string;
  role?: "specialist" | "chief";
  defaultName: string;
  description: string;
  defaultSchedule: Schedule;
  defaultSources: SourceId[];
  defaultConfig?: Record<string, unknown>;
  needsAI: boolean;
  importanceMin?: number;
  dailyAiBudget?: number;
  run: (ctx: AgentContext) => Promise<Finding[]>;
};
