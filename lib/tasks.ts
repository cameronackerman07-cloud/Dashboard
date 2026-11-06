// Shared task shape and due-date formatting, used by both the Assignments page
// and the Home "Due soon" card so they always read the same way.

export type DbTask = {
  id: string;
  title: string;
  course: string | null;
  source: string | null;
  due_at: string | null;
  done: boolean;
};

export type DueInfo = { text: string; overdue: boolean };

// Friendly, colour-free due label relative to today, in the viewer's timezone.
// Pass `now` (Date.now()) only after the component has mounted on the client, so
// the day boundary matches where the user actually is. Until then (server render
// and first client render) we show the absolute date, which is identical on both
// sides — that keeps hydration clean, then relative words appear once mounted.
export function formatDue(
  dueAt: string | null,
  opts: { short?: boolean; now?: number | null } = {},
): DueInfo {
  if (!dueAt) return { text: "No date", overdue: false };

  const due = new Date(dueAt);
  const monthDay: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

  if (opts.now == null) {
    return { text: due.toLocaleDateString(undefined, monthDay), overdue: false };
  }

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startOfDay(due).getTime() - startOfDay(new Date(opts.now)).getTime()) / 86_400_000,
  );

  if (days < 0) {
    return {
      text: days === -1 ? "Yesterday" : due.toLocaleDateString(undefined, monthDay),
      overdue: true,
    };
  }
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days < 7) {
    return {
      text: due.toLocaleDateString(undefined, { weekday: opts.short ? "short" : "long" }),
      overdue: false,
    };
  }
  return { text: due.toLocaleDateString(undefined, monthDay), overdue: false };
}

// "canvas" → "Canvas". Manual tasks have no label.
const SOURCE_LABELS: Record<string, string> = { canvas: "Canvas", classroom: "Google Classroom", compass: "Compass" };

export function sourceLabel(source: string | null): string | null {
  if (!source || source === "manual") return null;
  return SOURCE_LABELS[source] ?? source;
}
