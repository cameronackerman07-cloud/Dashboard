import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { countdownLabel, daysUntil, HSC_DATES, STUDENTS_ONLINE_URL } from "@/lib/hsc-dates";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDayKeyLong, formatTime, timeKey } from "@/lib/time";
import { KeyDatesClient, type KeyDateRow } from "./KeyDatesClient";

export const metadata: Metadata = { title: "Key dates" };
export const dynamic = "force-dynamic";

export default async function KeyDatesPage() {
  const db = await createClient();
  const now = Date.now();
  const { data } = await db.from("key_dates").select("id, title, starts_at, kind, course, pinned, notes").order("starts_at", { ascending: true }).limit(300);
  const rows: KeyDateRow[] = ((data ?? []) as { id: string; title: string; starts_at: string; kind: string; course: string | null; pinned: boolean; notes: string | null }[]).map((r) => {
    const ms = new Date(r.starts_at).getTime();
    const day = dayKey(ms);
    return { id: r.id, title: r.title, kind: r.kind, course: r.course, pinned: r.pinned, notes: r.notes, day, time: timeKey(ms), when: `${formatDayKeyLong(day)} ${day.slice(0, 4)}, ${formatTime(ms)}`, days: daysUntil(day, now) };
  });
  const exams = Object.fromEntries(rows.filter((r) => r.kind === "exam" && r.course).map((r) => [r.course!, { day: r.day, time: r.time }]));
  const hsc = countdownLabel(now);

  return (
    <main className="main main-narrow">
      <PageHeader icon="flag" title="Key dates" lede="Your HSC exam dates, trials, assessments, end of term and any countdown you want on Home." />

      <section className="card" aria-label="Official HSC dates">
        <h2 className="card-title">Official 2027 HSC dates</h2>
        <div className="rows">
          <Row label="Practical exam timetable released" day={HSC_DATES.practicalTimetable} />
          <Row label="Languages oral timetable released" day={HSC_DATES.oralTimetable} />
          <Row label="Written exam timetable released" day={HSC_DATES.writtenTimetable} />
          <Row label="Written exams begin (first possible day)" day={HSC_DATES.writtenStart} strong />
          <Row label="Written exams finish by" day={HSC_DATES.writtenEndBy} />
          <Row label="Results released" day={HSC_DATES.results} />
        </div>
        <p className="card-meta">
          {hsc.days > 0 ? `${hsc.days} days to go. ` : ""}From the{" "}
          <a href={HSC_DATES.source} target="_blank" rel="noreferrer">
            NSW Government HSC key dates page
          </a>
          , checked {formatDayKeyLong(HSC_DATES.checkedOn)} 2026. A weekly check tells you in Inbox if the page changes.
        </p>
      </section>

      <KeyDatesClient rows={rows} courses={[...COURSES]} exams={exams} studentsOnline={STUDENTS_ONLINE_URL} />
    </main>
  );
}

function Row({ label, day, strong }: { label: string; day: string; strong?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
      <span>{label}</span>
      {strong ? <strong>{`${formatDayKeyLong(day)} ${day.slice(0, 4)}`}</strong> : <span>{`${formatDayKeyLong(day)} ${day.slice(0, 4)}`}</span>}
    </div>
  );
}
