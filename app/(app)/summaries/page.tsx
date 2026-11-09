import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { aiReadyFor, availableModels } from "@/lib/ai";
import { currentUserId } from "@/lib/supabase/server";
import type { SummarySection } from "@/lib/summarise";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/time";
import { SummariesClient, type PastUpload } from "./SummariesClient";

export const metadata: Metadata = { title: "Summaries" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SummariesPage() {
  const userId = await currentUserId();
  const enabled = await aiReadyFor(userId);
  const supabase = await createClient();
  const [{ data }, models] = await Promise.all([
    supabase
      .from("uploads")
      .select("id, title, subject, filename, summary, card_count, truncated, created_at, kind, status")
      .order("created_at", { ascending: false })
      .limit(50),
    enabled ? availableModels(userId) : Promise.resolve([]),
  ]);

  const history: PastUpload[] = (data ?? []).map(
    (u: {
      id: string;
      title: string;
      subject: string | null;
      filename: string | null;
      summary: { sections?: SummarySection[] } | null;
      card_count: number;
      truncated: boolean;
      created_at: string;
      kind: string | null;
      status: string | null;
    }) => ({
      id: u.id,
      title: u.title,
      subject: u.subject,
      filename: u.filename,
      sections: u.summary?.sections ?? [],
      cardCount: u.card_count,
      truncated: u.truncated,
      date: formatShortDate(new Date(u.created_at).getTime()),
      kind: u.filename ? (u.kind ?? "pdf") : "text",
      status: u.status ?? "ready",
    }),
  );

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="summaries"
        title="Summaries"
        lede="Upload slides, notes, a worksheet or a textbook chapter (up to 25 MB). You get a summary and flashcards to keep."
      />
      {enabled ? <SummariesClient models={models} history={history} /> : <AiNotice />}
    </main>
  );
}
