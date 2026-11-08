"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { addBlock, deleteBlock } from "./actions";

export type Block = {
  id: string;
  day_of_week: number;
  start_min: number;
  duration_min: number;
  subject: string | null;
  label: string | null;
};

type Action = { type: "add"; block: Block } | { type: "delete"; id: string };

const DAYS = [
  { n: 1, label: "Monday", short: "Mon" },
  { n: 2, label: "Tuesday", short: "Tue" },
  { n: 3, label: "Wednesday", short: "Wed" },
  { n: 4, label: "Thursday", short: "Thu" },
  { n: 5, label: "Friday", short: "Fri" },
  { n: 6, label: "Saturday", short: "Sat" },
  { n: 7, label: "Sunday", short: "Sun" },
];

function timeLabel(totalMin: number) {
  const min = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

export function PlannerClient({ blocks, courses }: { blocks: Block[]; courses: string[] }) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [optimistic, apply] = useOptimistic(blocks, (state, action: Action) => {
    if (action.type === "add") return [...state, action.block];
    return state.filter((b) => b.id !== action.id);
  });

  const [todayN, setTodayN] = useState<number | null>(null);
  useEffect(() => {
    const jsDay = new Date().getDay();
    setTodayN(jsDay === 0 ? 7 : jsDay);
  }, []);
  const totalMin = optimistic.reduce((sum, b) => sum + b.duration_min, 0);

  function handleAdd(formData: FormData) {
    const day = Number(formData.get("day"));
    const time = String(formData.get("time") ?? "");
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!day || !match) return;

    startTransition(async () => {
      apply({
        type: "add",
        block: {
          id: `temp-${Date.now()}`,
          day_of_week: day,
          start_min: Number(match[1]) * 60 + Number(match[2]),
          duration_min: Number(formData.get("duration")) || 30,
          subject: String(formData.get("subject") ?? "").trim() || null,
          label: String(formData.get("label") ?? "").trim() || null,
        },
      });
      await addBlock(formData);
    });
    formRef.current?.reset();
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      apply({ type: "delete", id });
      await deleteBlock(id);
    });
  }

  return (
    <>
      <section className="card" aria-label="Add a repeating block">
        <h2 className="card-title">Add a repeating block</h2>
        <form ref={formRef} action={handleAdd} className="track-form">
          <div className="track-fields">
            <select name="day" className="input" aria-label="Day" defaultValue="1">
              {DAYS.map((d) => (
                <option key={d.n} value={d.n}>
                  {d.label}
                </option>
              ))}
            </select>
            <input name="time" type="time" className="input" aria-label="Start time" defaultValue="16:00" required />
            <select name="duration" className="input" aria-label="Duration" defaultValue="30">
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>
          <div className="track-fields">
            <input
              name="subject"
              className="input"
              placeholder="Subject (optional)"
              aria-label="Subject"
              list="planner-course-list"
              maxLength={80}
            />
            <input name="label" className="input" placeholder="What to do (optional)" aria-label="Label" maxLength={120} />
            <button type="submit" className="btn btn-dark track-add">
              <Icon name="arrow" size={16} />
              Add
            </button>
          </div>
          <datalist id="planner-course-list">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </form>
      </section>

      <div className="card-head" style={{ padding: "0 2px" }}>
        <span className="card-meta">
          {optimistic.length === 0
            ? "No study blocks yet"
            : `${optimistic.length} blocks · ${(totalMin / 60).toFixed(1)} hours a week`}
        </span>
      </div>

      <div className="tt-grid">
        {DAYS.map((d) => {
          const dayBlocks = optimistic
            .filter((b) => b.day_of_week === d.n)
            .sort((a, b) => a.start_min - b.start_min);
          return (
            <section className={`card tt-col${d.n === todayN ? " tt-today" : ""}`} key={d.n} aria-label={d.label}>
              <div className="card-head">
                <h2 className="card-title">{d.short}</h2>
                {d.n === todayN ? <span className="chip">TODAY</span> : null}
              </div>
              {dayBlocks.length === 0 ? (
                <p className="track-empty" style={{ fontSize: 13 }}>
                  Free.
                </p>
              ) : (
                <div className="tt-list">
                  {dayBlocks.map((b) => (
                    <div className="tt-item" key={b.id}>
                      <div className="task-body">
                        <span className="task-title">{b.subject ?? b.label ?? "Study"}</span>
                        <span className="task-sub">
                          {timeLabel(b.start_min)}–{timeLabel(b.start_min + b.duration_min)}
                          {b.subject && b.label ? ` · ${b.label}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="task-del"
                        aria-label="Delete study block"
                        onClick={() => handleDelete(b.id)}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
