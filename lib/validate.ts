// Small input checks shared by server actions. Never trust what the browser sends.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// Trimmed text, cut to `max` characters. Empty becomes "".
export function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Trimmed text or null when empty.
export function optionalText(value: unknown, max: number): string | null {
  return text(value, max) || null;
}

// Whole number in a range, or the fallback.
export function int(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export type Reply = { ok: boolean; message: string };

export const SIGNED_OUT: Reply = { ok: false, message: "You've been signed out. Refresh the page and sign in again." };
export const SAVE_FAILED: Reply = { ok: false, message: "That couldn't be saved. Check your connection and try again." };
