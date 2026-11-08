import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// OAuth "state" for Google and Spotify: a random value kept in an httpOnly,
// SameSite=Lax cookie and tied to the signed-in user, checked on the way back.

const COOKIE = "oauth_state";
const MAX_AGE = 10 * 60;

export type OAuthState = {
  state: string;
  userId: string;
  provider: "google" | "spotify";
  label?: string;
  scopes?: string[];
  verifier?: string; // PKCE (Spotify)
  returnTo: string;
};

// Only these pages can be returned to after connecting (no open redirects).
const RETURN_PATHS = ["/settings", "/settings/connections", "/calendar", "/"];
export function safeReturn(path: unknown): string {
  return typeof path === "string" && RETURN_PATHS.includes(path) ? path : "/settings";
}

export function siteUrl(request: Request): string {
  const env = process.env.SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

export async function startState(s: Omit<OAuthState, "state">): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const sealed = encryptSecret(JSON.stringify({ ...s, state }));
  const store = await cookies();
  store.set(COOKIE, `${sealed.iv}.${sealed.auth_tag}.${sealed.ciphertext}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: MAX_AGE,
  });
  return state;
}

// Reads and clears the cookie; null unless the state and user both match.
export async function finishState(state: string | null, userId: string): Promise<OAuthState | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  store.delete({ name: COOKIE, path: "/api" });
  return checkState(raw, state, userId);
}

export function checkState(raw: string | undefined, state: string | null, userId: string): OAuthState | null {
  if (!raw || !state) return null;
  try {
    const [iv, auth_tag, ciphertext] = raw.split(".");
    const parsed = JSON.parse(decryptSecret({ iv, auth_tag, ciphertext })) as OAuthState;
    const a = createHash("sha256").update(parsed.state).digest("hex");
    const b = createHash("sha256").update(state).digest("hex");
    return a === b && parsed.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
