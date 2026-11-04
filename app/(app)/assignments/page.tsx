import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { AssignmentsClient, type Task } from "./AssignmentsClient";

export const metadata: Metadata = { title: "Assignments" };

// Combined due-date tracker (phase 1). For now it holds tasks you add yourself;
// Canvas, Google Classroom and Compass tasks will be imported into the same
// `tasks` table later and appear here alongside them.
export default async function AssignmentsPage() {
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
          Everything due, in one place. Add your own tasks and tick them off. Canvas, Google
          Classroom and Compass tasks will feed in here automatically once those are connected.
        </p>
      </div>

      <AssignmentsClient tasks={tasks} courses={COURSES} />
    </main>
  );
}
