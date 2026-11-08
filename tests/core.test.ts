import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRun } from "@/lib/agents/schedule";
import { sanitizeForAI } from "@/lib/agents/sanitize";
import { decryptSecret, encryptSecret, encryptToken, decryptToken } from "@/lib/crypto";
import { decide, DEFAULT_SETTINGS, inQuietHours } from "@/lib/push";
import { redactSecrets } from "@/lib/redact";
import { sydneyInstant } from "@/lib/time";

const syd = (day: string, time: string) => sydneyInstant(day, time);

test("daily schedule fires at 07:00 Sydney, across daylight saving", () => {
  // DST starts Sun 4 Oct 2026 (2am → 3am). 07:00 is +11 after, +10 before.
  const before = syd("2026-10-03", "08:00");
  assert.equal(new Date(nextRun({ type: "daily", at: "07:00" }, before)).toISOString(), "2026-10-03T20:00:00.000Z"); // Sun 4 Oct 07:00 AEDT
  // DST ends Sun 5 Apr 2026 (3am → 2am).
  const sat = syd("2026-04-04", "08:00");
  assert.equal(new Date(nextRun({ type: "daily", at: "07:00" }, sat)).toISOString(), "2026-04-04T21:00:00.000Z"); // Sun 5 Apr 07:00 AEST
});

test("weekly schedule picks the right weekday", () => {
  const monNoon = syd("2026-11-09", "12:00"); // a Monday
  const next = nextRun({ type: "weekly", day: "wed", at: "07:00" }, monNoon);
  assert.equal(next, syd("2026-11-11", "07:00"));
  const wedLate = syd("2026-11-11", "07:30");
  assert.equal(nextRun({ type: "weekly", day: "wed", at: "07:00" }, wedLate), syd("2026-11-18", "07:00"));
  assert.equal(nextRun({ type: "every", minutes: 120 }, 0), 7_200_000);
});

test("sanitizeForAI strips personal details", () => {
  const out = sanitizeForAI(
    "Cameron Ackerman (cam@example.com, 0412 345 678) id 3f2b1c4d-1111-2222-3333-444455556666 student 43218765 https://x.com/a?token=abc123 key AIzaSyA1234567890abcdefghijkLMNOP",
    { names: ["Cameron Ackerman"] },
  );
  for (const bad of ["Cameron", "Ackerman", "cam@example.com", "0412", "3f2b1c4d", "43218765", "token=abc123", "AIzaSy"]) assert.ok(!out.includes(bad), `${bad} leaked: ${out}`);
});

test("redactSecrets removes keys and bearer tokens", () => {
  const msg = redactSecrets("failed with gsk_abcdefghijklmnopqrstuvwx and Authorization: Bearer sk-or-v1-abcdef1234567890 and mysecretvalue", ["mysecretvalue"]);
  assert.ok(!/gsk_|sk-or-|mysecretvalue/.test(msg), msg);
});

test("encryption round-trips, uses fresh IVs, and decrypts with the previous key after rotation", () => {
  const k1 = Buffer.alloc(32, 1).toString("base64");
  const k2 = Buffer.alloc(32, 2).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY = k1;
  const a = encryptSecret("secret-value");
  const b = encryptSecret("secret-value");
  assert.notEqual(a.iv, b.iv);
  assert.equal(decryptSecret(a), "secret-value");
  const old = encryptToken("token");
  process.env.TOKEN_ENCRYPTION_KEY = k2;
  assert.throws(() => decryptSecret(a));
  process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = k1;
  assert.equal(decryptSecret(a), "secret-value");
  assert.equal(decryptToken(old), "token");
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
});

test("push respects quiet hours, categories and the daily cap", () => {
  assert.equal(inQuietHours("23:00", "22:00", "07:00"), true);
  assert.equal(inQuietHours("06:59", "22:00", "07:00"), true);
  assert.equal(inQuietHours("07:00", "22:00", "07:00"), false);
  const night = syd("2026-11-09", "23:30");
  const day = syd("2026-11-09", "12:00");
  assert.equal(decide(DEFAULT_SETTINGS, { category: "briefing" }, night).ok, false);
  assert.equal(decide(DEFAULT_SETTINGS, { category: "briefing" }, day).ok, true);
  assert.equal(decide({ ...DEFAULT_SETTINGS, allow_urgent_at_night: true }, { category: "alerts", importance: 5 }, night).ok, true);
  assert.equal(decide({ ...DEFAULT_SETTINGS, categories: { money: false } }, { category: "money" }, day).ok, false);
  assert.equal(decide({ ...DEFAULT_SETTINGS, sent_day: "2026-11-09", sent_count: 4 }, { category: "briefing" }, day).ok, false);
});
