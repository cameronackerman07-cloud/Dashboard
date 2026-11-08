"use server";

import { revalidatePath } from "next/cache";
import { keysStorageReady, readKey, removeKey, saveKey, setKeyStatus, type KeyProvider } from "@/lib/ai-keys";
import { redactSecrets } from "@/lib/redact";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";
import { int, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// Keys are written and read only here, on the server, for the signed-in user.
// Nothing secret is ever returned to the browser.

const PROVIDERS: KeyProvider[] = ["gemini", "groq", "openrouter", "mistral", "adzuna"];
const TESTS_PER_HOUR = 10;

function isProvider(v: unknown): v is KeyProvider {
  return typeof v === "string" && (PROVIDERS as string[]).includes(v);
}

const NOT_READY: Reply = {
  ok: false,
  message: "Saving keys is switched off: TOKEN_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY isn't set in Vercel yet.",
};

export async function saveApiKey(provider: string, raw: string, appId?: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isProvider(provider)) return SAVE_FAILED;
  if (!keysStorageReady()) return NOT_READY;
  const key = String(raw ?? "").trim();
  if (key.length < 10 || key.length > 300 || /\s/.test(key)) return { ok: false, message: "That doesn't look like a key. Copy it again and paste the whole thing." };
  let secret = key;
  if (provider === "adzuna") {
    const id = String(appId ?? "").trim();
    if (!/^[0-9a-f]{6,20}$/i.test(id)) return { ok: false, message: "Paste your Adzuna app ID too (a short code of letters and numbers)." };
    secret = JSON.stringify({ app_id: id, app_key: key });
  }
  try {
    await saveKey(userId, provider, secret);
  } catch (err) {
    console.error(`AI keys: save failed: ${redactSecrets(err, [key])}`);
    return SAVE_FAILED;
  }
  revalidatePath("/settings/ai-keys");
  return { ok: true, message: "Saved. Press Test to check it works." };
}

export async function removeApiKey(provider: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isProvider(provider) || !keysStorageReady()) return SAVE_FAILED;
  await removeKey(userId, provider);
  revalidatePath("/settings/ai-keys");
  return { ok: true, message: "Removed. You can also delete the key on the provider's website." };
}

// At most 10 tests an hour per user, counted in ai_usage.
async function allowTest(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const day = dayKey(Date.now());
  const name = `keytest-${new Date().getUTCHours()}`;
  const { data } = await db.from("ai_usage").select("calls").eq("user_id", userId).eq("day", day).eq("provider", name).maybeSingle();
  const calls = (data?.calls as number) ?? 0;
  if (calls >= TESTS_PER_HOUR) return false;
  await db.from("ai_usage").upsert({ user_id: userId, day, provider: name, calls: calls + 1 }, { onConflict: "user_id,day,provider" });
  return true;
}

const TEST_URL: Record<Exclude<KeyProvider, "adzuna">, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  groq: "https://api.groq.com/openai/v1/models",
  openrouter: "https://openrouter.ai/api/v1/key",
  mistral: "https://api.mistral.ai/v1/models",
};

// The cheapest real call: list models (or OpenRouter's key check). No tokens used.
export async function testApiKey(provider: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isProvider(provider) || !keysStorageReady()) return NOT_READY;
  if (!(await allowTest(userId))) return { ok: false, message: "That's 10 tests this hour. Try again later." };

  let secret: string | null;
  try {
    secret = await readKey(userId, provider);
  } catch {
    return { ok: false, message: "This key can't be read any more (the encryption key changed). Remove it and paste it again." };
  }
  if (!secret) return { ok: false, message: "Save a key first." };

  let res: Response;
  try {
    if (provider === "adzuna") {
      const { app_id, app_key } = JSON.parse(secret) as { app_id: string; app_key: string };
      const url = `https://api.adzuna.com/v1/api/jobs/au/search/1?app_id=${encodeURIComponent(app_id)}&app_key=${encodeURIComponent(app_key)}&results_per_page=1`;
      res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    } else {
      res = await fetch(TEST_URL[provider], { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    }
  } catch {
    return { ok: false, message: "Couldn't reach the provider (a network problem). Try again in a minute." };
  }

  if (res.status === 401 || res.status === 403) {
    await setKeyStatus(userId, provider, "invalid");
    revalidatePath("/settings/ai-keys");
    return { ok: false, message: "The provider says this key isn't valid. Check you copied all of it, or make a new one." };
  }
  if (res.status === 429) {
    await setKeyStatus(userId, provider, "rate_limited");
    revalidatePath("/settings/ai-keys");
    return { ok: true, message: "The key is valid, but its free limit is used up for now. It'll work again when the limit resets." };
  }
  if (!res.ok) return { ok: false, message: `The provider had a problem (error ${res.status}). Try again later.` };
  await setKeyStatus(userId, provider, "working");
  revalidatePath("/settings/ai-keys");
  return { ok: true, message: "It works." };
}

export async function saveAiBudget(value: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const budget = int(value, 0, 500, -1);
  if (budget < 0) return { ok: false, message: "Enter a number of AI calls per day, like 30." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ai_daily_budget: budget, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return SAVE_FAILED;
  revalidatePath("/settings/ai-keys");
  return { ok: true, message: `Daily limit set to ${budget} AI calls.` };
}
