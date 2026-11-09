import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { SummarySection } from "@/lib/summarise";
import { formatShortDate } from "@/lib/time";
import type { DeckSummary } from "@/lib/upload-jobs";
import { isUuid } from "@/lib/validate";
import { JobResume } from "./JobResume";
import { DeckResult } from "./DeckResult";

export const metadata: Metadata = { title: "Summary" };
export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await createClient();
  const [{ data: up }, { data: job }, { data: slides }] = await Promise.all([
    db.from("uploads").select("id, title, subject, filename, kind, slide_count, status, summary, card_count, notes, created_at").eq("id", id).maybeSingle(),
    db.from("upload_jobs").select("status, done_chunks, total_chunks, error").eq("upload_id", id).maybeSingle(),
    db.from("upload_slides").select("position, title").eq("upload_id", id).order("position", { ascending: true }).limit(1000),
  ]);
  if (!up) notFound();
  const summary = (up.summary ?? {}) as Partial<DeckSummary> & { sections?: (SummarySection & { from?: number; to?: number })[]; kind?: string };
  const notes = (up.notes ?? {}) as { lowTextSlides?: number[]; hiddenSlides?: number[] };
  const pptx = up.kind === "pptx";

  return (
    <main className="main main-narrow">
      <PageHeader icon={pptx ? "slides" : "summaries"} title={up.title as string} lede={[up.subject, up.filename, pptx && up.slide_count ? `${up.slide_count} slides` : null, formatShortDate(new Date(up.created_at as string).getTime())].filter(Boolean).join(" · ")} />
      <div className="note-actions">
        <Link href="/summaries" className="btn">
          ← All summaries
        </Link>
        <Link href={`/flashcards?subject=${encodeURIComponent((up.subject as string) ?? "")}`} className="btn">
          Flashcards
        </Link>
      </div>

      {up.status === "processing" || (job && job.status !== "done" && up.status !== "ready") ? (
        <JobResume uploadId={id} status={(job?.status as string) ?? "queued"} done={(job?.done_chunks as number) ?? 0} total={(job?.total_chunks as number) ?? 0} error={(job?.error as string) ?? null} />
      ) : null}
      {up.status === "failed" ? <p className="ai-error">That file couldn&apos;t be read. Try uploading it again, or save it as .pptx or PDF first.</p> : null}

      {up.status === "ready" ? (
        <DeckResult
          uploadId={id}
          pptx={pptx}
          keyPoints={summary.keyPoints ?? []}
          sections={(summary.sections ?? []).map((s) => ({ heading: s.heading, points: s.points, from: s.from ?? null, to: s.to ?? null }))}
          slideSummaries={summary.slideSummaries ?? []}
          slideTitles={Object.fromEntries(((slides ?? []) as { position: number; title: string | null }[]).map((s) => [s.position, s.title]))}
          cards={summary.cards ?? []}
          added={(up.card_count as number) ?? 0}
          lowText={notes.lowTextSlides ?? []}
          model={summary.model ?? ""}
        />
      ) : null}
    </main>
  );
}
