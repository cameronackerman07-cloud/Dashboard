"use client";

import { useMemo, useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import type { ProposedCard, SlideSummary } from "@/lib/upload-jobs";
import { addKeptCards } from "../upload-actions";

type Section = { heading: string; points: string[]; from: number | null; to: number | null };

// Everything here is shown as plain text (React escapes it), never as HTML.
export function DeckResult({
  uploadId,
  pptx,
  keyPoints,
  sections,
  slideSummaries,
  slideTitles,
  cards,
  added,
  lowText,
  model,
}: {
  uploadId: string;
  pptx: boolean;
  keyPoints: string[];
  sections: Section[];
  slideSummaries: SlideSummary[];
  slideTitles: Record<number, string | null>;
  cards: ProposedCard[];
  added: number;
  lowText: number[];
  model: string;
}) {
  const { pending, reply, run } = useAction();
  const [keep, setKeep] = useState<Set<number>>(() => new Set(cards.map((_, i) => i)));
  const [limit, setLimit] = useState(() => Math.min(cards.length, Math.max(10, Math.round(cards.length * 0.75))));
  const bySlide = useMemo(() => new Map(slideSummaries.map((s) => [s.slide, s.bullets])), [slideSummaries]);
  const shown = cards.slice(0, limit);
  const chosen = shown.map((_, i) => i).filter((i) => keep.has(i));

  return (
    <>
      <section className="card" aria-label="Key points">
        <h2 className="card-title">Key points</h2>
        <ul className="summary-points">
          {keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        {lowText.length ? <p className="card-meta">Slides {lowText.join(", ")} were skipped: they had no text and no pictures the AI could read.</p> : null}
        {model ? <p className="card-meta">Summarised by {model}.</p> : null}
      </section>

      <section className="card" aria-label={pptx ? "Slide by slide" : "Part by part"}>
        <h2 className="card-title">{pptx ? "Slide by slide" : "Part by part"}</h2>
        {pptx ? (
          <nav className="slide-jump" aria-label="Jump to a section">
            {sections.map((s) =>
              s.from ? (
                <a key={s.heading} href={`#slide-${s.from}`} className="chip-outline">
                  {s.from}
                  {s.to && s.to !== s.from ? `–${s.to}` : ""}
                </a>
              ) : null,
            )}
          </nav>
        ) : null}
        <div className="track-list">
          {sections.map((s) => (
            <details className="upload" key={s.heading} id={s.from ? `slide-${s.from}` : undefined}>
              <summary>
                <span className="task-title">{s.heading}</span>
              </summary>
              <div className="upload-body">
                {s.from && s.to
                  ? Array.from({ length: s.to - s.from + 1 }, (_, k) => s.from! + k).map((n) =>
                      bySlide.get(n) ? (
                        <div key={n} className="summary-section">
                          <h3 className="summary-heading">
                            {pptx ? `Slide ${n}` : `Part ${n}`}
                            {slideTitles[n] ? `: ${slideTitles[n]}` : ""}
                          </h3>
                          <ul className="summary-points">
                            {bySlide.get(n)!.map((b, j) => (
                              <li key={j}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null,
                    )
                  : (
                    <ul className="summary-points">
                      {s.points.map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                  )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="card" aria-label="Flashcards">
        <div className="card-head">
          <h2 className="card-title">Flashcards</h2>
          <span className="card-meta">{added ? `${added} added so far` : `${cards.length} suggested`}</span>
        </div>
        {cards.length === 0 ? (
          <p className="track-empty">No flashcards were suggested for this file.</p>
        ) : (
          <>
            <div className="note-actions" role="group" aria-label="How many cards">
              <button type="button" className="btn btn-small" disabled={limit <= 5} onClick={() => setLimit((l) => Math.max(5, l - 5))} aria-label="Show fewer cards">
                Fewer
              </button>
              <span className="card-meta">
                Showing {shown.length} of {cards.length}
              </span>
              <button type="button" className="btn btn-small" disabled={limit >= cards.length} onClick={() => setLimit((l) => Math.min(cards.length, l + 5))} aria-label="Show more cards">
                More
              </button>
            </div>
            <div className="track-list">
              {shown.map((c, i) => (
                <label className="task card-pick" key={i}>
                  <input
                    type="checkbox"
                    className="check-input"
                    checked={keep.has(i)}
                    onChange={(e) =>
                      setKeep((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                    aria-label={`Keep card: ${c.front}`}
                  />
                  <span className="task-body">
                    <span className="task-title">{c.front}</span>
                    <span className="task-sub">{c.back}</span>
                    <span className="task-sub">{[c.module, c.topic].filter(Boolean).join(" → ")}</span>
                  </span>
                  {c.slide ? <span className="chip-outline">{pptx ? `from slide ${c.slide}` : `part ${c.slide}`}</span> : null}
                </label>
              ))}
            </div>
            <div className="note-actions">
              <button type="button" className="btn btn-dark" disabled={pending || !chosen.length} onClick={() => run(() => addKeptCards(uploadId, chosen))}>
                Add {chosen.length} card{chosen.length === 1 ? "" : "s"} to Flashcards
              </button>
              <span className="card-meta">Filed under Subject → Module → Topic. Cards you already have are skipped.</span>
            </div>
            <ReplyLine reply={reply} />
          </>
        )}
      </section>
    </>
  );
}
