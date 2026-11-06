"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { formatDue, sourceLabel, type DbTask } from "@/lib/tasks";
import { addTask, deleteTask, setTaskDone } from "./actions";

export type Task = DbTask;

type Optimistic =
  | { type: "add"; task: Task }
  | { type: "toggle"; id: string; done: boolean }
  | { type: "delete"; id: string };

// Same order as the database query: not-done first, then by due date
// (undated last), so the optimistic list stays in a sensible order.
function sortTasks(list: Task[]) {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.due_at ? Date.parse(a.due_at) : Infinity;
    const bd = b.due_at ? Date.parse(b.due_at) : Infinity;
    return ad - bd;
  });
}

export function AssignmentsClient({ tasks, courses }: { tasks: Task[]; courses: string[] }) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state, action: Optimistic) => {
      switch (action.type) {
        case "add":
          return sortTasks([...state, action.task]);
        case "toggle":
          return sortTasks(
            state.map((t) => (t.id === action.id ? { ...t, done: action.done } : t)),
          );
        case "delete":
          return state.filter((t) => t.id !== action.id);
        default:
          return state;
      }
    },
  );

  function handleAdd(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    const course = String(formData.get("course") ?? "").trim();
    const due = String(formData.get("due") ?? "").trim();

    startTransition(async () => {
      applyOptimistic({
        type: "add",
        task: {
          id: `temp-${Date.now()}`,
          title,
          course: course || null,
          source: "manual",
          due_at: due ? `${due}T00:00:00Z` : null,
          done: false,
        },
      });
      await addTask(formData);
    });
    formRef.current?.reset();
  }

  function handleToggle(task: Task) {
    startTransition(async () => {
      applyOptimistic({ type: "toggle", id: task.id, done: !task.done });
      await setTaskDone(task.id, !task.done);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      await deleteTask(id);
    });
  }

  const openCount = optimisticTasks.filter((t) => !t.done).length;

  return (
    <>
      <section className="card" aria-label="Add a task">
        <h2 className="card-title">Add a task</h2>
        <form ref={formRef} action={handleAdd} className="track-form">
          <input
            name="title"
            type="text"
            className="input"
            placeholder="What's due? e.g. Physics depth study"
            aria-label="Task title"
            required
            maxLength={200}
          />
          <div className="track-fields">
            <select name="course" className="input" aria-label="Subject" defaultValue="">
              <option value="">No subject</option>
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input name="due" type="date" className="input" aria-label="Due date" />
            <button type="submit" className="btn btn-dark track-add">
              <Icon name="arrow" size={16} />
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="card" aria-label="Your tasks">
        <div className="card-head">
          <h2 className="card-title">Your tasks</h2>
          <span className="card-meta">
            {openCount === 0 ? "All clear" : `${openCount} to do`}
          </span>
        </div>

        {optimisticTasks.length === 0 ? (
          <p className="track-empty">
            Nothing here yet. Add your first task above — Canvas, Classroom and Compass tasks
            will show up here automatically once those are connected.
          </p>
        ) : (
          <div className="track-list">
            {optimisticTasks.map((task) => {
              const { text, overdue } = formatDue(task.due_at, { now });
              const sub = [task.course, sourceLabel(task.source)]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={task.id} className={`task${task.done ? " task-done" : ""}`}>
                  <button
                    type="button"
                    className="check"
                    aria-pressed={task.done}
                    aria-label={`${task.done ? "Mark not done" : "Mark done"}: ${task.title}`}
                    onClick={() => handleToggle(task)}
                  >
                    {task.done ? <Icon name="check" size={14} /> : null}
                  </button>
                  <div className="task-body">
                    <span className="task-title">{task.title}</span>
                    {sub ? <span className="task-sub">{sub}</span> : null}
                  </div>
                  {overdue && !task.done ? <span className="chip">OVERDUE</span> : null}
                  <span className="task-due">{text}</span>
                  <button
                    type="button"
                    className="task-del"
                    aria-label={`Delete: ${task.title}`}
                    onClick={() => handleDelete(task.id)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
