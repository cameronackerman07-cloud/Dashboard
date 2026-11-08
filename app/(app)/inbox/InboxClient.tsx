"use client";

import { ReplyLine, useAction } from "@/components/useAction";
import type { ReportSection } from "@/lib/agents/types";
import { markAllRead, markRead } from "./actions";

export type InboxReport = { id: string; kind: string; title: string; headline: string; sections: ReportSection[]; when: string; unread: boolean };

const KIND: Record<string, string> = {
  briefing: "Briefing",
  sunday_reset: "Sunday reset",
  alert: "Alert",
  strategy: "Money plan",
  cleaning_hours: "Hours report",
  custom: "Report",
};

export function Report({ report }: { report: Pick<InboxReport, "headline" | "sections"> }) {
  return (
    <div className="summary-sections">
      {report.headline ? <p className="briefing-text">{report.headline}</p> : null}
      {report.sections.map((s, i) => (
        <div key={`${s.heading}-${i}`}>
          <h3 className="summary-heading">{s.heading}</h3>
          <ul className="summary-points">
            {(Array.isArray(s.points) ? s.points : []).map((p, j) => (
              <li key={j}>{String(p)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function InboxClient({ reports }: { reports: InboxReport[] }) {
  const { pending, reply, run } = useAction();
  const unread = reports.filter((r) => r.unread).length;
  return (
    <section className="card" aria-label="Reports">
      <div className="card-head">
        <h2 className="card-title">Reports</h2>
        <button type="button" className="btn btn-small" disabled={pending || unread === 0} onClick={() => run(markAllRead)}>
          Mark all read{unread ? ` (${unread})` : ""}
        </button>
      </div>
      <ReplyLine reply={reply} />
      {reports.length === 0 ? (
        <p className="track-empty">No reports yet. The BRIAN writes your first briefing at 7 am once the agents are running.</p>
      ) : (
        <div className="track-list">
          {reports.map((r, i) => (
            <details
              className="upload"
              key={r.id}
              open={i === 0}
              onToggle={(e) => {
                if ((e.currentTarget as HTMLDetailsElement).open && r.unread) markRead(r.id);
              }}
            >
              <summary>
                <span className="task-title">
                  {r.unread ? <span className="chip pin-chip">NEW</span> : null}
                  {r.title}
                </span>
                <span className="task-sub">
                  {KIND[r.kind] ?? "Report"} · {r.when}
                </span>
              </summary>
              <div className="upload-body">
                <Report report={r} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
