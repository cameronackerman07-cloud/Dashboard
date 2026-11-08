"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubjectSelect } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import { deleteNote, saveNote, setPinned } from "../actions";

type Note = { id: string; title: string; body: string; subject: string | null; pinned: boolean };

export function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [subject, setSubject] = useState(note.subject ?? "");
  const [body, setBody] = useState(note.body);
  const { pending, reply, setReply, run } = useAction();
  const dirty = title !== note.title || body !== note.body || subject !== (note.subject ?? "");

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save() {
    run(() => saveNote(note.id, { title, body, subject }));
  }

  return (
    <section className="card note-edit" aria-label="Edit note">
      <input
        className="input note-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setReply(null);
        }}
        placeholder="Title"
        aria-label="Note title"
        maxLength={200}
      />
      <SubjectSelect value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea
        className="input note-body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setReply(null);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            save();
          }
        }}
        placeholder="Write your note…"
        aria-label="Note"
        rows={16}
      />
      <div className="note-actions">
        <button type="button" className="btn btn-dark" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => run(() => setPinned(note.id, !note.pinned))}>
          {note.pinned ? "Unpin" : "Pin to top"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete “${note.title || "Untitled"}”? This can't be undone.`)) run(() => deleteNote(note.id));
          }}
        >
          Delete
        </button>
        <Link href="/notes" className="card-link">
          All notes
        </Link>
        {dirty && !pending ? <span className="card-meta">Unsaved changes</span> : null}
      </div>
      <ReplyLine reply={reply} />
    </section>
  );
}
