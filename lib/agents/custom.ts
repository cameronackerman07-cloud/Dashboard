import type { AgentContext, Finding, SourceId } from "./types";

// A custom agent: the user's own instructions + the data they ticked + a
// schedule. One AI call; it can only read that data and write findings.

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseFindings(value: unknown): Finding[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { findings?: unknown }).findings)) return null;
  const out: Finding[] = [];
  for (const f of (value as { findings: unknown[] }).findings.slice(0, 10)) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const title = str(o.title, 140);
    if (!title) continue;
    const importance = Math.min(5, Math.max(1, Math.round(Number(o.importance) || 2)));
    out.push({
      category: str(o.category, 30) || "note",
      title,
      body: str(o.body, 800),
      importance,
      dedupeKey: `custom:${str(o.key, 80) || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}`,
    });
  }
  return out;
}

export async function runCustomAgent(ctx: AgentContext): Promise<Finding[]> {
  const data: Record<string, unknown> = {};
  for (const s of ctx.agent.sources as SourceId[]) {
    try {
      data[s] = await ctx.read(s);
    } catch {
      /* not allowed or unavailable */
    }
  }
  const compact = JSON.stringify(data).slice(0, 12_000);
  return ctx.ai({
    purpose: "findings",
    system: `You are a helper agent inside a student's dashboard. Follow the student's instructions using only the data given.
Reply with ONLY JSON: {"findings": [{"title": string, "body": string, "importance": 1-5, "category": string, "key": string}]}.
At most 5 findings; [] if nothing is worth saying. "key" is a short stable id for the same thing next time. Never suggest contacting anyone or spending money.`,
    messages: [{ role: "user", content: `Instructions:\n${ctx.agent.instructions.slice(0, 2000)}\n\n<data>\n${compact}\n</data>` }],
    json: parseFindings,
  });
}
