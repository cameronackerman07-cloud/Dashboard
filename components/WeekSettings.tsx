"use client";

import { saveWeekSettings } from "@/app/(app)/settings/week-actions";
import { ReplyLine, useAction } from "@/components/useAction";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function WeekSettings({ payWeekStart, town }: { payWeekStart: number; town: string }) {
  const { pending, reply, run } = useAction();
  return (
    <section className="card" aria-label="Your week">
      <div className="card-head">
        <h2 className="card-title">Your week</h2>
        <span className="card-meta">Used by your agents</span>
      </div>
      <form
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => saveWeekSettings(Number(f.get("start")), String(f.get("town") ?? "")));
        }}
      >
        <label className="field">
          <span className="field-label">Pay week starts on</span>
          <select name="start" className="input" defaultValue={String(payWeekStart)}>
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Town or suburb for the weather (no street address)</span>
          <input name="town" className="input" defaultValue={town} maxLength={60} placeholder="e.g. Penrith" autoComplete="off" />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}
