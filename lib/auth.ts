import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Shared checks for the sign-in and sign-up routes.

export const MIN_PASSWORD = 8;
export const MAX_NAME = 40;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
}

// True when no INVITE_CODE is set, or the code matches. Compared in constant
// time so the code can't be guessed a letter at a time.
export function inviteOk(value: unknown): boolean {
  const expected = process.env.INVITE_CODE?.trim();
  if (!expected) return true;
  const given = typeof value === "string" ? value.trim() : "";
  const a = createHash("sha256").update(given.toLowerCase()).digest();
  const b = createHash("sha256").update(expected.toLowerCase()).digest();
  return timingSafeEqual(a, b);
}

export function inviteRequired(): boolean {
  return !!process.env.INVITE_CODE?.trim();
}

// Initials for the sidebar avatar: "Cameron Ackerman" → "CA", "sam" → "S".
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts[parts.length - 1][0]];
  return letters.join("").toUpperCase();
}
