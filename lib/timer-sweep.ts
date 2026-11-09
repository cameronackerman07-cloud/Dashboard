import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { applySweep, SESSION_COLUMNS } from "@/lib/study-sessions";
import { plannedEnd, type StudySession } from "@/lib/study-time";

// Sends "Time's up" pushes for running timers that reached zero, and closes
// forgotten ones. Called by /api/timer/sweep (every minute if pg_cron is set
// up) and by the 30-minute agents tick. Service-role client; every write is
// scoped by user_id.
export async function sweepTimers(db: SupabaseClient, now = Date.now()): Promise<{ alerted: number; closed: number }> {
  const { data } = await db.from("study_sessions").select(`${SESSION_COLUMNS}, user_id, alerted_at`).in("status", ["running", "paused"]).limit(2000);
  let alerted = 0;
  let closed = 0;
  for (const row of (data ?? []) as (StudySession & { user_id: string; alerted_at: string | null })[]) {
    if (await applySweep(db, row.user_id, row, now)) {
      closed++;
      continue;
    }
    if (row.status === "running" && !row.alerted_at && now >= plannedEnd(row)) {
      // Mark first so two sweeps at once can't both send it.
      const { data: claimed } = await db
        .from("study_sessions")
        .update({ alerted_at: new Date(now).toISOString() })
        .eq("id", row.id)
        .eq("user_id", row.user_id)
        .is("alerted_at", null)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      const res = await sendPush(row.user_id, {
        title: "Time's up",
        body: `Your ${row.subject} session is done. Open the timer to finish it or keep going.`,
        url: "/timer",
        category: "reminders",
        importance: 4,
        tag: `timer-${row.id}`,
      }).catch(() => ({ sent: 0 }));
      if (res.sent) alerted++;
    }
  }
  return { alerted, closed };
}
