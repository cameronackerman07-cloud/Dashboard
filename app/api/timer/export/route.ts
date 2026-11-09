import { NextResponse } from "next/server";
import { SESSION_COLUMNS } from "@/lib/study-sessions";
import { createClient, currentUserId } from "@/lib/supabase/server";

// Every study session for the signed-in user, as CSV or JSON.
export const dynamic = "force-dynamic";

const CSV_COLUMNS = ["started_at", "ended_at", "subject", "topic", "kind", "status", "source", "counted_seconds", "planned_seconds", "counts_as_external", "notes"] as const;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheet apps treating a value as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  if (!(await currentUserId())) return NextResponse.json({ ok: false }, { status: 401 });
  const db = await createClient();
  const { data } = await db.from("study_sessions").select(SESSION_COLUMNS).order("started_at", { ascending: true }).limit(20_000);
  const rows = (data ?? []) as Record<string, unknown>[];
  const format = new URL(request.url).searchParams.get("format");
  if (format === "json") {
    return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), sessions: rows }, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="study-sessions.json"' },
    });
  }
  const csv = [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c])).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="study-sessions.csv"' } });
}
