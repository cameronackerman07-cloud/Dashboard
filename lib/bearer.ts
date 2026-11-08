import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time check of "Authorization: Bearer <secret>".
export function bearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
