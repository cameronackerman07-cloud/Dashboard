import "server-only";
import { createHash } from "node:crypto";
import { budgetLeft, hasUsableKey, markKey, recordUsage, resolveKeys, type KeySet, type ProviderId } from "@/lib/ai-keys";
import { mockReply } from "@/lib/ai-mock";
import { redactSecrets } from "@/lib/redact";

// One small AI router for the whole app. Each page can ask for a specific model
// (the picker); otherwise we try the recommended models whose provider key is set,
// in the order below, moving on when one is retired, rate-limited or down.
//
// Keys live in Vercel env vars (any one of these switches the AI features on):
//   GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, CEREBRAS_API_KEY
// Providers without a key are skipped. Free model names change often, so each
// provider's first model can be overridden without a code change:
//   GEMINI_MODEL, GROQ_MODEL, OPENROUTER_MODEL (a ":free" model), MISTRAL_MODEL
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


type Provider = {
  name: string;
  envKey: string;
  modelEnv?: string; // optional env var naming a model to try first

  url: string; // chat completions
  modelsUrl: string; // list of models
};

const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    name: "Gemini",
    envKey: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  },
  groq: {
    name: "Groq",
    envKey: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    url: "https://api.groq.com/openai/v1/chat/completions",
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  openrouter: {
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
  },
  mistral: {
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
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

function keyFor(set: KeySet, provider: ProviderId): string | undefined {
  return set.keys[provider];
}

function displayName(model: Model): string {
  const provider = PROVIDERS[model.provider].name;
  return model.label.startsWith(provider) ? model.label : `${provider} ${model.label}`;
}

// True when this user has a key the AI can use (their own, or the site's if
// they're allowed), so a page can show "Add a free AI key" instead of failing.
export async function aiReadyFor(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  return hasUsableKey(userId);
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

// Cached per provider AND key, since different people's keys can see different models.
const discovered = new Map<string, { at: number; ok: boolean; models: Model[] }>();

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

async function discover(set: KeySet, provider: ProviderId): Promise<Model[]> {
  const key = keyFor(set, provider);
  if (!key) return [];
  const cacheKey = `${provider}:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;

  const cached = discovered.get(cacheKey);
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

  discovered.set(cacheKey, { at: Date.now(), ok, models });
  return models;
}

// A model named in GEMINI_MODEL etc. goes in front of that provider's others.
function envModels(): Model[] {
  const out: Model[] = [];
  for (const provider of Object.keys(PROVIDERS) as ProviderId[]) {
    const env = PROVIDERS[provider].modelEnv;
    const apiModel = env ? process.env[env]?.trim() : undefined;
    if (!apiModel || !/^[\w.:/-]{1,120}$/.test(apiModel)) continue;
    out.push({ id: `${provider}:${apiModel}`, provider, apiModel, label: prettyName(apiModel), vision: provider === "gemini" });
  }
  return out;
}

function recommendedModels(set: KeySet): Model[] {
  const fromEnv = envModels();
  const list: Model[] = [];
  for (const m of MODELS) {
    for (const e of fromEnv) {
      if (e.provider === m.provider && !list.includes(e)) list.push(e);
    }
    if (!fromEnv.some((e) => e.provider === m.provider && e.apiModel === m.apiModel)) list.push(m);
  }
  return list.filter((m) => keyFor(set, m.provider));
}

async function allModels(set: KeySet): Promise<{ recommended: Model[]; extra: Model[] }> {
  const recommended = recommendedModels(set);
  const providers = (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => keyFor(set, p));
  const lists = await Promise.all(providers.map((p) => discover(set, p)));

  const taken = new Set(recommended.map((m) => `${m.provider}:${m.apiModel}`));
  const extra = lists.flat().filter((m) => !taken.has(m.id));
  return { recommended, extra };
}

// The models the picker can offer: only those we hold a key for.
export async function availableModels(userId: string | null): Promise<AiModelOption[]> {
  if (!userId) return [];
  if (process.env.AI_MOCK === "1") return [{ id: "mock", label: "Mock AI (testing)", provider: "Mock", vision: true, recommended: true }];
  const { recommended, extra } = await allModels(await resolveKeys(userId));
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

export type AiOptions = {
  userId: string; // whose keys, budget and usage this call counts against
  system?: string;
  temperature?: number;
  model?: string; // a picker id; anything else means Auto
  needsVision?: boolean;
  budgetMs?: number; // total time allowed across every model tried
  purpose?: string; // what it's for (mock replies, logs): "summary", "dedupe", "tutor", …
};

export const NO_KEY_MESSAGE = "Add a free AI key in Settings → AI keys to use this.";

export async function aiChat(messages: AiMessage[], opts: AiOptions): Promise<AiResult> {
  if (process.env.AI_MOCK === "1") {
    return { text: mockReply(opts.purpose ?? "", messages, opts.system ?? ""), modelId: "mock", modelLabel: "Mock AI" };
  }
  if ((await budgetLeft(opts.userId)) <= 0) {
    throw new AiError("You've used today's AI allowance. It resets at midnight, or raise it in Settings → AI keys.");
  }
  const set = await resolveKeys(opts.userId);
  const { recommended, extra } = await allModels(set);
  if (recommended.length === 0) throw new AiError(NO_KEY_MESSAGE);

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
  const deadline = Date.now() + Math.min(opts.budgetMs ?? TOTAL_BUDGET_MS, TOTAL_BUDGET_MS * 5);

  for (const model of ordered) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;

    const provider = PROVIDERS[model.provider];
    const name = displayName(model);
    if (set.source[model.provider] === "shared" && set.sharedBudgetLeft !== null && set.sharedBudgetLeft <= 0) continue;
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyFor(set, model.provider)}`,
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
        if (res.status === 401 || res.status === 403) await markKey(set, model.provider, "invalid");
        else if (res.status === 429) await markKey(set, model.provider, "rate_limited");
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const text = stripReasoning(data.choices?.[0]?.message?.content ?? "");
      await recordUsage(set, model.provider);
      if (set.sharedBudgetLeft !== null && set.source[model.provider] === "shared") set.sharedBudgetLeft--;
      if (text) {
        await markKey(set, model.provider, "working");
        return { text, modelId: model.id, modelLabel: name };
      }

      console.error(`AI: ${provider.name} ${model.apiModel} returned no content`);
      failures.push(`${name}: it returned an empty answer`);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      console.error(`AI: ${provider.name} ${model.apiModel} ${timedOut ? "timed out" : "request failed"}`);
      failures.push(`${name}: ${timedOut ? "it took too long" : "couldn't reach it"}`);
    }
  }

  const allLimited = failures.length > 0 && failures.every((f) => f.endsWith(reasonFor(429)));
  throw new AiError(
    allLimited
      ? "Every free AI model has hit its limit for now. Try again in a few minutes."
      : failures.length
        ? `No model could answer. ${failures.join("; ")}.`
        : "No model could answer in time. Try again.",
  );
}

// ---------------------------------------------------------------------------
// JSON answers
// ---------------------------------------------------------------------------

// Pulls a JSON object out of a model's reply: strips ```json fences and any
// chatter before or after the outermost { ... }.
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object");
  return JSON.parse(unfenced.slice(start, end + 1));
}

// Asks for a JSON object and checks it with `parse` (return null if it's not
// right). A bad reply gets one retry, on the same model, asking it to fix it.
export async function aiJson<T>(
  messages: AiMessage[],
  parse: (value: unknown) => T | null,
  opts: AiOptions,
): Promise<{ value: T; result: AiResult }> {
  const first = await aiChat(messages, { temperature: 0.2, ...opts });
  const tryParse = (text: string): T | null => {
    try {
      return parse(extractJson(text));
    } catch {
      return null;
    }
  };
  const value = tryParse(first.text);
  if (value !== null) return { value, result: first };

  console.error(`AI: ${first.modelLabel} sent JSON that didn't parse; retrying once`);
  const retry = await aiChat(
    [
      ...messages,
      { role: "assistant", content: first.text.slice(0, 20_000) },
      {
        role: "user",
        content: "That wasn't valid JSON in the shape asked for. Reply again with ONLY the JSON object, no other text.",
      },
    ],
    { temperature: 0, ...opts, model: first.modelId },
  );
  const fixed = tryParse(retry.text);
  if (fixed !== null) return { value: fixed, result: retry };
  throw new AiError(`${retry.modelLabel} didn't send its answer in the right format. Try again, or pick a different model.`);
}

// A message for the student from anything aiChat throws.
export function aiErrorMessage(err: unknown): string {
  return err instanceof AiError ? redactSecrets(err.message) : "Something went wrong reaching the AI. Try again.";
}

// Tells the student if the model that answered isn't the one they picked.
export function fallbackNote(picked: string | undefined, result: AiResult): string | undefined {
  if (!picked || picked === "auto" || picked === result.modelId) return undefined;
  return `Your picked model wasn't available for this, so ${result.modelLabel} answered instead.`;
}

// One entry point: `json` (a validator) asks for a JSON object back.
export async function callAI<T = string>(args: {
  userId: string;
  messages: AiMessage[];
  json?: (value: unknown) => T | null;
  purpose: string;
  system?: string;
  model?: string;
  temperature?: number;
  budgetMs?: number;
}): Promise<{ value: T; result: AiResult }> {
  const { messages, json, ...opts } = args;
  if (json) return aiJson(messages, json, opts);
  const result = await aiChat(messages, opts);
  return { value: result.text as unknown as T, result };
}
