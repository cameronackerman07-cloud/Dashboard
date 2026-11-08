import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM encryption for secrets (AI keys, OAuth refresh tokens, Canvas
// tokens, calendar links) before they're stored in Supabase. Decryption happens
// ONLY on the server: the `server-only` import makes importing this file into
// client code a build error.
//
// TOKEN_ENCRYPTION_KEY: 32 random bytes, base64. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Keep a copy in a password manager: if it's lost, everything encrypted with it
// is unreadable.
//
// Rotation: move the old key to TOKEN_ENCRYPTION_KEY_PREVIOUS, set a new
// TOKEN_ENCRYPTION_KEY, then run `npm run reencrypt`. Old rows still decrypt
// with the previous key until they're re-encrypted.

const IV_BYTES = 12;
const TAG_BYTES = 16;
export const KEY_VERSION = 2; // bump when TOKEN_ENCRYPTION_KEY is rotated

function parseKey(raw: string | undefined, name: string): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return key;
}

function currentKey(): Buffer {
  const key = parseKey(process.env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return key;
}

function candidateKeys(): Buffer[] {
  const keys = [currentKey()];
  const prev = parseKey(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS, "TOKEN_ENCRYPTION_KEY_PREVIOUS");
  if (prev) keys.push(prev);
  return keys;
}

export function encryptionConfigured(): boolean {
  try {
    currentKey();
    return true;
  } catch {
    return false;
  }
}

// ---- Separate fields (user_api_keys, oauth_connections) --------------------

export type Sealed = { ciphertext: string; iv: string; auth_tag: string; key_version: number };

export function encryptSecret(plaintext: string): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    key_version: KEY_VERSION,
  };
}

export function decryptSecret(sealed: Pick<Sealed, "ciphertext" | "iv" | "auth_tag">): string {
  const iv = Buffer.from(sealed.iv, "base64");
  const tag = Buffer.from(sealed.auth_tag, "base64");
  const data = Buffer.from(sealed.ciphertext, "base64");
  for (const key of candidateKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      /* try the previous key */
    }
  }
  throw new Error("Couldn't decrypt a saved secret (wrong or missing TOKEN_ENCRYPTION_KEY)");
}

// ---- Single string (older connections rows): base64( iv | tag | ciphertext ) ---

export function encryptToken(plaintext: string): string {
  const s = encryptSecret(plaintext);
  return Buffer.concat([Buffer.from(s.iv, "base64"), Buffer.from(s.auth_tag, "base64"), Buffer.from(s.ciphertext, "base64")]).toString("base64");
}

export function decryptToken(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error("Encrypted token is malformed");
  return decryptSecret({
    iv: buf.subarray(0, IV_BYTES).toString("base64"),
    auth_tag: buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES).toString("base64"),
    ciphertext: buf.subarray(IV_BYTES + TAG_BYTES).toString("base64"),
  });
}
