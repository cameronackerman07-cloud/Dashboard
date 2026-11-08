import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dedupeUser } from "@/lib/dedupe";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Daily duplicate check for every user's flashcards. Vercel Cron calls this
// (see vercel.json) with "Authorization: Bearer <CRON_SECRET>"; anything else
// is refused. Users are done one at a time; one failing doesn't stop the rest.
// Logs counts only, never card text.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 55_000;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY isn't set" }, { status: 503 });

  const deadline = Date.now() + BUDGET_MS;
  const admin = createAdminClient();

  // Only users with cards that haven't been checked yet.
  const { data, error } = await admin
    .from("flashcards")
    .select("user_id")
    .is("deduped_at", null)
    .is("duplicate_of", null)
    .limit(10000);
  if (error) return NextResponse.json({ ok: false, error: "couldn't list cards" }, { status: 500 });
  const users: string[] = [...new Set<string>((data ?? []).map((r: { user_id: string }) => r.user_id))];

  const totals = { users: 0, subjects: 0, checked: 0, exact: 0, similar: 0, failedBatches: 0, failedUsers: 0, leftForTomorrow: 0 };
  for (const userId of users) {
    if (Date.now() > deadline - 8_000) {
      totals.leftForTomorrow++;
      continue;
    }
    try {
      const s = await dedupeUser(admin, userId, { deadline });
      totals.users++;
      totals.subjects += s.subjects;
      totals.checked += s.checked;
      totals.exact += s.exact;
      totals.similar += s.similar;
      totals.failedBatches += s.failed;
    } catch {
      totals.failedUsers++;
    }
  }

  console.log(`Flashcard dedupe: ${JSON.stringify(totals)}`);
  return NextResponse.json({ ok: true, ...totals });
}
