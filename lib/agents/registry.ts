import { assignments } from "./builtin/assignments";
import { brian } from "./builtin/brian";
import { cleaningHours } from "./builtin/cleaning-hours";
import { deadlines } from "./builtin/deadlines";
import type { AgentDefinition } from "./types";

// Every built-in agent. Adding one = one file in lib/agents/builtin + one line
// here (see docs/ADDING_AN_AGENT.md).
export const BUILTIN_AGENTS: AgentDefinition[] = [brian, assignments, deadlines, cleaningHours];

export function definitionFor(slug: string): AgentDefinition | undefined {
  return BUILTIN_AGENTS.find((a) => a.slug === slug);
}
