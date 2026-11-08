// Free AI tiers may train on prompts, so everything sent to a model goes through
// this first: no emails, phone numbers, tokens in URLs, IDs, keys or the user's name.
import { redactSecrets } from "@/lib/redact";

export function sanitizeForAI(text: string, opts: { names?: (string | null | undefined)[] } = {}): string {
  let out = String(text ?? "");
  out = out.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]");
  out = out.replace(/(\+?61[\s-]?|\b0)[2-478](?:[\s-]?\d){8}\b/g, "[phone]");
  out = out.replace(/\+\d{1,3}[\s-]?\d[\d\s-]{7,}\d/g, "[phone]");
  // URLs carrying tokens or keys in the query string.
  out = out.replace(/https?:\/\/[^\s"'<>]+[?&](token|key|access_token|auth|sig|signature|code|secret)=[^\s"'<>]+/gi, "[link]");
  // UUIDs and long numeric IDs (student numbers etc.).
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]");
  out = out.replace(/\b\d{7,}\b/g, "[number]");
  for (const name of opts.names ?? []) {
    for (const part of String(name ?? "").split(/\s+/).filter((p) => p.length >= 3)) {
      out = out.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
    }
  }
  // Keys and tokens (redactSecrets also trims to 500 chars, so do it per line).
  return out
    .split("\n")
    .map((line) => (line.length > 400 ? line : redactSecrets(line)))
    .join("\n");
}
