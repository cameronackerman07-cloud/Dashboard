import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { encryptSecret } from "@/lib/crypto";
import { hashToken, newToken, sameHash } from "@/lib/device-tokens";
import { checkState, pkcePair, safeReturn } from "@/lib/oauth";
import { assertPublicHost, isPrivateAddress, SafeFetchError } from "@/lib/safe-fetch";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("safe-fetch: private, loopback, link-local and metadata addresses are blocked", () => {
  for (const a of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::", "::1", "fd00::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"]) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:808:808"]) {
    assert.equal(isPrivateAddress(a), false, a);
  }
});

test("safe-fetch: links to IP addresses, localhost and internal names are refused before any lookup", async () => {
  for (const u of ["https://127.0.0.1/x", "https://[::1]/", "https://169.254.169.254/latest/meta-data", "https://localhost:3000/", "https://printer.local/", "https://metadata.google.internal/"]) {
    await assert.rejects(assertPublicHost(new URL(u)), SafeFetchError, u);
  }
});

test("OAuth state: only the matching state for the same user is accepted", () => {
  const s = { state: "abc123", userId: "user-1", provider: "google" as const, returnTo: "/settings" };
  const sealed = encryptSecret(JSON.stringify(s));
  const raw = `${sealed.iv}.${sealed.auth_tag}.${sealed.ciphertext}`;
  assert.equal(checkState(raw, "abc123", "user-1")?.provider, "google");
  assert.equal(checkState(raw, "abc124", "user-1"), null);
  assert.equal(checkState(raw, "abc123", "user-2"), null);
  assert.equal(checkState(raw, null, "user-1"), null);
  assert.equal(checkState(undefined, "abc123", "user-1"), null);
  assert.equal(checkState(`${sealed.iv}.${sealed.auth_tag}.${sealed.ciphertext.slice(0, -2)}AA`, "abc123", "user-1"), null);
  assert.equal(checkState("not-a-cookie", "abc123", "user-1"), null);
});

test("OAuth: return paths are allowlisted and PKCE challenge matches the verifier", () => {
  assert.equal(safeReturn("/calendar"), "/calendar");
  for (const bad of ["https://evil.example", "//evil.example", "/settings/../admin", 42, undefined]) assert.equal(safeReturn(bad), "/settings");
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43);
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), challenge);
});

test("device tokens: only the hash is kept and hashes compare safely", () => {
  const { token, hash } = newToken("siri");
  assert.ok(!hash.includes(token));
  assert.equal(hashToken(token), hash);
  assert.equal(sameHash(hash, hashToken(token)), true);
  assert.equal(sameHash(hash, hashToken(`${token}x`)), false);
});

// The browser uses the publishable (anon/authenticated) key. These tables hold
// secrets, so they must have RLS on, no policies, and no grants to those roles.
const sql = ["schema.sql", "agents.sql"].map((f) => fs.readFileSync(path.join(root, "supabase", f), "utf8")).join("\n");

test("browser client can't read user_api_keys or oauth_connections", () => {
  for (const t of ["user_api_keys", "oauth_connections"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.doesNotMatch(sql, new RegExp(`create policy[^;]*on public\\.${t}\\b`, "i"), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated`), t);
  }
});

test("every table has row level security turned on", () => {
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length > 20);
  for (const t of tables) {
    const direct = new RegExp(`alter table public\\.${t} enable row level security`).test(sql);
    const listed = new RegExp(`'${t}'`).test(sql) && /enable row level security/.test(sql);
    assert.ok(direct || listed, `${t} has no RLS line`);
  }
});

test("no browser code touches the secret tables or the service-role client", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  ["app", "components", "lib"].forEach((d) => walk(path.join(root, d)));
  const client = files.filter((f) => /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));
  assert.ok(client.length > 5);
  for (const f of client) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /from\(["'](user_api_keys|oauth_connections)|process\.env\.SUPABASE_SERVICE_ROLE|supabase\/admin/, path.relative(root, f));
  }
});
