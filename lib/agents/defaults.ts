import "server-only";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { BUILTIN_AGENTS } from "./registry";
import { nextRun } from "./schedule";
import type { AgentDefinition } from "./types";

// Gives every user all the built-in agents (missing ones only; names and
// settings they changed are kept). Cheap: one read, and an insert only when
// something is missing.
export function defaultRow(def: AgentDefinition, userId: string, now = Date.now()) {
  return {
    user_id: userId,
    slug: def.slug,
    role: def.role ?? "specialist",
    name: def.defaultName,
    description: def.description,
    enabled: true,
    schedule: def.defaultSchedule,
    instructions: "",
    config: def.defaultConfig ?? {},
    sources: def.defaultSources,
    importance_min: def.importanceMin ?? 3,
    daily_ai_budget: def.dailyAiBudget ?? 5,
    is_builtin: true,
    kind: "builtin" as const,
    next_run_at: new Date(nextRun(def.defaultSchedule, now)).toISOString(),
  };
}

export async function ensureDefaultAgents(userId: string): Promise<void> {
  if (!adminConfigured()) return;
  const db = createAdminClient();
  const { data, error } = await db.from("agents").select("slug").eq("user_id", userId);
  if (error) return; // agents.sql not run yet
  const have = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  const missing = BUILTIN_AGENTS.filter((d) => !have.has(d.slug));
  if (missing.length === 0) return;
  await db.from("agents").upsert(missing.map((d) => defaultRow(d, userId)), { onConflict: "user_id,slug", ignoreDuplicates: true });
}
