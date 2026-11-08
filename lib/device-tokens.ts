import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Tokens for Siri Shortcuts and the Apple Calendar feed. Shown once, stored only
// as a SHA-256 hash, checked in constant time, and revocable per device.

export function newToken(prefix: string): { token: string; hash: string } {
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

// Small in-memory limit per token: 30 calls a minute per server instance.
const hits = new Map<string, number[]>();
export function rateLimited(key: string, perMinute = 30): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > perMinute;
}

export type TokenUser = { userId: string; scope: "read" | "write"; tokenId: string };

// Checks "Authorization: Bearer <token>" (never a token in the URL).
export async function verifyDeviceToken(request: Request): Promise<TokenUser | null> {
  if (!adminConfigured()) return null;
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(dash_[A-Za-z0-9_-]{20,})$/.exec(header.trim());
  if (!m) return null;
  const hash = hashToken(m[1]);
  const db = createAdminClient();
  const { data } = await db.from("device_tokens").select("id, user_id, scope, token_hash, revoked_at").eq("token_hash", hash).maybeSingle();
  if (!data || data.revoked_at || !sameHash(data.token_hash as string, hash)) return null;
  await db.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", data.user_id);
  return { userId: data.user_id as string, scope: data.scope as "read" | "write", tokenId: data.id as string };
}

export async function userForCalendarToken(token: string): Promise<string | null> {
  if (!adminConfigured() || !/^cal_[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const hash = hashToken(token);
  const { data } = await createAdminClient().from("calendar_tokens").select("user_id, token_hash").eq("token_hash", hash).maybeSingle();
  return data && sameHash(data.token_hash as string, hash) ? (data.user_id as string) : null;
}
