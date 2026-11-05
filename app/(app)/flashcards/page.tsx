import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { FlashcardsClient, type Card } from "./FlashcardsClient";

export const metadata: Metadata = { title: "Flashcards" };

export default async function FlashcardsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("flashcards")
    .select("id, course, topic, front, back, due_at, interval_days, ease")
    .order("due_at", { ascending: true, nullsFirst: true })
    .limit(500);

  const cards: Card[] = data ?? [];

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="cards"
        title="Flashcards"
        lede="Your own cards, plus what you got wrong in HSC practice. Cards you struggle with come back sooner."
      />
      <FlashcardsClient cards={cards} now={Date.now()} courses={COURSES} />
    </main>
  );
}
