// Scrubs secrets out of any text before it's logged, stored or shown: known key
// values passed in, plus anything shaped like an API key or bearer token.

const PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g, // Google
  /gsk_[0-9A-Za-z]{20,}/g, // Groq
  /sk-or-[0-9A-Za-z-]{10,}/g, // OpenRouter
  /sk-[0-9A-Za-z_-]{20,}/g, // generic "sk-" keys
  /csk-[0-9A-Za-z]{20,}/g, // Cerebras
  /ya29\.[0-9A-Za-z._-]{10,}/g, // Google access tokens
  /1\/\/[0-9A-Za-z_-]{20,}/g, // Google refresh tokens
  /(bearer|token|key|secret|authorization)(["'\s:=]+)[0-9A-Za-z._~+/-]{16,}/gi,
  /\b[0-9A-Za-z_-]{40,}\b/g, // any very long opaque string
];

export function redactSecrets(text: unknown, known: (string | null | undefined)[] = []): string {
  let out = typeof text === "string" ? text : text instanceof Error ? text.message : String(text ?? "");
  for (const k of known) {
    if (k && k.length >= 6) out = out.split(k).join("[redacted]");
  }
  for (const re of PATTERNS) {
    out = out.replace(re, (match, label?: string, sep?: string) =>
      label && sep !== undefined && typeof label === "string" && /^(bearer|token|key|secret|authorization)$/i.test(label) ? `${label}${sep}[redacted]` : "[redacted]",
    );
  }
  return out.slice(0, 500);
}
