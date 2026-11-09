import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { daysUntil, HSC_DATES } from "@/lib/hsc-dates";
import { hasUsableKey } from "@/lib/ai-keys";
import { ATAR_LINKS, coachSettings, courseProgress, STUDY_METHODS, type Assessment } from "@/lib/coach";
import { getMySubjects } from "@/lib/my-subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";
import { CoachClient, type AssessmentRow, type GuideRow } from "./CoachClient";

export const metadata: Metadata = { title: "Coach" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CoachPage() {
  const userId = await currentUserId();
  const supabase = await createClient();
  const [{ data: assessments }, { data: guides }, { data: coach }, aiReady] = await Promise.all([
    supabase.from("assessments").select("id, course, task, date, weighting, mark, max_mark, rank, notes").order("date", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("study_guides").select("id, course, topic, guide, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("agents").select("config").eq("slug", "school_coach").maybeSingle(),
    userId ? hasUsableKey(userId) : Promise.resolve(false),
  ]);
  const list = (assessments ?? []) as AssessmentRow[];
  const settings = coachSettings((coach?.config as Record<string, unknown> | undefined) ?? {});

  const nowMs = Date.now();
  const { data: myDates } = await supabase.from("key_dates").select("title, starts_at, kind, course").in("kind", ["exam", "trial"]).gte("starts_at", new Date(nowMs).toISOString()).order("starts_at", { ascending: true }).limit(3);
  const roadmap = [
    ...((myDates ?? []) as { title: string; starts_at: string; course: string | null }[]).map((d) => ({ label: d.course ? `${d.course} (${d.title})` : d.title, days: daysUntil(dayKey(new Date(d.starts_at).getTime()), nowMs) })),
    { label: "Exam timetable released", days: daysUntil(HSC_DATES.writtenTimetable, nowMs) },
    { label: "HSC written exams begin", days: daysUntil(HSC_DATES.writtenStart, nowMs) },
    { label: "Results released", days: daysUntil(HSC_DATES.results, nowMs) },
  ].sort((a, b) => a.days - b.days);

  return (
    <main className="main main-narrow">
      <PageHeader icon="coach" title="Coach" lede="Your marks, targets and a plan towards the ATAR you want — with study methods that work." />
      <section className="card" aria-label="Roadmap to the HSC">
        <h2 className="card-title">Roadmap</h2>
        <div className="rows">
          {roadmap.map((r) => (
            <div className="row" key={r.label} style={{ justifyContent: "space-between", gap: 12 }}>
              <span>{r.label}</span>
              <strong>{r.days > 0 ? `${r.days} days` : r.days === 0 ? "Today" : "Done"}</strong>
            </div>
          ))}
        </div>
        <p className="card-meta">
          Official dates from NSW Government. <Link href="/key-dates">Add your own exam and trial dates</Link>.
        </p>
      </section>
      {!aiReady ? <AiNotice /> : null}
      <CoachClient
        courses={await getMySubjects()}
        assessments={list}
        progress={courseProgress(list as Assessment[])}
        guides={(guides ?? []) as GuideRow[]}
        settings={settings}
        methods={STUDY_METHODS}
        atarLinks={ATAR_LINKS}
        today={dayKey(Date.now())}
      />
    </main>
  );
}
