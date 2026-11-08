import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { hasUsableKey } from "@/lib/ai-keys";
import { ATAR_LINKS, coachSettings, courseProgress, STUDY_METHODS, type Assessment } from "@/lib/coach";
import { COURSES } from "@/lib/nav";
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

  return (
    <main className="main main-narrow">
      <PageHeader icon="coach" title="Coach" lede="Your marks, targets and a plan towards the ATAR you want — with study methods that work." />
      {!aiReady ? <AiNotice /> : null}
      <CoachClient
        courses={COURSES}
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
