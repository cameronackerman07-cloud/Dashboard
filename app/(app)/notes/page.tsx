import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { SubjectOptions } from "@/components/SubjectSelect";
import { matchSubject } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/time";
import { createNote } from "./actions";

export const metadata: Metadata = { title: "Notes" };

type Props = { searchParams: Promise<{ q?: string; subject?: string }> };

type NoteRow = { id: string; title: string; body: string; subject: string | null; pinned: boolean; updated_at: string };

function snippet(body: string) {
  const s = body.trim().replace(/\s+/g, " ");
  if (!s) return "Empty";
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

export default async function NotesPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const subject = matchSubject(params.subject);

  const supabase = await createClient();
  let query = supabase
    .from("notes")
    .select("id, title, body, subject, pinned, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (subject) query = query.eq("subject", subject);
  const { data } = await query;

  // Search title and body here rather than in the query, so any characters work.
  const needle = q.toLowerCase();
  const notes = ((data ?? []) as NoteRow[]).filter(
    (n) => !needle || n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle),
  );
  const filtering = !!q || !!subject;

  return (
    <main className="main main-narrow">
      <PageHeader icon="notes" title="Notes" lede="Quick notes, saved to your account and reachable on any device." />

      <section className="card" aria-label="Find a note">
        <form className="track-fields" action="/notes" method="get" role="search">
          <input name="q" className="input" defaultValue={q} placeholder="Search titles and notes" aria-label="Search notes" type="search" />
          <select name="subject" className="input" defaultValue={subject ?? ""} aria-label="Filter by subject">
            <option value="">All subjects</option>
            <SubjectOptions />
          </select>
          <button type="submit" className="btn">
            Search
          </button>
        </form>
        <div className="note-actions">
          <form action={createNote}>
            <button type="submit" className="btn btn-dark">
              New note
            </button>
          </form>
          {filtering ? (
            <Link href="/notes" className="card-link">
              Clear search
            </Link>
          ) : null}
        </div>
      </section>

      <section className="card" aria-label="Your notes">
        <div className="card-head">
          <h2 className="card-title">{filtering ? "Matching notes" : "All notes"}</h2>
          <span className="card-meta">{notes.length}</span>
        </div>
        {notes.length === 0 ? (
          <p className="track-empty">{filtering ? "No notes match." : "No notes yet. Tap New note to start one."}</p>
        ) : (
          <div className="track-list">
            {notes.map((n) => (
              <Link href={`/notes/${n.id}`} className="note-link" key={n.id}>
                <span className="task-title">
                  {n.pinned ? <span className="chip pin-chip">PINNED</span> : null}
                  {n.title || "Untitled"}
                </span>
                <span className="task-sub">
                  {[n.subject, formatShortDate(new Date(n.updated_at).getTime())].filter(Boolean).join(" · ")}
                </span>
                <span className="note-snippet">{snippet(n.body)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
