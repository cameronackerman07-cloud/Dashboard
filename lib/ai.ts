import "server-only";

// One small AI router for the whole app. Each page can ask for a specific model
// (the picker); otherwise we try the recommended models whose provider key is set,
// in the order below, moving on when one is retired, rate-limited or down.
//
// Keys live in Vercel env vars (any one of these switches the AI features on):
//   GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, CEREBRAS_API_KEY
//
// The picker also lists every other chat model each provider says your key can
// use (see discoverModels), so new models show up without code changes. Model IDs
// still get retired often, and a retired ID just returns an error. To update the
// recommended list, check each provider's deprecations page and edit MODELS.
// Last checked: November 2026.
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
  recommended: boolean;
};

export type AiResult = {
  text: string;
  modelId: string;
  modelLabel: string;
};

type ProviderId = "gemini" | "groq" | "openrouter" | "mistral" | "cerebras";

type Provider = {
  name: string;
  envKey: string;
  url: string; // chat completions
  modelsUrl: string; // list of models
};

const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    name: "Gemini",
    envKey: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  },
  groq: {
    name: "Groq",
    envKey: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  openrouter: {
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
  },
  mistral: {
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1/chat/completions",
    modelsUrl: "https://api.mistral.ai/v1/models",
  },
  cerebras: {
    name: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    modelsUrl: "https://api.cerebras.ai/v1/models",
  },
};

type Model = {
  id: string; // what the picker stores
  provider: ProviderId;
  apiModel: string; // what the provider calls it
  label: string;
  vision: boolean; // can it read an image of handwriting?
};

// Recommended models, tried top to bottom on Auto.
const MODELS: Model[] = [
  { id: "gemini-flash", provider: "gemini", apiModel: "gemini-3.6-flash", label: "Gemini 3.6 Flash", vision: true },
  { id: "gemini-flash-new", provider: "gemini", apiModel: "gemini-3.8-flash", label: "Gemini 3.8 Flash (newest)", vision: true },
  { id: "gemini-flash-lite", provider: "gemini", apiModel: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", vision: true },
  { id: "groq-gpt-oss-120", provider: "groq", apiModel: "openai/gpt-oss-120b", label: "GPT-OSS 120B", vision: false },
  { id: "groq-qwen", provider: "groq", apiModel: "qwen/qwen3.8-27b", label: "Qwen 3.8", vision: true },
  { id: "groq-gpt-oss-20", provider: "groq", apiModel: "openai/gpt-oss-20b", label: "GPT-OSS 20B (fastest)", vision: false },
  { id: "cerebras-gpt-oss", provider: "cerebras", apiModel: "gpt-oss-120b", label: "GPT-OSS 120B", vision: false },
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

function keyFor(provider: ProviderId): string | undefined {
  return process.env[PROVIDERS[provider].envKey] || undefined;
}

function displayName(model: Model): string {
  const provider = PROVIDERS[model.provider].name;
  return model.label.startsWith(provider) ? model.label : `${provider} ${model.label}`;
}

// True when at least one provider key is set, so the UI can show the right state.
export function aiConfigured(): boolean {
  return (Object.keys(PROVIDERS) as ProviderId[]).some((p) => !!keyFor(p));
}

// ---------------------------------------------------------------------------
// Discovery: ask each provider which models this key can use. Cached for an hour
// per server instance; if a provider doesn't answer, only the recommended list shows.
// ---------------------------------------------------------------------------

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const DISCOVERY_RETRY_MS = 5 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 4_000;
const MAX_PER_PROVIDER = 40;

// Speech, image, video, embedding and safety models can't answer a chat.
const NOT_CHAT =
  /whisper|tts|orpheus|playai|guard|safeguard|embed|imagen|veo|image|audio|live|transcri|moderation|rerank|ocr|aqa|distil/i;

const discovered = new Map<ProviderId, { at: number; ok: boolean; models: Model[] }>();

function prettyName(apiModel: string): string {
  return apiModel
    .replace(/^models\//, "")
    .replace(/:free$/, "")
    .split("/")
    .pop()!
    .replace(/[-_]/g, " ")
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

type ListedModel = {
  id?: string;
  active?: boolean;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  capabilities?: { completion_chat?: boolean; vision?: boolean };
  deprecation?: string | null;
};

// Turns one provider's model list into models the picker can offer.
function fromListing(provider: ProviderId, list: ListedModel[]): Model[] {
  const models: Model[] = [];
  for (const item of list) {
    const raw = item.id;
    if (!raw || NOT_CHAT.test(raw) || item.active === false) continue;
    const apiModel = raw.replace(/^models\//, "");
    let vision = false;

    if (provider === "gemini") {
      if (!/gemini|gemma/i.test(apiModel)) continue;
      vision = true;
    } else if (provider === "openrouter") {
      // Only free models: anything else would charge the account.
      const free = item.pricing?.prompt === "0" && item.pricing?.completion === "0";
      if (!free && !apiModel.endsWith(":free")) continue;
      if (item.architecture?.output_modalities && !item.architecture.output_modalities.includes("text")) continue;
      vision = !!item.architecture?.input_modalities?.includes("image");
    } else if (provider === "mistral") {
      if (item.capabilities && !item.capabilities.completion_chat) continue;
      if (item.deprecation) continue;
      if (!apiModel.endsWith("-latest")) continue; // skip the dated duplicates of each model
      vision = !!item.capabilities?.vision;
    }

    models.push({
      id: `${provider}:${apiModel}`,
      provider,
      apiModel,
      label: prettyName(apiModel),
      vision,
    });
  }
  return models.sort((a, b) => a.label.localeCompare(b.label)).slice(0, MAX_PER_PROVIDER);
}

async function discover(provider: ProviderId): Promise<Model[]> {
  const key = keyFor(provider);
  if (!key) return [];

  const cached = discovered.get(provider);
  const ttl = cached?.ok ? DISCOVERY_TTL_MS : DISCOVERY_RETRY_MS;
  if (cached && Date.now() - cached.at < ttl) return cached.models;

  let models: Model[] = [];
  let ok = false;
  try {
    const res = await fetch(PROVIDERS[provider].modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: ListedModel[] } | ListedModel[];
      const list = Array.isArray(body) ? body : (body.data ?? []);
      models = fromListing(provider, list);
      ok = true;
    } else {
      console.error(`AI: listing ${PROVIDERS[provider].name} models responded ${res.status}`);
    }
  } catch {
    console.error(`AI: listing ${PROVIDERS[provider].name} models failed`);
  }

  discovered.set(provider, { at: Date.now(), ok, models });
  return models;
}

async function allModels(): Promise<{ recommended: Model[]; extra: Model[] }> {
  const recommended = MODELS.filter((m) => keyFor(m.provider));
  const providers = (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => keyFor(p));
  const lists = await Promise.all(providers.map(discover));

  const taken = new Set(recommended.map((m) => `${m.provider}:${m.apiModel}`));
  const extra = lists.flat().filter((m) => !taken.has(m.id));
  return { recommended, extra };
}

// The models the picker can offer: only those we hold a key for.
export async function availableModels(): Promise<AiModelOption[]> {
  const { recommended, extra } = await allModels();
  const option = (m: Model, isRecommended: boolean): AiModelOption => ({
    id: m.id,
    label: m.label,
    provider: PROVIDERS[m.provider].name,
    vision: m.vision,
    recommended: isRecommended,
  });
  return [...recommended.map((m) => option(m, true)), ...extra.map((m) => option(m, false))];
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

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
  const { recommended, extra } = await allModels();
  if (recommended.length === 0) throw new AiError("No AI key is set up yet.");

  const fits = (m: Model) => !opts.needsVision || m.vision;
  const picked = [...recommended, ...extra].find((m) => m.id === opts.model && fits(m));
  const fallback = recommended.filter((m) => fits(m) && m !== picked);
  const ordered = picked ? [picked, ...fallback] : fallback;

  if (ordered.length === 0) {
    throw new AiError(
      "None of your AI keys has a model that can read drawings. Add a GEMINI_API_KEY in Vercel, or type your answer.",
    );
  }

  const full: AiMessage[] = opts.system
    ? [{ role: "system", content: opts.system }, ...messages]
    : messages;

  const failures: string[] = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const model of ordered) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;

    const provider = PROVIDERS[model.provider];
    const name = displayName(model);
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyFor(model.provider)}`,
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
