import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { aiConfigured, availableModels } from "@/lib/ai";
import { matchSubject, SYLLABUS } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/server";
import { FlashcardsClient, type ArchivedCard, type Card } from "./FlashcardsClient";

export const metadata: Metadata = { title: "Flashcards" };
// "Check for duplicates now" asks the AI, which can take a while.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { searchParams: Promise<{ subject?: string }> };

export default async function FlashcardsPage({ searchParams }: Props) {
  const { subject } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: archived }, models] = await Promise.all([
    supabase
      .from("flashcards")
      .select("id, subject, module, topic, front, back, due_at, interval_days, ease, reps")
      .is("duplicate_of", null)
      .order("due_at", { ascending: true })
      .limit(3000),
    supabase
      .from("flashcards")
      .select("id, subject, front, duplicate_of, deduped_at")
      .not("duplicate_of", "is", null)
      .order("deduped_at", { ascending: false })
      .limit(300),
    aiConfigured() ? availableModels() : Promise.resolve([]),
  ]);

  const cards: Card[] = ((data ?? []) as Card[]).map((c) => ({ ...c, ease: Number(c.ease) }));
  const fronts = new Map(cards.map((c) => [c.id, c.front]));
  const hidden: ArchivedCard[] = ((archived ?? []) as { id: string; subject: string; front: string; duplicate_of: string }[]).map(
    (a) => ({ id: a.id, subject: a.subject, front: a.front, keptFront: fronts.get(a.duplicate_of) ?? null }),
  );

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="cards"
        title="Flashcards"
        lede="Every card, by subject, module and topic. Cards you struggle with come back sooner."
      />
      <FlashcardsClient
        cards={cards}
        archived={hidden}
        now={Date.now()}
        openSubject={matchSubject(subject)}
        syllabus={Object.fromEntries(Object.entries(SYLLABUS).map(([s, mods]) => [s, mods.map((m) => m.name)]))}
        models={models}
        aiReady={aiConfigured()}
      />
    </main>
  );
}
