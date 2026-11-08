import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { QUESTIONS, writingStats, type Questionnaire } from "@/lib/about-me";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient, type FactRow, type SampleRow, type Switches } from "./ProfileClient";

export const metadata: Metadata = { title: "About me" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ProfilePage() {
  const supabase = await createClient();
  const [{ data: facts, error }, { data: samples }, { data: settings }] = await Promise.all([
    supabase.from("profile_facts").select("id, category, text, source, origin, confidence, status, created_at").order("created_at", { ascending: false }).limit(300),
    supabase.from("writing_samples").select("id, title, text, include_in_ai, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("profile_settings").select("*").maybeSingle(),
  ]);
  const s = (settings ?? {}) as Partial<Switches> & { questionnaire?: Partial<Questionnaire> };
  const sampleRows = (samples ?? []) as (SampleRow & { text: string })[];
  const stats = s.use_style ? writingStats(sampleRows.map((x) => x.text)) : null;

  return (
    <main className="main main-narrow">
      <PageHeader icon="profile" title="About me" lede="What the app remembers about how you study and like to be spoken to. You're in control: confirm, edit, reject or delete anything." />
      <ProfileClient
        ready={!error}
        facts={(facts ?? []) as FactRow[]}
        samples={sampleRows.map(({ id, title, include_in_ai, created_at, text }) => ({ id, title, include_in_ai, created_at, words: text.split(/\s+/).length }))}
        switches={{ use_behaviour: !!s.use_behaviour, use_samples: !!s.use_samples, include_notes: !!s.include_notes, use_style: !!s.use_style, ai_pass: !!s.ai_pass }}
        questionnaire={s.questionnaire ?? {}}
        questions={QUESTIONS.map((q) => ({ key: q.key, label: q.label }))}
        stats={stats}
      />
    </main>
  );
}
