"use client";

import { useEffect, useState } from "react";
import { formatDue, sourceLabel, type DbTask } from "@/lib/tasks";

// Read-only glance at the next few tasks, shown on Home. Relative dates are
// computed after mount (see formatDue) so they match the viewer's timezone
// without a hydration mismatch. Actions live on the Assignments page.
export function DueSoon({ tasks }: { tasks: DbTask[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  if (tasks.length === 0) {
    return (
      <p className="track-empty" style={{ fontSize: 13 }}>
        Nothing due right now. Add tasks on the Assignments page.
      </p>
    );
  }

  return (
    <div className="track-list">
      {tasks.map((task) => {
        const { text, overdue } = formatDue(task.due_at, { short: true, now });
        const sub = [task.course, sourceLabel(task.source)]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="task" key={task.id}>
            <div className="task-body">
              <span className="task-title">{task.title}</span>
              {sub ? <span className="task-sub">{sub}</span> : null}
            </div>
            {overdue ? <span className="chip">OVERDUE</span> : null}
            <span className="task-due">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
