// Money is stored as whole cents (integers) so it never picks up rounding errors.

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

// 123450 → "$1,234.50"
export function formatCents(cents: number): string {
  return AUD.format(cents / 100);
}

// "12.5", "$12.50", "1,200" → cents, or null if it isn't a sensible amount.
export function parseDollars(value: unknown, { allowZero = false } = {}): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) return null; // $1 million cap
  if (cents === 0 && !allowZero) return null;
  return cents;
}

// cents → "12.50" for an input's default value.
export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
