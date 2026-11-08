import "server-only";
import { decryptSecret, encryptionConfigured, encryptSecret } from "@/lib/crypto";
import { redactSecrets } from "@/lib/redact";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";

// Each user's own AI keys. Stored encrypted in user_api_keys, which the browser
// can't read (RLS on, no policies). Everything here runs on the server with the
// service-role client and ALWAYS filters by the user_id it was given. Keys are
// decrypted just before a call and never returned to the browser.

export type ProviderId = "gemini" | "groq" | "openrouter" | "mistral" | "cerebras";
export type KeyProvider = "gemini" | "groq" | "openrouter" | "mistral" | "adzuna";
export const USER_PROVIDERS: Exclude<KeyProvider, "adzuna">[] = ["gemini", "groq", "openrouter", "mistral"];
export type KeyStatus = "unchecked" | "working" | "invalid" | "rate_limited";

export type KeyMeta = {
  provider: KeyProvider;
  last4: string | null;
  status: KeyStatus;
  lastCheckedAt: string | null;
  lastUsedAt: string | null;
};

// The keys one AI request may use, and where each came from.
export type KeySet = {
  userId: string;
  keys: Partial<Record<ProviderId, string>>;
  source: Partial<Record<ProviderId, "user" | "shared">>;
  sharedBudgetLeft: number | null; // null = unlimited
};

const ENV_KEYS: Record<ProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
};

const RATE_LIMIT_PAUSE_MS = 10 * 60 * 1000;
const SHARED_LIMITED_PER_DAY = 10;
export const DEFAULT_AI_BUDGET = 30;

export function keysStorageReady(): boolean {
  return adminConfigured() && encryptionConfigured();
}

function sharedMode(): "off" | "limited" | "on" {
  const v = (process.env.SHARED_AI_FOR_FRIENDS ?? "off").toLowerCase();
  return v === "on" || v === "limited" ? v : "off";
}

// The signed-in user's email (cheap, from the session) or, in background jobs,
// from the admin API. Only used to recognise the owner.
async function emailOf(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user?.id === userId) return data.user.email ?? null;
  } catch {
    /* no request (a cron job) */
  }
  if (!adminConfigured()) return null;
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function isOwner(userId: string): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  return (await emailOf(userId))?.toLowerCase() === owner;
}

function envKeys(): Partial<Record<ProviderId, string>> {
  const out: Partial<Record<ProviderId, string>> = {};
  for (const p of Object.keys(ENV_KEYS) as ProviderId[]) {
    const v = process.env[ENV_KEYS[p]];
    if (v) out[p] = v;
  }
  return out;
}

export function anySharedKey(): boolean {
  return Object.keys(envKeys()).length > 0;
}

async function usageToday(userId: string): Promise<{ total: number; shared: number }> {
  if (!adminConfigured()) return { total: 0, shared: 0 };
  const { data } = await createAdminClient()
    .from("ai_usage")
    .select("provider, calls")
    .eq("user_id", userId)
    .eq("day", dayKey(Date.now()));
  let total = 0;
  let shared = 0;
  for (const r of (data ?? []) as { provider: string; calls: number }[]) {
    total += r.calls;
    if (r.provider.startsWith("shared-")) shared += r.calls;
  }
  return { total, shared };
}

export async function dailyBudget(userId: string): Promise<number> {
  if (!adminConfigured()) return DEFAULT_AI_BUDGET;
  const { data } = await createAdminClient().from("user_settings").select("ai_daily_budget").eq("user_id", userId).maybeSingle();
  return (data?.ai_daily_budget as number | undefined) ?? DEFAULT_AI_BUDGET;
}

// How many AI calls are left today for this user (their soft cap).
export async function budgetLeft(userId: string): Promise<number> {
  const [{ total }, budget] = await Promise.all([usageToday(userId), dailyBudget(userId)]);
  return Math.max(0, budget - total);
}

// Builds the key set for one user: their own keys first; the site's keys only
// as SHARED_AI_FOR_FRIENDS allows (off: owner only; limited: 10 a day; on: all).
export async function resolveKeys(userId: string): Promise<KeySet> {
  const set: KeySet = { userId, keys: {}, source: {}, sharedBudgetLeft: null };

  if (keysStorageReady()) {
    const { data } = await createAdminClient()
      .from("user_api_keys")
      .select("provider, ciphertext, iv, auth_tag, status, last_checked_at")
      .eq("user_id", userId)
      .in("provider", USER_PROVIDERS);
    for (const row of (data ?? []) as {
      provider: ProviderId;
      ciphertext: string;
      iv: string;
      auth_tag: string;
      status: KeyStatus;
      last_checked_at: string | null;
    }[]) {
      if (row.status === "invalid") continue;
      if (row.status === "rate_limited" && row.last_checked_at && Date.now() - new Date(row.last_checked_at).getTime() < RATE_LIMIT_PAUSE_MS) continue;
      try {
        set.keys[row.provider] = decryptSecret(row);
        set.source[row.provider] = "user";
      } catch {
        console.error("AI keys: a saved key couldn't be decrypted");
      }
    }
  }

  const mode = sharedMode();
  const owner = await isOwner(userId);
  if (owner || mode !== "off") {
    if (!owner && mode === "limited") {
      const { shared } = await usageToday(userId);
      set.sharedBudgetLeft = Math.max(0, SHARED_LIMITED_PER_DAY - shared);
    }
    if (set.sharedBudgetLeft !== 0) {
      for (const [p, key] of Object.entries(envKeys()) as [ProviderId, string][]) {
        if (!set.keys[p]) {
          set.keys[p] = key;
          set.source[p] = "shared";
        }
      }
    }
  }
  return set;
}

export async function hasUsableKey(userId: string): Promise<boolean> {
  if (process.env.AI_MOCK === "1") return true;
  const set = await resolveKeys(userId);
  return Object.keys(set.keys).length > 0;
}

export async function recordUsage(set: KeySet, provider: ProviderId): Promise<void> {
  if (!adminConfigured()) return;
  const db = createAdminClient();
  const day = dayKey(Date.now());
  const name = set.source[provider] === "shared" ? `shared-${provider}` : provider;
  const { data } = await db.from("ai_usage").select("calls").eq("user_id", set.userId).eq("day", day).eq("provider", name).maybeSingle();
  await db.from("ai_usage").upsert({ user_id: set.userId, day, provider: name, calls: ((data?.calls as number) ?? 0) + 1 }, { onConflict: "user_id,day,provider" });
}

// After a call with the user's own key: remember whether it worked.
export async function markKey(set: KeySet, provider: ProviderId, status: KeyStatus): Promise<void> {
  if (set.source[provider] !== "user" || !keysStorageReady()) return;
  const now = new Date().toISOString();
  await createAdminClient()
    .from("user_api_keys")
    .update(status === "working" ? { status, last_used_at: now, last_checked_at: now } : { status, last_checked_at: now })
    .eq("user_id", set.userId)
    .eq("provider", provider);
}

// ---- Settings page helpers -------------------------------------------------

export async function listKeyMeta(userId: string): Promise<KeyMeta[]> {
  if (!keysStorageReady()) return [];
  const { data } = await createAdminClient()
    .from("user_api_keys")
    .select("provider, last4, status, last_checked_at, last_used_at")
    .eq("user_id", userId);
  return ((data ?? []) as { provider: KeyProvider; last4: string | null; status: KeyStatus; last_checked_at: string | null; last_used_at: string | null }[]).map((r) => ({
    provider: r.provider,
    last4: r.last4,
    status: r.status,
    lastCheckedAt: r.last_checked_at,
    lastUsedAt: r.last_used_at,
  }));
}

export async function saveKey(userId: string, provider: KeyProvider, secret: string): Promise<void> {
  const sealed = encryptSecret(secret);
  const last4 = provider === "adzuna" ? null : secret.slice(-4);
  const { error } = await createAdminClient()
    .from("user_api_keys")
    .upsert(
      { user_id: userId, provider, ...sealed, last4, status: "unchecked", last_checked_at: null, last_used_at: null },
      { onConflict: "user_id,provider" },
    );
  if (error) throw new Error(redactSecrets(error.message, [secret]));
}

export async function removeKey(userId: string, provider: KeyProvider): Promise<void> {
  await createAdminClient().from("user_api_keys").delete().eq("user_id", userId).eq("provider", provider);
}

export async function readKey(userId: string, provider: KeyProvider): Promise<string | null> {
  if (!keysStorageReady()) return null;
  const { data } = await createAdminClient()
    .from("user_api_keys")
    .select("ciphertext, iv, auth_tag")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  return decryptSecret(data as { ciphertext: string; iv: string; auth_tag: string });
}

export async function setKeyStatus(userId: string, provider: KeyProvider, status: KeyStatus): Promise<void> {
  await createAdminClient()
    .from("user_api_keys")
    .update({ status, last_checked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", provider);
}
