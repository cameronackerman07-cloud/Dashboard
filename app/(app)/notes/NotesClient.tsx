"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { createNote, deleteNote, saveNote } from "./actions";

export type Note = {
  id: string;
  title: string;
  body: string;
  course: string | null;
  updated_at: string;
};

function snippet(body: string) {
  const s = body.trim().replace(/\s+/g, " ");
  if (!s) return "Empty";
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

export function NotesClient({ notes, courses }: { notes: Note[]; courses: string[] }) {
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  function handleNew() {
    startTransition(async () => {
      const id = await createNote();
      if (id) setSelectedId(id);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteNote(id);
      setSelectedId((cur) => (cur === id ? null : cur));
    });
  }

  return (
    <div className="notes-layout">
      <section className="card notes-list" aria-label="Your notes">
        <div className="card-head">
          <h2 className="card-title">Notes</h2>
          <button type="button" className="btn-outline" onClick={handleNew}>
            <Icon name="notes" size={14} />
            New
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="track-empty" style={{ fontSize: 13 }}>
            No notes yet. Hit New to start one.
          </p>
        ) : (
          <div className="note-rows">
            {notes.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`note-row${n.id === selectedId ? " is-active" : ""}`}
                onClick={() => setSelectedId(n.id)}
              >
                <span className="note-row-title">{n.title || "Untitled"}</span>
                <span className="note-row-sub">
                  {n.course ? `${n.course} · ` : ""}
                  {snippet(n.body)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card notes-editor" aria-label="Note editor">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            courses={courses}
            onDelete={() => handleDelete(selected.id)}
          />
        ) : (
          <p className="track-empty">Select a note on the left, or create a new one.</p>
        )}
      </section>
    </div>
  );
}

function NoteEditor({
  note,
  courses,
  onDelete,
}: {
  note: Note;
  courses: string[];
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [course, setCourse] = useState(note.course ?? "");
  const [body, setBody] = useState(note.body);
  const [saving, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function handleSave() {
    startSave(async () => {
      await saveNote(note.id, { title, body, course: course || null });
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    });
  }

  return (
    <div className="note-edit">
      <input
        className="input note-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Note title"
        maxLength={200}
      />
      <select
        className="input"
        value={course}
        onChange={(e) => setCourse(e.target.value)}
        aria-label="Subject"
      >
        <option value="">No subject</option>
        {courses.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <textarea
        className="input note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your note…"
        aria-label="Note body"
        rows={14}
      />
      <div className="note-actions">
        <button type="button" className="btn btn-dark" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" onClick={onDelete}>
          Delete
        </button>
        {savedAt ? <span className="card-meta">Saved {savedAt}</span> : null}
      </div>
    </div>
  );
}
