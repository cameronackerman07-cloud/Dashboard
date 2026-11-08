import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";
import { NoteEditor } from "./NoteEditor";

export const metadata: Metadata = { title: "Note" };

type Props = { params: Promise<{ id: string }> };

export default async function NotePage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, title, body, subject, pinned, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <main className="main main-narrow">
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
        <Link href="/" style={{ color: "var(--muted)" }}>
          Home
        </Link>{" "}
        /{" "}
        <Link href="/notes" style={{ color: "var(--muted)" }}>
          Notes
        </Link>{" "}
        / <span style={{ color: "var(--ink)", fontWeight: 600 }}>{data.title || "Untitled"}</span>
      </nav>
      <NoteEditor
        note={{
          id: data.id,
          title: data.title,
          body: data.body,
          subject: data.subject,
          pinned: !!data.pinned,
        }}
      />
    </main>
  );
}
