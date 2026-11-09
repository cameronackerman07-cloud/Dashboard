"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import { MAX_LOCATION, MAX_TITLE, VIEWS, type CalView } from "@/lib/calendar-edit";
import type { CalSource } from "@/lib/calendar-merge";
import { addDays, dayKey, formatDayKey, formatDayKeyLong, formatTime, isDayKey, timeKey } from "@/lib/time";
import { addEvent, deleteEvent, updateEvent } from "./actions";

export type ShownItem = {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  source: CalSource;
  label: string;
  location?: string | null;
  eventId?: string; // set only for your own events, which you can change
};

type Props = {
  view: CalView;
  days: { day: string; items: ShownItem[] }[];
  today: string;
  month?: string;
  anchor: string;
  label: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  viewHrefs: Record<CalView, string>;
  dayHrefs: Record<string, string>;
  goToBase: string;
};

// Where a read-only item can be changed instead.
const SOURCE_HOME: Partial<Record<CalSource, { href?: string; text: string }>> = {
  class: { text: "This comes from your school calendar, so change it there." },
  google: { text: "This comes from Google Calendar, so change it there." },
  shift: { href: "/shifts", text: "Change shifts on the Shifts page." },
  due: { href: "/assignments", text: "Change due dates in Assignments or To-do." },
  study: { href: "/planner", text: "Change study blocks in the Planner." },
};

type Editing = { mode: "new"; day: string } | { mode: "edit"; item: ShownItem } | { mode: "view"; item: ShownItem };

export function CalendarClient(props: Props) {
  const { view, days, today, month, anchor, label, prevHref, nextHref, todayHref, viewHrefs, dayHrefs, goToBase } = props;
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);

  const open = (item: ShownItem) => setEditing(item.eventId ? { mode: "edit", item } : { mode: "view", item });
  const firstDay = days[0]?.day ?? today;
  const newDay = days.some((d) => d.day === today) ? today : view === "month" && month ? `${month}-01` : firstDay;

  return (
    <>
      <div className="cal-toolbar">
        <nav className="seg" aria-label="View">
          {VIEWS.map((v) => (
            <Link key={v.id} className={`seg-btn seg-link${view === v.id ? " is-active" : ""}`} href={viewHrefs[v.id]} aria-current={view === v.id ? "page" : undefined}>
              {v.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="btn btn-dark" onClick={() => setEditing({ mode: "new", day: newDay })}>
          + Add event
        </button>
      </div>

      <div className="cal-nav">
        <div className="cal-nav-arrows">
          <Link className="btn btn-small" href={prevHref} aria-label="Earlier">
            ←
          </Link>
          <Link className="btn btn-small" href={todayHref}>
            Today
          </Link>
          <Link className="btn btn-small" href={nextHref} aria-label="Later">
            →
          </Link>
        </div>
        <strong className="cal-nav-label">{label}</strong>
        <label className="cal-goto">
          <span className="sr-only">Go to a date</span>
          <input
            type="date"
            className="input"
            aria-label="Go to a date"
            defaultValue={anchor}
            key={anchor}
            onChange={(e) => {
              const d = e.target.value;
              if (isDayKey(d)) router.push(`${goToBase}${goToBase.includes("?") ? "&" : "?"}d=${d}`);
            }}
          />
        </label>
      </div>

      {view === "month" ? (
        <MonthGrid days={days} today={today} month={month ?? today.slice(0, 7)} dayHrefs={dayHrefs} onOpen={open} />
      ) : (
        <div className={view === "week" ? "cal-week" : "cal-agenda"}>
          {days
            .filter((d) => view !== "agenda" || d.items.length > 0 || d.day === today)
            .map((d) => (
              <section key={d.day} className={`card cal-day${d.day === today ? " tt-today" : ""}`} aria-label={formatDayKeyLong(d.day)}>
                <div className="card-head">
                  <h2 className="card-title">
                    {view === "day" ? (
                      "What's on"
                    ) : (
                      <Link href={dayHrefs[d.day]} className="cal-daylink">
                        {view === "week" ? formatDayKey(d.day) : formatDayKeyLong(d.day)}
                      </Link>
                    )}
                  </h2>
                  {d.day === today ? <span className="chip">TODAY</span> : null}
                  <button type="button" className="cal-add" onClick={() => setEditing({ mode: "new", day: d.day })} aria-label={`Add an event on ${formatDayKeyLong(d.day)}`}>
                    +
                  </button>
                </div>
                {d.items.length === 0 ? (
                  <p className="track-empty">Nothing on.</p>
                ) : (
                  <div className="rows">
                    {d.items.map((i) => (
                      <button type="button" className={`row cal-row cal-item${i.eventId ? " is-mine" : ""}`} key={`${d.day}|${i.id}`} onClick={() => open(i)}>
                        <span className="row-slot cal-time">{i.allDay ? "All day" : formatTime(i.start)}</span>
                        <span className="row-main cal-main">
                          <span className="cal-title">{i.title}</span>
                          <span className="task-sub">{[i.label, i.allDay ? null : `until ${formatTime(i.end)}`, i.location].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
        </div>
      )}

      {editing ? <EventDialog editing={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

const MONTH_SHOWN = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthGrid({ days, today, month, dayHrefs, onOpen }: { days: { day: string; items: ShownItem[] }[]; today: string; month: string; dayHrefs: Record<string, string>; onOpen: (i: ShownItem) => void }) {
  return (
    <div className="cal-month" role="grid" aria-label="Month">
      {WEEKDAYS.map((w) => (
        <div key={w} className="cal-month-head" role="columnheader">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const extra = d.items.length - MONTH_SHOWN;
        return (
          <div key={d.day} role="gridcell" className={`cal-cell${d.day.slice(0, 7) !== month ? " is-out" : ""}${d.day === today ? " is-today" : ""}`}>
            <Link href={dayHrefs[d.day]} className="cal-cell-date" aria-label={formatDayKeyLong(d.day)}>
              {Number(d.day.slice(8))}
            </Link>
            {d.items.length ? <span className="cal-cell-dot" aria-hidden="true">{d.items.length}</span> : null}
            <div className="cal-cell-items">
              {d.items.slice(0, MONTH_SHOWN).map((i) => (
                <button type="button" key={i.id} className={`cal-pill${i.eventId ? " is-mine" : ""}`} onClick={() => onOpen(i)} title={i.title}>
                  {i.allDay ? "" : `${formatTime(i.start)} `}
                  {i.title}
                </button>
              ))}
              {extra > 0 ? (
                <Link href={dayHrefs[d.day]} className="cal-more">
                  +{extra} more
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit / details window
// ---------------------------------------------------------------------------

function nextHour(): string {
  const now = Date.now();
  const h = Math.min(22, Number(timeKey(now).slice(0, 2)) + 1);
  return `${String(h).padStart(2, "0")}:00`;
}
const plusHour = (t: string) => `${String(Math.min(23, Number(t.slice(0, 2)) + 1)).padStart(2, "0")}:${t.slice(3)}`;

function EventDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { pending, reply, run } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  if (editing.mode === "view") {
    const i = editing.item;
    const home = SOURCE_HOME[i.source];
    return (
      <dialog ref={ref} className="cal-dialog" onClose={onClose} aria-labelledby="cal-dialog-title">
        <h2 id="cal-dialog-title" className="card-title">
          {i.title}
        </h2>
        <p>{describeWhen(i)}</p>
        {i.location ? <p className="task-sub">{i.location}</p> : null}
        <p className="field-help">
          {i.label}. {home?.text}
        </p>
        <div className="cal-dialog-buttons">
          {home?.href ? (
            <Link className="btn" href={home.href}>
              Open
            </Link>
          ) : null}
          <button type="button" className="btn btn-dark" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    );
  }

  const item = editing.mode === "edit" ? editing.item : null;
  const startTime = item && !item.allDay ? timeKey(item.start) : nextHour();
  const init = item
    ? {
        title: item.title,
        location: item.location ?? "",
        allDay: item.allDay,
        startDay: dayKey(item.start),
        startTime,
        endDay: item.allDay ? addDays(dayKey(item.end), -1) : dayKey(item.end),
        endTime: item.allDay ? plusHour(startTime) : timeKey(item.end),
      }
    : { title: "", location: "", allDay: false, startDay: editing.mode === "new" ? editing.day : "", startTime, endDay: editing.mode === "new" ? editing.day : "", endTime: plusHour(startTime) };

  return (
    <dialog ref={ref} className="cal-dialog" onClose={onClose} aria-labelledby="cal-dialog-title">
      <EventForm
        key={item?.id ?? "new"}
        init={init}
        title={item ? "Edit event" : "New event"}
        pending={pending}
        onCancel={() => ref.current?.close()}
        onSave={(values) =>
          run(
            () => (item?.eventId ? updateEvent(item.eventId, values) : addEvent(values)),
            () => ref.current?.close(),
          )
        }
      >
        <ReplyLine reply={reply} />
        {item?.eventId ? (
          confirmDelete ? (
            <div className="cal-confirm" role="group" aria-label="Confirm delete">
              <span>Delete this event? This can&apos;t be undone.</span>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run(() => deleteEvent(item.eventId as string), () => ref.current?.close())}>
                Yes, delete
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="btn cal-delete" disabled={pending} onClick={() => setConfirmDelete(true)}>
              Delete event
            </button>
          )
        ) : null}
      </EventForm>
    </dialog>
  );
}

type FormValues = { title: string; location: string; allDay: boolean; startDay: string; startTime: string; endDay: string; endTime: string };

function EventForm({ init, title, pending, onSave, onCancel, children }: { init: FormValues; title: string; pending: boolean; onSave: (v: FormValues) => void; onCancel: () => void; children?: React.ReactNode }) {
  const [v, setV] = useState<FormValues>(init);
  const set = (patch: Partial<FormValues>) => setV((old) => ({ ...old, ...patch }));

  return (
    <form
      className="cal-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <h2 id="cal-dialog-title" className="card-title">
        {title}
      </h2>
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={v.title} maxLength={MAX_TITLE} required autoFocus onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Dentist, Netball training" />
      </label>
      <label className="cal-check">
        <input type="checkbox" checked={v.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
        <span>All day</span>
      </label>
      <div className="cal-when">
        <label className="field">
          <span className="field-label">Starts</span>
          <input
            type="date"
            className="input"
            value={v.startDay}
            required
            onChange={(e) => {
              const d = e.target.value;
              // Keep the end on or after the start.
              set({ startDay: d, endDay: !v.endDay || v.endDay < d ? d : v.endDay });
            }}
          />
        </label>
        {v.allDay ? null : (
          <label className="field">
            <span className="field-label">Time</span>
            <input
              type="time"
              className="input"
              value={v.startTime}
              required
              onChange={(e) => {
                const t = e.target.value;
                set({ startTime: t, endTime: v.endDay === v.startDay && v.endTime <= t ? plusHour(t) : v.endTime });
              }}
            />
          </label>
        )}
        <label className="field">
          <span className="field-label">Ends</span>
          <input type="date" className="input" value={v.endDay} min={v.startDay} required onChange={(e) => set({ endDay: e.target.value })} />
        </label>
        {v.allDay ? null : (
          <label className="field">
            <span className="field-label">Time</span>
            <input type="time" className="input" value={v.endTime} required onChange={(e) => set({ endTime: e.target.value })} />
          </label>
        )}
      </div>
      <label className="field">
        <span className="field-label">Where (optional)</span>
        <input className="input" value={v.location} maxLength={MAX_LOCATION} onChange={(e) => set({ location: e.target.value })} />
      </label>
      {children}
      <div className="cal-dialog-buttons">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function describeWhen(i: ShownItem): string {
  const startDay = dayKey(i.start);
  if (i.allDay) {
    const last = addDays(dayKey(i.end), -1);
    return last > startDay ? `${formatDayKeyLong(startDay)} – ${formatDayKeyLong(last)}` : `${formatDayKeyLong(startDay)}, all day`;
  }
  const endDay = dayKey(i.end);
  return endDay === startDay
    ? `${formatDayKeyLong(startDay)}, ${formatTime(i.start)} – ${formatTime(i.end)}`
    : `${formatDayKeyLong(startDay)} ${formatTime(i.start)} – ${formatDayKeyLong(endDay)} ${formatTime(i.end)}`;
}
