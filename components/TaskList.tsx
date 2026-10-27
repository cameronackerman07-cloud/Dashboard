"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export type Task = { id: string; title: string; subject: string; source: string; due: string };

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {tasks.map((t) => {
        const isDone = !!done[t.id];
        return (
          <div key={t.id} className={`task${isDone ? " task-done" : ""}`}>
            <button
              type="button"
              className="check"
              aria-pressed={isDone}
              aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${t.subject} ${t.title}`}
              onClick={() => setDone((d) => ({ ...d, [t.id]: !d[t.id] }))}
            >
              {isDone ? <Icon name="check" size={14} /> : null}
            </button>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="task-title">{t.title}</span>
              <span className="task-sub">
                {t.subject} · {t.source}
              </span>
            </div>
            <span className="task-due">{t.due}</span>
          </div>
        );
      })}
    </div>
  );
}
