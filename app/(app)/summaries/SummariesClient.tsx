"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ModelPicker, useAiModel } from "@/components/ModelPicker";
import { SubjectOptions } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import type { AiModelOption } from "@/lib/ai";
import type { SummarySection } from "@/lib/summarise";
import { deleteUpload, saveSummaryToNotes, summariseUpload, type UploadReply } from "./actions";

export type PastUpload = {
  id: string;
  title: string;
  subject: string | null;
  filename: string | null;
  sections: SummarySection[];
  cardCount: number;
  truncated: boolean;
  date: string;
};

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown";

function Sections({ sections }: { sections: SummarySection[] }) {
  return (
    <div className="summary-sections">
      {sections.map((s, i) => (
        <div key={`${s.heading}-${i}`} className="summary-section">
          <h3 className="summary-heading">{s.heading}</h3>
          <ul className="summary-points">
            {s.points.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SummariesClient({ models, history }: { models: AiModelOption[]; history: PastUpload[] }) {
  const [pending, startTransition] = useTransition();
  const [model, setModel] = useAiModel(models);
  const [result, setResult] = useState<UploadReply | null>(null);
  const [fileName, setFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (hasFile && file.size > MAX_BYTES) {
      setResult({ ok: false, message: "That file is over 4 MB. Split it into smaller files, or paste the text instead." });
      return;
    }
    if (hasFile && /\.(png|jpe?g|heic|heif|webp|gif)$/i.test(file.name)) {
      setResult({ ok: false, message: "Photos are coming later. For now, upload a PDF, Word (.docx), .txt or .md file." });
      return;
    }
    if (!hasFile && String(form.get("text") ?? "").trim().length < 40) {
      setResult({ ok: false, message: "Choose a file, or paste at least a few sentences." });
      return;
    }
    if (!hasFile) form.delete("file");
    form.set("model", model);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await summariseUpload(form);
        setResult(res);
        if (res.ok) {
          formRef.current?.reset();
          setFileName("");
        }
      } catch {
        setResult({ ok: false, message: "Couldn't reach the server, or it took too long. Try again, or try a smaller file." });
      }
    });
  }

  return (
    <>
      <section className="card" aria-label="Upload">
        <h2 className="card-title">Upload a file</h2>
        <p className="privacy-note" role="note">
          Don&apos;t upload anything with personal details. Free AI models may use what you send to improve themselves, so
          only school content goes to them.
        </p>
        <form ref={formRef} className="track-form" onSubmit={submit}>
          <ModelPicker models={models} value={model} onChange={setModel} />
          <label className="field">
            <span className="field-label">Subject</span>
            <select name="subject" className="input" defaultValue="">
              <option value="">Let the AI decide</option>
              <SubjectOptions />
            </select>
          </label>
          <label className="file-drop">
            <input
              type="file"
              name="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
            <span className="file-drop-main">{fileName || "Choose a PDF, Word, .txt or .md file"}</span>
            <span className="field-help">Up to 4 MB. Photos are coming later.</span>
          </label>
          <details className="more">
            <summary>Or paste text instead</summary>
            <textarea name="text" className="input note-body" rows={8} placeholder="Paste notes, a worksheet or a passage…" aria-label="Text to summarise" />
          </details>
          <div className="note-actions">
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? "Reading and summarising…" : "Summarise and make flashcards"}
            </button>
            {pending ? <span className="card-meta">This can take up to a minute for a long file.</span> : null}
          </div>
        </form>
        {result && !result.ok ? (
          <p className="ai-error" role="alert">
            {result.message}
          </p>
        ) : null}
      </section>

      {result && result.ok ? (
        <section className="card" aria-label="Summary" role="status">
          <div className="card-head">
            <h2 className="card-title">{result.title}</h2>
            <span className="chip-outline">{result.subject}</span>
          </div>
          {result.truncated ? (
            <p className="notice">That file was long, so only the first part (about 30,000 characters) was summarised.</p>
          ) : null}
          <Sections sections={result.sections} />
          <p className="mark-cards">
            {result.cardsFailed
              ? "The summary is saved, but its flashcards couldn't be saved. Try again later."
              : `Created ${result.created} flashcard${result.created === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} skipped as duplicates)` : ""}. `}
            {result.created > 0 ? <Link href={`/flashcards?subject=${encodeURIComponent(result.subject)}`}>See them in Flashcards</Link> : null}
          </p>
          <span className="card-meta">{result.note ?? `Summarised by ${result.model}`}</span>
        </section>
      ) : null}

      <History history={history} />
    </>
  );
}

function History({ history }: { history: PastUpload[] }) {
  const { pending, reply, run } = useAction();
  const [withCards, setWithCards] = useState<Record<string, boolean>>({});

  return (
    <section className="card" aria-label="Past summaries">
      <div className="card-head">
        <h2 className="card-title">Past summaries</h2>
        <span className="card-meta">{history.length}</span>
      </div>
      {history.length === 0 ? (
        <p className="track-empty">Nothing yet. Your summaries are saved here.</p>
      ) : (
        <div className="track-list">
          {history.map((u) => (
            <details className="upload" key={u.id}>
              <summary>
                <span className="task-title">{u.title}</span>
                <span className="task-sub">
                  {[u.subject, u.date, `${u.cardCount} card${u.cardCount === 1 ? "" : "s"}`, u.filename].filter(Boolean).join(" · ")}
                </span>
              </summary>
              <div className="upload-body">
                {u.truncated ? <p className="card-meta">Only the first part of this file was summarised.</p> : null}
                <Sections sections={u.sections} />
                <div className="note-actions">
                  <Link href={`/flashcards?subject=${encodeURIComponent(u.subject ?? "")}`} className="btn btn-small">
                    Flashcards
                  </Link>
                  <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => saveSummaryToNotes(u.id))}>
                    Save to Notes
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={pending}
                    onClick={() => {
                      const cards = !!withCards[u.id];
                      const msg = cards
                        ? `Delete “${u.title}” and its ${u.cardCount} flashcards?`
                        : `Delete “${u.title}”? Its flashcards are kept.`;
                      if (window.confirm(msg)) run(() => deleteUpload(u.id, cards));
                    }}
                  >
                    Delete
                  </button>
                  {u.cardCount > 0 ? (
                    <label className="paste-replace">
                      <input
                        type="checkbox"
                        checked={!!withCards[u.id]}
                        onChange={(e) => setWithCards((m) => ({ ...m, [u.id]: e.target.checked }))}
                      />
                      Also delete its flashcards
                    </label>
                  ) : null}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
      <ReplyLine reply={reply} />
    </section>
  );
}
