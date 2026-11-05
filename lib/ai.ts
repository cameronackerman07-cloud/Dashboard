import "server-only";

// One small AI router for the whole app. Each page can ask for a specific model
// (the picker); otherwise we try every model whose provider key is set, in the
// order below, moving on when one is retired, rate-limited or down.
//
// Keys live in Vercel env vars (any one of these switches the AI features on):
//   GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY
//
// Model IDs get retired often, and a retired ID just returns an error. To update
// them, check each provider's deprecations page and edit MODELS — nothing else
// needs to change. Last checked: November 2026.
//   Groq:   https://console.groq.com/docs/deprecations
//   Gemini: https://aistudio.google.com/docs/deprecations
//
// Privacy: only ever pass school content to these models — never the user's
// name, email, or any stored token.

export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
};

// What the browser is allowed to know about a model: never a key.
export type AiModelOption = {
  id: string;
  label: string;
  provider: string;
  vision: boolean;
};

export type AiResult = {
  text: string;
  modelId: string;
  modelLabel: string;
};

type Provider = {
  name: string;
  envKey: string;
  url: string;
};

const PROVIDERS = {
  gemini: {
    name: "Gemini",
    envKey: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  },
  groq: {
    name: "Groq",
    envKey: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
  },
  openrouter: {
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
  },
  mistral: {
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1/chat/completions",
  },
} satisfies Record<string, Provider>;

type Model = {
  id: string; // what the picker stores
  provider: keyof typeof PROVIDERS;
  apiModel: string; // what the provider calls it
  label: string;
  vision: boolean; // can it read an image of handwriting?
};

// Tried top to bottom on Auto.
const MODELS: Model[] = [
  { id: "gemini-flash", provider: "gemini", apiModel: "gemini-3.6-flash", label: "Gemini 3.6 Flash", vision: true },
  { id: "gemini-flash-lite", provider: "gemini", apiModel: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", vision: true },
  { id: "groq-gpt-oss-120", provider: "groq", apiModel: "openai/gpt-oss-120b", label: "GPT-OSS 120B", vision: false },
  { id: "groq-qwen", provider: "groq", apiModel: "qwen/qwen3.8-27b", label: "Qwen 3.8", vision: true },
  { id: "groq-gpt-oss-20", provider: "groq", apiModel: "openai/gpt-oss-20b", label: "GPT-OSS 20B (fastest)", vision: false },
  { id: "openrouter-free", provider: "openrouter", apiModel: "openrouter/free", label: "OpenRouter free router", vision: true },
  { id: "mistral-small", provider: "mistral", apiModel: "mistral-small-latest", label: "Mistral Small", vision: false },
];

// The app's AI pages allow 60 seconds (see `maxDuration` on each page), so stop
// trying before the platform cuts the request off with no message at all.
const TOTAL_BUDGET_MS = 55_000;
const ATTEMPT_MS = 40_000;

// An error whose message is safe and useful to show the student.
export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

function hasKey(model: Model): boolean {
  return !!process.env[PROVIDERS[model.provider].envKey];
}

// True when at least one provider key is set, so the UI can show the right state.
export function aiConfigured(): boolean {
  return MODELS.some(hasKey);
}

// The models the picker can offer: only those we hold a key for.
export function availableModels(): AiModelOption[] {
  return MODELS.filter(hasKey).map((m) => ({
    id: m.id,
    label: m.label,
    provider: PROVIDERS[m.provider].name,
    vision: m.vision,
  }));
}

// Turn a provider's failure into something a person can act on. We deliberately
// don't pass the provider's own message through: it isn't written for students.
function reasonFor(status: number): string {
  if (status === 401 || status === 403) return "the API key was rejected";
  if (status === 404 || status === 400 || status === 410) return "the model is unavailable or retired";
  if (status === 413) return "the request was too large";
  if (status === 429) return "the free limit was reached";
  if (status >= 500) return "the provider is having problems";
  return `it returned error ${status}`;
}

// Some models put their private reasoning in the answer, wrapped in <think> tags.
function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

export async function aiChat(
  messages: AiMessage[],
  opts: {
    system?: string;
    temperature?: number;
    model?: string; // a picker id; anything else means Auto
    needsVision?: boolean;
  } = {},
): Promise<AiResult> {
  const usable = MODELS.filter(hasKey);
  if (usable.length === 0) throw new AiError("No AI key is set up yet.");

  const candidates = opts.needsVision ? usable.filter((m) => m.vision) : usable;
  if (candidates.length === 0) {
    throw new AiError(
      "None of your AI keys has a model that can read drawings. Add a GEMINI_API_KEY in Vercel, or type your answer.",
    );
  }

  // The picked model goes first; the rest stay in order as a fallback.
  const ordered = [...candidates].sort(
    (a, b) => Number(b.id === opts.model) - Number(a.id === opts.model),
  );

  const full: AiMessage[] = opts.system
    ? [{ role: "system", content: opts.system }, ...messages]
    : messages;

  const failures: string[] = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const model of ordered) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;

    const provider = PROVIDERS[model.provider];
    const name = model.label.startsWith(provider.name)
      ? model.label
      : `${provider.name} ${model.label}`;
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env[provider.envKey]}`,
        },
        body: JSON.stringify({
          model: model.apiModel,
          messages: full,
          temperature: opts.temperature ?? 0.4,
        }),
        signal: AbortSignal.timeout(Math.min(ATTEMPT_MS, remaining)),
      });

      if (!res.ok) {
        // Status only in the logs: never the request, the key or the response body.
        console.error(`AI: ${provider.name} ${model.apiModel} responded ${res.status}`);
        failures.push(`${name}: ${reasonFor(res.status)}`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const text = stripReasoning(data.choices?.[0]?.message?.content ?? "");
      if (text) return { text, modelId: model.id, modelLabel: name };

      console.error(`AI: ${provider.name} ${model.apiModel} returned no content`);
      failures.push(`${name}: it returned an empty answer`);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      console.error(`AI: ${provider.name} ${model.apiModel} ${timedOut ? "timed out" : "request failed"}`);
      failures.push(`${name}: ${timedOut ? "it took too long" : "couldn't reach it"}`);
    }
  }

  throw new AiError(
    failures.length
      ? `No model could answer. ${failures.join("; ")}.`
      : "No model could answer in time. Try again.",
  );
}

// A message for the student from anything aiChat throws.
export function aiErrorMessage(err: unknown): string {
  return err instanceof AiError ? err.message : "Something went wrong reaching the AI. Try again.";
}

// Tells the student if the model that answered isn't the one they picked.
export function fallbackNote(picked: string | undefined, result: AiResult): string | undefined {
  if (!picked || picked === "auto" || picked === result.modelId) return undefined;
  return `Your picked model wasn't available for this, so ${result.modelLabel} answered instead.`;
}
