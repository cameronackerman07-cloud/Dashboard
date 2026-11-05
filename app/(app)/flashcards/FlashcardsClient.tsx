"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { intervalLabel, nextReview, type Rating } from "@/lib/flashcards";
import { createCard, deleteCard, reviewCard } from "./actions";

export type Card = {
  id: string;
  course: string | null;
  topic: string | null;
  front: string;
  back: string;
  due_at: string | null;
  interval_days: number;
  ease: number;
};

const RATINGS: { rating: Rating; label: string }[] = [
  { rating: "again", label: "Again" },
  { rating: "hard", label: "Hard" },
  { rating: "good", label: "Good" },
  { rating: "easy", label: "Easy" },
];

const DAY_MS = 86_400_000;

function isDue(card: Card, now: number) {
  return !card.due_at || new Date(card.due_at).getTime() <= now;
}

// `now` comes from the server render, so this text is the same on server and browser.
function dueLabel(card: Card, now: number) {
  if (isDue(card, now)) return "Due now";
  const days = Math.round((new Date(card.due_at!).getTime() - now) / DAY_MS);
  return days <= 1 ? "Due within a day" : `Due in ${days} days`;
}

export function FlashcardsClient({
  cards: initial,
  now,
  courses: allCourses,
}: {
  cards: Card[];
  now: number;
  courses: string[];
}) {
  const [, startTransition] = useTransition();
  const [adding, startAdding] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [addStatus, setAddStatus] = useState("");
  const [cards, setCards] = useState(initial);
  const [queue, setQueue] = useState(() => initial.filter((c) => isDue(c, now)).map((c) => c.id));
  const [revealed, setRevealed] = useState(false);
  const [course, setCourse] = useState("");
  const [status, setStatus] = useState("");

  const courses = [...new Set(cards.map((c) => c.course).filter((c): c is string => !!c))].sort();
  const inCourse = (card: Card) => !course || card.course === course;

  const dueNow = queue
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => !!c && inCourse(c));
  const current = dueNow[0];
  const listed = cards.filter(inCourse);

  function rate(card: Card, rating: Rating) {
    const schedule = nextReview(card, rating, Date.now());
    setStatus("");
    setRevealed(false);
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, ...schedule } : c)));
    // "Again" goes to the back of today's pile, so you see it again this session.
    setQueue((ids) => {
      const rest = ids.filter((id) => id !== card.id);
      return rating === "again" ? [...rest, card.id] : rest;
    });
    startTransition(async () => {
      let saved = false;
      try {
        saved = await reviewCard(card.id, rating);
      } catch {
        // Handled below, the same as the server saying no.
      }
      if (!saved) setStatus("That review couldn't be saved, so this card will come back next time.");
    });
  }

  function remove(card: Card) {
    setStatus("");
    if (current?.id === card.id) setRevealed(false);
    setCards((all) => all.filter((c) => c.id !== card.id));
    setQueue((ids) => ids.filter((id) => id !== card.id));
    startTransition(async () => {
      let deleted = false;
      try {
        deleted = await deleteCard(card.id);
      } catch {
        // Handled below, the same as the server saying no.
      }
      if (!deleted) setStatus("That card couldn't be deleted. Refresh the page and try again.");
    });
  }

  function add(formData: FormData) {
    const card = {
      course: String(formData.get("course") ?? "") || null,
      topic: String(formData.get("topic") ?? "").trim() || null,
      front: String(formData.get("front") ?? "").trim(),
      back: String(formData.get("back") ?? "").trim(),
    };
    if (!card.front || !card.back) {
      setAddStatus("Fill in both the question and the answer.");
      return;
    }
    setAddStatus("");
    startAdding(async () => {
      let saved: Awaited<ReturnType<typeof createCard>> = null;
      try {
        saved = await createCard(card);
      } catch {
        // Handled below, the same as the server saying no.
      }
      if (!saved) {
        setAddStatus("That card couldn't be saved. Check your connection and try again.");
        return;
      }
      const created: Card = { ...card, id: saved.id, due_at: saved.due_at, interval_days: 0, ease: 2.5 };
      setCards((all) => [created, ...all]);
      setQueue((ids) => [...ids, created.id]);
      formRef.current?.reset();
      setAddStatus("Added. It's in your review pile now.");
    });
  }

  const addForm = (
    <section className="card" aria-label="Make a flashcard">
      <h2 className="card-title">Make a flashcard</h2>
      <form ref={formRef} action={add} className="track-form">
        <div className="track-fields">
          <select name="course" className="input" aria-label="Subject" defaultValue="">
            <option value="">No subject</option>
            {allCourses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input name="topic" className="input" placeholder="Topic (optional)" aria-label="Topic" maxLength={120} />
        </div>
        <textarea
          name="front"
          className="input"
          placeholder="Question (front of the card)"
          aria-label="Question"
          rows={3}
          maxLength={2500}
          required
        />
        <textarea
          name="back"
          className="input"
          placeholder="Answer (back of the card)"
          aria-label="Answer"
          rows={3}
          maxLength={2500}
          required
        />
        <div className="note-actions">
          <button type="submit" className="btn btn-dark" disabled={adding}>
            {adding ? "Adding…" : "Add card"}
          </button>
          {addStatus ? (
            <span className="card-meta" role="status">
              {addStatus}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );

  if (cards.length === 0) {
    return (
      <>
        <section className="card" aria-label="No flashcards yet">
          <h2 className="card-title">No flashcards yet</h2>
          <p className="track-empty">
            Make your own below. When you lose marks in <Link href="/hsc-practice">HSC practice</Link>,
            what you got wrong turns into flashcards here automatically too.
          </p>
        </section>
        {addForm}
      </>
    );
  }

  return (
    <>
      <section className="card" aria-label="Review">
        <div className="card-head">
          <h2 className="card-title">Review</h2>
          <span className="card-meta">{dueNow.length === 1 ? "1 card due" : `${dueNow.length} cards due`}</span>
        </div>

        {courses.length > 0 ? (
          <select
            className="input"
            aria-label="Filter by subject"
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              setRevealed(false);
            }}
          >
            <option value="">All subjects</option>
            {courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}

        {current ? (
          <div className="fc">
            <div className="fc-tags">
              {current.course ? <span className="chip-outline">{current.course}</span> : null}
              {current.topic ? <span className="card-meta">{current.topic}</span> : null}
            </div>
            <p className="fc-front">{current.front}</p>
            {revealed ? (
              <>
                <p className="bubble-text fc-back">{current.back}</p>
                <div className="fc-rates" role="group" aria-label="How well did you know it?">
                  {RATINGS.map(({ rating, label }) => (
                    <button key={rating} type="button" className="btn fc-rate" onClick={() => rate(current, rating)}>
                      {label}
                      <span className="card-meta">{intervalLabel(nextReview(current, rating, now))}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="note-actions">
                <button type="button" className="btn btn-dark" onClick={() => setRevealed(true)}>
                  Show answer
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="track-empty">All done for now. Cards come back when they&apos;re due.</p>
        )}

        {status ? (
          <p className="ai-error" role="alert">
            {status}
          </p>
        ) : null}
      </section>

      {addForm}

      <section className="card" aria-label="All flashcards">
        <div className="card-head">
          <h2 className="card-title">All cards</h2>
          <span className="card-meta">{listed.length}</span>
        </div>
        <div className="track-list">
          {listed.map((card) => (
            <div className="tt-item" key={card.id}>
              <div className="task-body">
                <span className="task-title fc-list-title">{card.front}</span>
                <span className="task-sub">
                  {[card.course, card.topic, dueLabel(card, now)].filter(Boolean).join(" · ")}
                </span>
              </div>
              <button type="button" className="task-del" aria-label="Delete flashcard" onClick={() => remove(card)}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
