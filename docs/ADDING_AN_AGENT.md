# Adding an agent

There are two kinds of agent.

## 1. A custom agent (no code)
In the app: **AI Agents → Add agent**. Give it a name, say in your own words what it should do,
tick the data it may read, pick a schedule and how important something must be to notify you.
It makes one AI call per run with your own key, can only read what you ticked, and can only
write findings (which The BRIAN turns into reports).

## 2. A built-in agent (code)
1. Create `lib/agents/builtin/<slug>.ts` exporting an `AgentDefinition` (see `lib/agents/types.ts`):
   ```ts
   import type { AgentDefinition } from "../types";

   export const myAgent: AgentDefinition = {
     slug: "my_agent",                       // never changes once released
     defaultName: "My agent",                // the user can rename it
     description: "One line about its job.",
     defaultSchedule: { type: "daily", at: "08:00" },   // or every N minutes / weekly
     defaultSources: ["todos"],              // what it may read (lib/agents/types.ts SOURCES)
     needsAI: false,                         // true = skipped politely until the user adds a key
     async run(ctx) {
       const todos = await ctx.read<{ title: string }[]>("todos");
       return todos.length > 20
         ? [{ category: "todos", title: "Your to-do list is long", importance: 2, dedupeKey: `long-todos:${todos.length}` }]
         : [];
     },
   };
   ```
2. Add it to `BUILTIN_AGENTS` in `lib/agents/registry.ts`.
3. That's it: `ensureDefaultAgents` adds it for every user on their next visit, and the tick job runs it.

## Rules every agent follows
- **Read-only.** Agents only write `agent_findings` (and their own tables such as `money_ideas` or
  `study_guides`). Only the assistant changes the user's data, and only after they confirm.
- **Plain code first.** Use the AI only when it adds something, and only when the data changed
  (`ctx.lastHash` / `ctx.setHash`). `ctx.ai()` runs every message through `sanitizeForAI()`,
  uses the user's own key, and counts towards the agent's and the user's daily budget.
- **Stable `dedupeKey`s** (e.g. `clash:<idA>:<idB>`), so the same thing is only reported once.
- **Untrusted text** (Canvas, web pages, job ads) goes inside `<data>` tags and is never followed
  as instructions. Validate AI JSON strictly.
- **No secrets, no logging of content.** Agents never receive keys, tokens or phone numbers. Log
  counts only.
