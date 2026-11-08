import type { AgentDefinition } from "./types";

// Every built-in agent. Adding one = one file in lib/agents/builtin + one line
// here (see docs/ADDING_AN_AGENT.md).
export const BUILTIN_AGENTS: AgentDefinition[] = [];

export function definitionFor(slug: string): AgentDefinition | undefined {
  return BUILTIN_AGENTS.find((a) => a.slug === slug);
}
