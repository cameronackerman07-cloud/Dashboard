import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { AUTO_SYNC_MS, syncCanvas } from "@/lib/canvas";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { AssignmentsClient, type Task } from "./AssignmentsClient";

export const metadata: Metadata = { title: "Assignments" };

// Combined due-date tracker: your own tasks plus Canvas work (source "canvas"),
// synced from lib/canvas.ts. Google Classroom items are tracked in external_items by the Assignments agent.
export default async function AssignmentsPage() {
  // Pull in new Canvas work first, if the last sync is over 30 minutes old.
  const sync = await syncCanvas({ maxAgeMs: AUTO_SYNC_MS });
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, title, course, source, due_at, done")
    .order("done", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const tasks: Task[] = data ?? [];

  return (
    <main className="main main-narrow">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
          <Link href="/" style={{ color: "var(--muted)" }}>
            Home
          </Link>{" "}
          / <span style={{ color: "var(--ink)", fontWeight: 600 }}>Assignments</span>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="connect-logo">
            <Icon name="tasks" size={22} />
          </span>
          <h1 className="page-title">Assignments</h1>
        </div>
        <p className="lede">
          Everything due, in one place. Add your own tasks and tick them off. Canvas work comes in
          automatically once you <Link href="/settings">connect Canvas</Link>, and is ticked off when you submit it.
        </p>
      </div>

      {sync && !sync.ok ? (
        <p className="ai-error" role="alert">
          Canvas: {sync.message} <Link href="/settings">Check Canvas in Settings</Link>
        </p>
      ) : null}

      <AssignmentsClient tasks={tasks} courses={COURSES} />
    </main>
  );
}
