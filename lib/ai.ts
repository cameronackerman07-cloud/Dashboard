import "server-only";

// One small AI router for the whole app. We try free, OpenAI-compatible chat
// endpoints in order and move on to the next on a rate-limit or server error.
// Model IDs change often — keep them here so there's one place to update.
//
// Keys live in Vercel env vars (any one of these switches the AI features on):
//   GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY
//
// Privacy: only ever pass school content to these models — never the user's
// name, email, or any stored token.

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

type Provider = {
  name: string;
  envKey: string;
  url: string;
  model: string;
  headers?: (key: string) => Record<string, string>;
};

const PROVIDERS: Provider[] = [
  {
    name: "Gemini",
    envKey: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.0-flash",
  },
  {
    name: "Groq",
    envKey: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
  },
  {
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  {
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
  },
];

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI provider key is configured.");
    this.name = "AiNotConfiguredError";
  }
}

// True when at least one provider key is set, so the UI can show the right state.
export function aiConfigured(): boolean {
  return PROVIDERS.some((p) => !!process.env[p.envKey]);
}

export async function aiChat(
  messages: AiMessage[],
  opts: { system?: string; temperature?: number } = {},
): Promise<string> {
  const active = PROVIDERS.filter((p) => !!process.env[p.envKey]);
  if (active.length === 0) throw new AiNotConfiguredError();

  const full: AiMessage[] = opts.system
    ? [{ role: "system", content: opts.system }, ...messages]
    : messages;

  let lastError: unknown;
  for (const provider of active) {
    const key = process.env[provider.envKey]!;
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...(provider.headers?.(key) ?? {}),
        },
        body: JSON.stringify({
          model: provider.model,
          messages: full,
          temperature: opts.temperature ?? 0.4,
        }),
      });

      if (!res.ok) {
        lastError = new Error(`${provider.name} responded ${res.status}`);
        continue; // rate-limited / bad key / server error — try the next one
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return text.trim();
      lastError = new Error(`${provider.name} returned no content`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All AI providers failed");
}
