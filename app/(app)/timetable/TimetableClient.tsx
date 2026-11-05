"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { addClass, deleteClass } from "./actions";

export type ClassRow = {
  id: string;
  day_of_week: number;
  period: string | null;
  subject: string;
  room: string | null;
  week: string;
};

type Action = { type: "add"; row: ClassRow } | { type: "delete"; id: string };

const DAYS = [
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
];

export function TimetableClient({ classes, courses }: { classes: ClassRow[]; courses: string[] }) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [optimistic, apply] = useOptimistic(classes, (state, action: Action) => {
    if (action.type === "add") return [...state, action.row];
    return state.filter((c) => c.id !== action.id);
  });

  // Compute "today" after mount so the TODAY highlight never mismatches during
  // hydration (the server clock may be on a different calendar day).
  const [todayN, setTodayN] = useState<number | null>(null);
  useEffect(() => {
    const jsDay = new Date().getDay(); // 0 = Sunday
    setTodayN(jsDay === 0 ? 7 : jsDay);
  }, []);

  function handleAdd(formData: FormData) {
    const subject = String(formData.get("subject") ?? "").trim();
    const day = Number(formData.get("day"));
    if (!subject || !day) return;

    startTransition(async () => {
      apply({
        type: "add",
        row: {
          id: `temp-${Date.now()}`,
          day_of_week: day,
          subject,
          period: String(formData.get("period") ?? "").trim() || null,
          room: String(formData.get("room") ?? "").trim() || null,
          week: String(formData.get("week") ?? "all"),
        },
      });
      await addClass(formData);
    });
    formRef.current?.reset();
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      apply({ type: "delete", id });
      await deleteClass(id);
    });
  }

  return (
    <>
      <section className="card" aria-label="Add a class">
        <h2 className="card-title">Add a class</h2>
        <form ref={formRef} action={handleAdd} className="track-form">
          <div className="track-fields">
            <select name="day" className="input" aria-label="Day" defaultValue="1">
              {DAYS.map((d) => (
                <option key={d.n} value={d.n}>
                  {d.label}
                </option>
              ))}
            </select>
            <input
              name="subject"
              className="input"
              placeholder="Subject"
              aria-label="Subject"
              list="tt-course-list"
              required
              maxLength={80}
            />
          </div>
          <div className="track-fields">
            <input name="period" className="input" placeholder="Period (e.g. Period 1)" aria-label="Period" maxLength={40} />
            <input name="room" className="input" placeholder="Room" aria-label="Room" maxLength={40} />
            <select name="week" className="input" aria-label="Week" defaultValue="all">
              <option value="all">Every week</option>
              <option value="A">Week A</option>
              <option value="B">Week B</option>
            </select>
            <button type="submit" className="btn btn-dark track-add">
              <Icon name="arrow" size={16} />
              Add
            </button>
          </div>
          <datalist id="tt-course-list">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </form>
      </section>

      <div className="tt-grid">
        {DAYS.map((d) => {
          const dayClasses = optimistic.filter((c) => c.day_of_week === d.n);
          return (
            <section className={`card tt-col${d.n === todayN ? " tt-today" : ""}`} key={d.n} aria-label={d.label}>
              <div className="card-head">
                <h2 className="card-title">{d.label}</h2>
                {d.n === todayN ? <span className="chip">TODAY</span> : null}
              </div>
              {dayClasses.length === 0 ? (
                <p className="track-empty" style={{ fontSize: 13 }}>
                  No classes yet.
                </p>
              ) : (
                <div className="tt-list">
                  {dayClasses.map((c) => (
                    <div className="tt-item" key={c.id}>
                      <div className="task-body">
                        <span className="task-title">{c.subject}</span>
                        <span className="task-sub">
                          {[c.period, c.room, c.week !== "all" ? `Week ${c.week}` : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="task-del"
                        aria-label={`Delete ${c.subject}`}
                        onClick={() => handleDelete(c.id)}
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
