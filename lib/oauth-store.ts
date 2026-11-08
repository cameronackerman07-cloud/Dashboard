import "server-only";
import { decryptSecret, encryptionConfigured, encryptSecret } from "@/lib/crypto";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Server-only access to oauth_connections (the browser can't read it). Every
// query is scoped by user_id. Refresh tokens are decrypted only for a call.

export type OAuthProvider = "google" | "spotify";
export type ConnStatus = "active" | "needs_reconnect" | "blocked";
export type ConnMeta = {
  id: string;
  provider: OAuthProvider;
  label: string;
  accountHint: string | null;
  scopes: string[];
  status: ConnStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
};
export type ConnRow = ConnMeta & { refreshToken: string; cached: Record<string, unknown> };

export function oauthStorageReady(): boolean {
  return adminConfigured() && encryptionConfigured();
}

type Raw = {
  id: string;
  provider: OAuthProvider;
  label: string;
  account_hint: string | null;
  scopes: string[];
  status: ConnStatus;
  last_error: string | null;
  last_synced_at: string | null;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  cached: Record<string, unknown> | null;
};

const meta = (r: Raw): ConnMeta => ({
  id: r.id,
  provider: r.provider,
  label: r.label,
  accountHint: r.account_hint,
  scopes: r.scopes ?? [],
  status: r.status,
  lastError: r.last_error,
  lastSyncedAt: r.last_synced_at,
});

export async function listConnections(userId: string, provider?: OAuthProvider): Promise<ConnMeta[]> {
  if (!oauthStorageReady()) return [];
  let q = createAdminClient()
    .from("oauth_connections")
    .select("id, provider, label, account_hint, scopes, status, last_error, last_synced_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (provider) q = q.eq("provider", provider);
  const { data } = await q;
  return ((data ?? []) as Raw[]).map(meta);
}

export async function getConnections(userId: string, provider: OAuthProvider): Promise<ConnRow[]> {
  if (!oauthStorageReady()) return [];
  const { data } = await createAdminClient().from("oauth_connections").select("*").eq("user_id", userId).eq("provider", provider);
  const out: ConnRow[] = [];
  for (const r of (data ?? []) as Raw[]) {
    try {
      out.push({ ...meta(r), refreshToken: decryptSecret(r), cached: r.cached ?? {} });
    } catch {
      /* unreadable after a key change: skip */
    }
  }
  return out;
}

export async function saveConnection(
  userId: string,
  c: { provider: OAuthProvider; label: string; accountHint: string | null; scopes: string[]; refreshToken: string },
): Promise<void> {
  const db = createAdminClient();
  const sealed = encryptSecret(c.refreshToken);
  // Same account connected again: replace it rather than duplicate it.
  if (c.accountHint) await db.from("oauth_connections").delete().eq("user_id", userId).eq("provider", c.provider).eq("account_hint", c.accountHint);
  if (c.provider === "spotify") await db.from("oauth_connections").delete().eq("user_id", userId).eq("provider", "spotify");
  await db.from("oauth_connections").insert({
    user_id: userId,
    provider: c.provider,
    label: c.label.slice(0, 40),
    account_hint: c.accountHint?.slice(0, 200) ?? null,
    scopes: c.scopes,
    ...sealed,
    status: "active",
  });
}

export async function updateConnection(userId: string, id: string, patch: Partial<{ status: ConnStatus; last_error: string | null; last_synced_at: string; cached: Record<string, unknown> }>) {
  await createAdminClient().from("oauth_connections").update(patch).eq("user_id", userId).eq("id", id);
}

export async function deleteConnection(userId: string, id: string): Promise<ConnRow | null> {
  const db = createAdminClient();
  const { data } = await db.from("oauth_connections").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (!data) return null;
  let row: ConnRow | null = null;
  try {
    row = { ...meta(data as Raw), refreshToken: decryptSecret(data as Raw), cached: {} };
  } catch {
    /* still delete */
  }
  await db.from("oauth_connections").delete().eq("user_id", userId).eq("id", id);
  return row;
}
