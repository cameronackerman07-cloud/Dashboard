"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { defaultRow } from "@/lib/agents/defaults";
import { definitionFor } from "@/lib/agents/registry";
import { nextRun, parseSchedule } from "@/lib/agents/schedule";
import { SOURCES, type SourceId } from "@/lib/agents/types";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isTimeKey } from "@/lib/time";
import { int, isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// RLS keeps every agent row scoped to its owner; these only change settings.

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

function cleanName(v: unknown): string | null {
  const name = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return name.length >= 1 && name.length <= 24 ? name : null;
}

function cleanSources(v: unknown): SourceId[] {
  return (Array.isArray(v) ? v : []).filter((s): s is SourceId => typeof s === "string" && SOURCE_IDS.has(s as SourceId));
}

function cleanUrls(v: unknown): string[] {
  return (Array.isArray(v) ? v : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => {
      try {
        const url = new URL(u);
        return (url.protocol === "https:" || url.protocol === "http:") && u.length <= 500;
      } catch {
        return false;
      }
    })
    .slice(0, 5);
}

function refresh() {
  revalidatePath("/ai-agents");
  revalidatePath("/inbox");
}

export async function renameAgent(id: string, raw: string): Promise<Reply> {
  const name = cleanName(raw);
  if (!isUuid(id)) return SAVE_FAILED;
  if (!name) return { ok: false, message: "Names are 1 to 24 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("agents").update({ name }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `Renamed to ${name}.` };
}

export async function setAgentEnabled(id: string, enabled: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { data } = await supabase.from("agents").select("schedule").eq("id", id).maybeSingle();
  const schedule = parseSchedule(data?.schedule) ?? { type: "daily", at: "07:00" };
  const { error } = await supabase
    .from("agents")
    .update({ enabled: !!enabled, next_run_at: new Date(nextRun(schedule, Date.now())).toISOString() })
    .eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: enabled ? "Switched on." : "Switched off." };
}

export type AgentSettings = {
  schedule: unknown;
  instructions: string;
  sources: string[];
  importanceMin: number;
  dailyAiBudget: number;
  webSources: string[];
  briefingAt?: string;
  resetAt?: string;
  tone?: string;
};

export async function updateAgent(id: string, s: AgentSettings): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const schedule = parseSchedule(s.schedule);
  if (!schedule) return { ok: false, message: "Check the schedule: every 15 minutes or more, or a time of day." };
  const supabase = await createClient();
  const { data: current } = await supabase.from("agents").select("config, role").eq("id", id).maybeSingle();
  if (!current) return SAVE_FAILED;
  const config: Record<string, unknown> = { ...(current.config as Record<string, unknown>), web_sources: cleanUrls(s.webSources) };
  if (current.role === "chief") {
    if (s.briefingAt && isTimeKey(s.briefingAt)) config.briefing_at = s.briefingAt;
    if (s.resetAt && isTimeKey(s.resetAt)) config.reset_at = s.resetAt;
    if (typeof s.tone === "string") config.tone = s.tone.slice(0, 60);
  }
  const { error } = await supabase
    .from("agents")
    .update({
      schedule,
      instructions: String(s.instructions ?? "").slice(0, 2000),
      sources: cleanSources(s.sources),
      importance_min: int(s.importanceMin, 1, 5, 3),
      daily_ai_budget: int(s.dailyAiBudget, 0, 100, 5),
      config,
      next_run_at: new Date(nextRun(schedule, Date.now())).toISOString(),
    })
    .eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Saved." };
}

export async function resetAgent(id: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { data } = await supabase.from("agents").select("slug, kind").eq("id", id).maybeSingle();
  const def = data?.kind === "builtin" ? definitionFor(data.slug as string) : undefined;
  if (!def) return { ok: false, message: "Only built-in agents can be reset." };
  const { user_id: _u, slug: _s, ...defaults } = defaultRow(def, userId);
  const { error } = await supabase.from("agents").update(defaults).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Back to its defaults." };
}

export async function deleteAgent(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("agents").delete().eq("id", id).eq("kind", "custom");
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Agent deleted." };
}

export async function createAgent(input: { name: string; instructions: string; sources: string[]; schedule: unknown; importanceMin: number }): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const name = cleanName(input.name);
  if (!name) return { ok: false, message: "Give it a name of 1 to 24 characters." };
  const instructions = String(input.instructions ?? "").trim().slice(0, 2000);
  if (instructions.length < 10) return { ok: false, message: "Say in a sentence or two what it should do." };
  const schedule = parseSchedule(input.schedule);
  if (!schedule) return { ok: false, message: "Pick a schedule." };
  const sources = cleanSources(input.sources);
  if (sources.length === 0) return { ok: false, message: "Tick at least one thing it may read." };
  const supabase = await createClient();
  const { error } = await supabase.from("agents").insert({
    slug: `custom-${randomBytes(4).toString("hex")}`,
    name,
    description: instructions.slice(0, 140),
    instructions,
    sources,
    schedule,
    importance_min: int(input.importanceMin, 1, 5, 3),
    daily_ai_budget: 3,
    kind: "custom",
    is_builtin: false,
    next_run_at: new Date(nextRun(schedule, Date.now())).toISOString(),
  });
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: `${name} is ready. It needs an AI key to run.` };
}
