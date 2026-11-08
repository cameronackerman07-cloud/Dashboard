"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { SubjectSelect } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import { addDays, formatDayKey } from "@/lib/time";
import { addTodo, clearDone, deleteTodo, setTodoDone, updateTodo } from "./actions";

export type Todo = {
  id: string;
  title: string;
  due_on: string | null;
  subject: string | null;
  priority: number;
  done: boolean;
  done_at: string | null;
};

const PRIORITY = { 1: "High", 2: "Normal", 3: "Low" } as Record<number, string>;

function dueText(due: string | null, today: string): string | null {
  if (!due) return null;
  if (due === today) return "Today";
  if (due === addDays(today, 1)) return "Tomorrow";
  if (due === addDays(today, -1)) return "Yesterday";
  return formatDayKey(due);
}

function PriorityFields({ todo }: { todo?: Todo }) {
  return (
    <>
      <input name="due" type="date" className="input" aria-label="Due date (optional)" defaultValue={todo?.due_on ?? ""} />
      <SubjectSelect defaultValue={todo?.subject ?? ""} />
      <select name="priority" className="input" aria-label="Priority" defaultValue={String(todo?.priority ?? 2)}>
        <option value="1">High priority</option>
        <option value="2">Normal priority</option>
        <option value="3">Low priority</option>
      </select>
    </>
  );
}

export function TodoClient({ todos: initial, today }: { todos: Todo[]; today: string }) {
  const [todos, setTodos] = useState(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);
  const add = useAction();
  const rowAction = useAction();

  useEffect(() => setTodos(initial), [initial]);

  function toggle(todo: Todo) {
    const next = !todo.done;
    setError("");
    setTodos((all) => all.map((t) => (t.id === todo.id ? { ...t, done: next, done_at: next ? new Date().toISOString() : null } : t)));
    startTransition(async () => {
      let ok = false;
      try {
        ok = await setTodoDone(todo.id, next);
      } catch {
        // Handled below.
      }
      if (!ok) {
        setError("That change couldn't be saved. Check your connection and try again.");
        setTodos((all) => all.map((t) => (t.id === todo.id ? todo : t)));
      }
    });
  }

  const open = todos.filter((t) => !t.done);
  const groups: { label: string; items: Todo[] }[] = [
    { label: "Overdue", items: open.filter((t) => t.due_on && t.due_on < today) },
    { label: "Today", items: open.filter((t) => t.due_on === today) },
    { label: "Upcoming", items: open.filter((t) => t.due_on && t.due_on > today) },
    { label: "No date", items: open.filter((t) => !t.due_on) },
    { label: "Done", items: todos.filter((t) => t.done) },
  ];

  return (
    <>
      <section className="card" aria-label="Add a to-do">
        <form
          key={addKey}
          className="track-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.run(() => addTodo(f), () => setAddKey((k) => k + 1));
          }}
        >
          <div className="track-fields">
            <input name="title" className="input" placeholder="Add a to-do…" aria-label="New to-do" maxLength={200} required autoComplete="off" />
            <button type="submit" className="btn btn-dark" disabled={add.pending}>
              Add
            </button>
          </div>
          <details className="more">
            <summary>Due date, subject and priority</summary>
            <div className="track-fields">
              <PriorityFields />
            </div>
          </details>
        </form>
        <ReplyLine reply={add.reply?.ok ? null : add.reply} />
      </section>

      {error ? (
        <p className="ai-error" role="alert">
          {error}
        </p>
      ) : null}
      <ReplyLine reply={rowAction.reply?.ok ? null : rowAction.reply} />

      {todos.length === 0 ? (
        <section className="card">
          <p className="track-empty">Nothing to do. Add something above.</p>
        </section>
      ) : null}

      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section className="card" key={g.label} aria-label={g.label}>
            <div className="card-head">
              <h2 className="card-title">{g.label}</h2>
              {g.label === "Done" ? (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={rowAction.pending}
                  onClick={() => {
                    if (window.confirm("Delete all finished to-dos?")) rowAction.run(clearDone);
                  }}
                >
                  Clear done
                </button>
              ) : (
                <span className="card-meta">{g.items.length}</span>
              )}
            </div>
            <div className="track-list">
              {g.items.map((t) =>
                editId === t.id ? (
                  <form
                    key={t.id}
                    className="track-form todo-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      rowAction.run(() => updateTodo(t.id, f), () => setEditId(null));
                    }}
                  >
                    <input name="title" className="input" defaultValue={t.title} aria-label="To-do" maxLength={200} required />
                    <div className="track-fields">
                      <PriorityFields todo={t} />
                    </div>
                    <div className="note-actions">
                      <button type="submit" className="btn btn-dark" disabled={rowAction.pending}>
                        Save
                      </button>
                      <button type="button" className="btn" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={rowAction.pending}
                        onClick={() => {
                          if (window.confirm("Delete this to-do?")) rowAction.run(() => deleteTodo(t.id));
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={`task${t.done ? " task-done" : ""}`} key={t.id}>
                    <button
                      type="button"
                      className="check check-lg"
                      aria-pressed={t.done}
                      aria-label={`${t.title}: ${t.done ? "done, tap to undo" : "tap when done"}`}
                      onClick={() => toggle(t)}
                    >
                      {t.done ? <Icon name="check" size={16} /> : null}
                    </button>
                    <button type="button" className="task-body task-open" onClick={() => setEditId(t.id)} aria-label={`Edit ${t.title}`}>
                      <span className="task-title">{t.title}</span>
                      <span className="task-sub">
                        {[t.subject, t.priority !== 2 ? `${PRIORITY[t.priority]} priority` : null].filter(Boolean).join(" · ") || " "}
                      </span>
                    </button>
                    {t.priority === 1 && !t.done ? <span className="chip">HIGH</span> : null}
                    {t.due_on && !t.done ? <span className="task-due">{dueText(t.due_on, today)}</span> : null}
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
    </>
  );
}
