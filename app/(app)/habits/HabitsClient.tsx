"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { ReplyLine, useAction } from "@/components/useAction";
import { bestStreak, currentStreak, type Habit } from "@/lib/habits";
import { addDays, formatDayKey, formatDayKeyLong } from "@/lib/time";
import { addHabit, deleteHabit, setArchived, toggleHabit } from "./actions";

const DAYS_SHOWN = 14;

export function HabitsClient({ habits, logs, today }: { habits: Habit[]; logs: string[]; today: string }) {
  const [done, setDone] = useState(() => new Set(logs));
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");
  const { pending, reply, run } = useAction();
  const [addKey, setAddKey] = useState(0);
  const logsKey = logs.join(",");

  // When the server sends fresh data, it wins over what we guessed.
  useEffect(() => setDone(new Set(logsKey ? logsKey.split(",") : [])), [logsKey]);

  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i - (DAYS_SHOWN - 1)));

  function daysFor(habitId: string) {
    const set = new Set<string>();
    for (const key of done) {
      const [id, day] = key.split("|");
      if (id === habitId) set.add(day);
    }
    return set;
  }

  function toggle(habit: Habit, day: string) {
    const key = `${habit.id}|${day}`;
    const next = !done.has(key);
    setError("");
    setDone((cur) => {
      const copy = new Set(cur);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
    startTransition(async () => {
      let ok = false;
      try {
        ok = await toggleHabit(habit.id, day, next);
      } catch {
        // Handled below.
      }
      if (!ok) {
        setError("That tick couldn't be saved. Check your connection and try again.");
        setDone((cur) => {
          const copy = new Set(cur);
          if (next) copy.delete(key);
          else copy.add(key);
          return copy;
        });
      }
    });
  }

  return (
    <>
      <section className="card" aria-label="Today">
        <div className="card-head">
          <h2 className="card-title">Today</h2>
          <span className="card-meta">{formatDayKeyLong(today)}</span>
        </div>
        {active.length === 0 ? (
          <p className="track-empty">No habits yet. Add one below, like “Study 1 hour” or “Bed by 10:30”.</p>
        ) : (
          <div className="track-list">
            {active.map((h) => {
              const set = daysFor(h.id);
              const isDone = set.has(today);
              const streak = currentStreak(set, today);
              return (
                <div className={`task${isDone ? " task-done" : ""}`} key={h.id}>
                  <button
                    type="button"
                    className="check check-lg"
                    aria-pressed={isDone}
                    aria-label={`${h.name}: ${isDone ? "done today, tap to untick" : "tap when done today"}`}
                    onClick={() => toggle(h, today)}
                  >
                    {isDone ? <Icon name="check" size={16} /> : null}
                  </button>
                  <div className="task-body">
                    <span className="task-title">{h.name}</span>
                    <span className="task-sub">
                      {streak === 1 ? "1 day streak" : `${streak} day streak`} · best {bestStreak(set)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error ? (
          <p className="ai-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {active.length > 0 ? (
        <section className="card" aria-label="Last 14 days">
          <div className="card-head">
            <h2 className="card-title">Last 14 days</h2>
            <span className="card-meta">Tap a dot to fix a missed tick</span>
          </div>
          <div className="habit-grid">
            {active.map((h) => (
              <div className="habit-line" key={h.id}>
                <span className="habit-name">{h.name}</span>
                <span className="dots habit-dots">
                  {days.map((day) => {
                    const on = done.has(`${h.id}|${day}`);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`dot-btn${day === today ? " is-today" : ""}`}
                        aria-pressed={on}
                        aria-label={`${h.name}, ${formatDayKey(day)}: ${on ? "done" : "not done"}`}
                        title={formatDayKey(day)}
                        onClick={() => toggle(h, day)}
                      >
                        <span className={`dot${on ? " on" : ""}`} />
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" aria-label="Manage habits">
        <h2 className="card-title">Add a habit</h2>
        <form
          key={addKey}
          className="track-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => addHabit(f), () => setAddKey((k) => k + 1));
          }}
        >
          <input name="name" className="input" placeholder="e.g. Training, Read 20 min" aria-label="Habit name" maxLength={60} required />
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Add habit
          </button>
        </form>
        {active.length > 0 ? (
          <div className="track-list">
            {active.map((h) => (
              <div className="task" key={h.id}>
                <span className="task-body task-title">{h.name}</span>
                <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setArchived(h.id, true))}>
                  Archive
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {archived.length > 0 ? (
          <>
            <h3 className="field-label">Archived</h3>
            <div className="track-list">
              {archived.map((h) => (
                <div className="task" key={h.id}>
                  <span className="task-body task-sub">{h.name}</span>
                  <div className="row-actions">
                    <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setArchived(h.id, false))}>
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Delete “${h.name}” and all its history?`)) run(() => deleteHabit(h.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <ReplyLine reply={reply} />
      </section>
    </>
  );
}
