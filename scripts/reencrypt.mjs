// Re-encrypts every saved secret with the current TOKEN_ENCRYPTION_KEY after a
// rotation. Run with the env vars set (e.g. in .env.local):
//   TOKEN_ENCRYPTION_KEY=new  TOKEN_ENCRYPTION_KEY_PREVIOUS=old  npm run reencrypt
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Prints counts only.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const KEY_VERSION = 2;
const key = (v) => (v ? Buffer.from(v, "base64") : null);
const current = key(process.env.TOKEN_ENCRYPTION_KEY);
const previous = key(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS);
if (!current || current.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64");

function decrypt({ ciphertext, iv, auth_tag }) {
  for (const k of [current, previous].filter(Boolean)) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(auth_tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(ciphertext, "base64")), d.final()]).toString("utf8");
    } catch {}
  }
  throw new Error("undecryptable");
}
function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", current, iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), auth_tag: c.getAuthTag().toString("base64"), key_version: KEY_VERSION };
}
const split = (s) => {
  const b = Buffer.from(s, "base64");
  return { iv: b.subarray(0, 12).toString("base64"), auth_tag: b.subarray(12, 28).toString("base64"), ciphertext: b.subarray(28).toString("base64") };
};
const join = (e) => Buffer.concat([Buffer.from(e.iv, "base64"), Buffer.from(e.auth_tag, "base64"), Buffer.from(e.ciphertext, "base64")]).toString("base64");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let done = 0, failed = 0;
for (const table of ["user_api_keys", "oauth_connections"]) {
  const { data, error } = await db.from(table).select("id, ciphertext, iv, auth_tag");
  if (error) { console.log(`${table}: skipped (${error.code ?? "missing"})`); continue; }
  for (const row of data) {
    try { await db.from(table).update(encrypt(decrypt(row))).eq("id", row.id); done++; } catch { failed++; }
  }
}
const { data: conns } = await db.from("connections").select("id, encrypted_token").not("encrypted_token", "is", null);
for (const row of conns ?? []) {
  try { await db.from("connections").update({ encrypted_token: join(encrypt(decrypt(split(row.encrypted_token)))) }).eq("id", row.id); done++; } catch { failed++; }
}
console.log(`Re-encrypted ${done} secrets, ${failed} couldn't be read.`);
