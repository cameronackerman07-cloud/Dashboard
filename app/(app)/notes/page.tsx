import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { NotesClient, type Note } from "./NotesClient";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, title, body, course, updated_at")
    .order("updated_at", { ascending: false });

  const notes: Note[] = data ?? [];

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="notes"
        title="Notes"
        lede="Quick notes, saved to your account and reachable on any device."
      />
      <NotesClient notes={notes} courses={COURSES} />
    </main>
  );
}
