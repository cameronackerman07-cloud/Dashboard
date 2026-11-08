"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ModelPicker, useAiModel } from "@/components/ModelPicker";
import { SubjectSelect } from "@/components/SubjectSelect";
import { ReplyLine, useAction } from "@/components/useAction";
import type { AiModelOption } from "@/lib/ai";
import { GENERAL, intervalLabel, nextReview, type Rating } from "@/lib/flashcards";
import { COURSES } from "@/lib/nav";
import {
  checkDuplicatesNow,
  createCard,
  deleteCard,
  restoreCard,
  reviewCard,
  updateCard,
  type CardFields,
} from "./actions";

export type Card = {
  id: string;
  subject: string;
  module: string | null;
  topic: string | null;
  front: string;
  back: string;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
};

export type ArchivedCard = { id: string; subject: string; front: string; keptFront: string | null };

type Group = { subject: string; module?: string; topic?: string };
type Session = { label: string; queue: string[]; total: number; done: number };

const RATINGS: { rating: Rating; label: string; key: string }[] = [
  { rating: "again", label: "Again", key: "1" },
  { rating: "hard", label: "Hard", key: "2" },
  { rating: "good", label: "Good", key: "3" },
  { rating: "easy", label: "Easy", key: "4" },
];

const moduleOf = (c: Card) => c.module || GENERAL;
const topicOf = (c: Card) => c.topic || GENERAL;

function inGroup(c: Card, g: Group) {
  return c.subject === g.subject && (g.module === undefined || moduleOf(c) === g.module) && (g.topic === undefined || topicOf(c) === g.topic);
}

function groupLabel(g: Group) {
  return [g.subject, g.module, g.topic].filter(Boolean).join(" › ");
}

// Due cards first (most overdue first), then the rest.
function studyOrder(list: Card[], now: number): string[] {
  const due = (c: Card) => new Date(c.due_at).getTime() <= now;
  return [...list]
    .sort((a, b) => Number(due(b)) - Number(due(a)) || a.due_at.localeCompare(b.due_at))
    .map((c) => c.id);
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type Props = {
  cards: Card[];
  archived: ArchivedCard[];
  now: number;
  openSubject: string | null;
  syllabus: Record<string, string[]>;
  models: AiModelOption[];
  aiReady: boolean;
};

export function FlashcardsClient({ cards: initial, archived, now, openSubject, syllabus, models, aiReady }: Props) {
  const [cards, setCards] = useState(initial);
  const [session, setSession] = useState<Session | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [listing, setListing] = useState<Group | null>(openSubject ? { subject: openSubject } : null);
  const [status, setStatus] = useState("");
  const [, startTransition] = useTransition();

  // Fresh data from the server (after an add, edit or duplicate check) wins.
  useEffect(() => setCards(initial), [initial]);

  const isDue = (c: Card) => new Date(c.due_at).getTime() <= now;
  const dueCount = cards.filter(isDue).length;

  const tree = useMemo(() => {
    const subjects = new Map<string, Map<string, Map<string, Card[]>>>();
    for (const c of cards) {
      const mods = subjects.get(c.subject) ?? new Map<string, Map<string, Card[]>>();
      const tops = mods.get(moduleOf(c)) ?? new Map<string, Card[]>();
      tops.set(topicOf(c), [...(tops.get(topicOf(c)) ?? []), c]);
      mods.set(moduleOf(c), tops);
      subjects.set(c.subject, mods);
    }
    // Your courses first, then everything else alphabetically.
    const rank = (s: string) => (COURSES.includes(s) ? COURSES.indexOf(s) : 100);
    return [...subjects.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [cards]);

  function start(label: string, ids: string[]) {
    if (ids.length === 0) {
      setStatus("No cards to study there.");
      return;
    }
    setStatus("");
    setRevealed(false);
    setSession({ label, queue: ids, total: ids.length, done: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const current = session ? cards.find((c) => c.id === session.queue[0]) : undefined;

  function rate(card: Card, rating: Rating) {
    const schedule = nextReview(card, rating, Date.now());
    setRevealed(false);
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, ...schedule, reps: c.reps + 1 } : c)));
    // "Again" goes to the back of this session's pile.
    setSession((s) => {
      if (!s) return s;
      const rest = s.queue.slice(1);
      return { ...s, queue: rating === "again" ? [...rest, card.id] : rest, done: rating === "again" ? s.done : s.done + 1 };
    });
    startTransition(async () => {
      let saved = false;
      try {
        saved = await reviewCard(card.id, rating);
      } catch {
        // Handled below.
      }
      if (!saved) setStatus("A review couldn't be saved, so that card will come back next time.");
    });
  }

  // Keyboard: Space or Enter shows the answer, 1-4 rate it, Escape stops.
  useEffect(() => {
    if (!session) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        setSession(null);
        return;
      }
      if (!current) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      const r = RATINGS.find((x) => x.key === e.key);
      if (revealed && r) {
        e.preventDefault();
        rate(current, r.rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <section className="card" aria-label="Study">
        {session ? (
          <div className="fc">
            <div className="card-head">
              <span className="card-meta">{session.label}</span>
              <button type="button" className="btn btn-small" onClick={() => setSession(null)}>
                Stop
              </button>
            </div>
            {current ? (
              <>
                <div className="fc-progress" aria-label={`${session.done} of ${session.total} done`}>
                  <div style={{ width: `${(session.done / session.total) * 100}%` }} />
                </div>
                <div className="fc-tags">
                  <span className="chip-outline">{current.subject}</span>
                  <span className="card-meta">
                    {moduleOf(current)} › {topicOf(current)}
                  </span>
                  <span className="card-meta fc-left">{session.queue.length} left</span>
                </div>
                <button
                  type="button"
                  className="fc-face"
                  onClick={() => setRevealed(true)}
                  aria-label={revealed ? "Question" : "Question. Tap to show the answer"}
                  disabled={revealed}
                >
                  <span className="fc-front">{current.front}</span>
                  {revealed ? null : <span className="card-meta">Tap to show the answer · Space</span>}
                </button>
                {revealed ? (
                  <>
                    <p className="bubble-text fc-back" aria-live="polite">
                      {current.back}
                    </p>
                    <div className="fc-rates" role="group" aria-label="How well did you know it?">
                      {RATINGS.map(({ rating, label, key }) => (
                        <button key={rating} type="button" className="btn fc-rate" onClick={() => rate(current, rating)}>
                          {label}
                          <span className="card-meta">
                            {intervalLabel(nextReview(current, rating, now))}
                            <span className="desktop-only"> · {key}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <button type="button" className="btn btn-dark fc-show" onClick={() => setRevealed(true)}>
                    Show answer
                  </button>
                )}
              </>
            ) : (
              <div className="fc-done">
                <h2 className="card-title">Done: {session.total} card{session.total === 1 ? "" : "s"} studied</h2>
                <button type="button" className="btn btn-dark" onClick={() => setSession(null)}>
                  Finish
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="card-head">
              <h2 className="card-title">Study</h2>
              <span className="card-meta">
                {dueCount} due · {cards.length} cards
              </span>
            </div>
            {cards.length === 0 ? (
              <p className="track-empty">
                No flashcards yet. Upload notes in <Link href="/summaries">Summaries</Link> and cards are made for you, or
                make your own below. Mistakes in <Link href="/hsc-practice">HSC practice</Link> become cards too.
              </p>
            ) : (
              <div className="study-buttons">
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={() => start("Due cards", studyOrder(cards.filter(isDue), now))}
                  disabled={dueCount === 0}
                >
                  Study due cards ({dueCount})
                </button>
                <button type="button" className="btn" onClick={() => start("All cards", studyOrder(cards, now))}>
                  Study all cards ({cards.length})
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => start("20 random cards", shuffle(cards.map((c) => c.id)).slice(0, 20))}
                >
                  Random 20
                </button>
              </div>
            )}
          </>
        )}
        {status ? (
          <p className="ai-error" role="alert">
            {status}
          </p>
        ) : null}
      </section>

      {tree.length > 0 ? (
        <section className="card" aria-label="Browse cards">
          <div className="card-head">
            <h2 className="card-title">Browse</h2>
            <span className="card-meta">Subject › module › topic</span>
          </div>
          <div className="fc-tree">
            {tree.map(([subject, mods]) => {
              const subjectCards = cards.filter((c) => c.subject === subject);
              return (
                <details key={subject} className="fc-subject" open={openSubject === subject || tree.length === 1}>
                  <summary>
                    <span className="fc-node-name">{subject}</span>
                    <Counts list={subjectCards} isDue={isDue} />
                  </summary>
                  <GroupButtons
                    onStudy={() => start(groupLabel({ subject }), studyOrder(subjectCards, now))}
                    onList={() => setListing({ subject })}
                  />
                  {[...mods.entries()]
                    .sort(([a], [b]) => (a === GENERAL ? 1 : b === GENERAL ? -1 : a.localeCompare(b)))
                    .map(([module, tops]) => {
                      const moduleCards = [...tops.values()].flat();
                      return (
                        <details key={module} className="fc-module">
                          <summary>
                            <span className="fc-node-name">{module}</span>
                            <Counts list={moduleCards} isDue={isDue} />
                          </summary>
                          <GroupButtons
                            onStudy={() => start(groupLabel({ subject, module }), studyOrder(moduleCards, now))}
                            onList={() => setListing({ subject, module })}
                          />
                          <div className="fc-topics">
                            {[...tops.entries()]
                              .sort(([a], [b]) => (a === GENERAL ? 1 : b === GENERAL ? -1 : a.localeCompare(b)))
                              .map(([topic, list]) => (
                                <div className="fc-topic" key={topic}>
                                  <div className="task-body">
                                    <span className="task-title">{topic}</span>
                                    <Counts list={list} isDue={isDue} />
                                  </div>
                                  <GroupButtons
                                    onStudy={() => start(groupLabel({ subject, module, topic }), studyOrder(list, now))}
                                    onList={() => setListing({ subject, module, topic })}
                                  />
                                </div>
                              ))}
                          </div>
                        </details>
                      );
                    })}
                </details>
              );
            })}
          </div>
        </section>
      ) : null}

      {listing ? (
        <CardList
          group={listing}
          cards={cards.filter((c) => inGroup(c, listing))}
          allCards={cards}
          syllabus={syllabus}
          now={now}
          onClose={() => setListing(null)}
          onStudy={(ids) => start(groupLabel(listing), ids)}
          onChanged={(id, fields) =>
            setCards((all) => (fields ? all.map((c) => (c.id === id ? { ...c, ...fields } : c)) : all.filter((c) => c.id !== id)))
          }
        />
      ) : null}

      <AddCard
        allCards={cards}
        syllabus={syllabus}
        defaultSubject={listing?.subject ?? openSubject ?? COURSES[0]}
        onAdded={(card) => setCards((all) => [card, ...all])}
      />

      <Duplicates archived={archived} models={models} aiReady={aiReady} />
    </>
  );
}

function Counts({ list, isDue }: { list: Card[]; isDue: (c: Card) => boolean }) {
  const due = list.filter(isDue).length;
  return (
    <span className="card-meta fc-counts">
      {list.length} card{list.length === 1 ? "" : "s"}
      {due ? ` · ${due} due` : ""}
    </span>
  );
}

function GroupButtons({ onStudy, onList }: { onStudy: () => void; onList: () => void }) {
  return (
    <div className="row-actions fc-group-actions">
      <button type="button" className="btn btn-small" onClick={onStudy}>
        Study
      </button>
      <button type="button" className="btn btn-small" onClick={onList}>
        Cards
      </button>
    </div>
  );
}

// Text fields for a card: subject, module and topic with suggestions, question, answer.
function CardFieldsForm({
  card,
  allCards,
  syllabus,
  defaultSubject,
}: {
  card?: Card;
  allCards: Card[];
  syllabus: Record<string, string[]>;
  defaultSubject: string;
}) {
  const [subject, setSubject] = useState(card?.subject ?? defaultSubject);
  const modules = [...new Set([...(syllabus[subject] ?? []), ...allCards.filter((c) => c.subject === subject && c.module).map((c) => c.module!)])];
  const topics = [...new Set(allCards.filter((c) => c.subject === subject && c.topic).map((c) => c.topic!))];
  const id = card?.id ?? "new";
  return (
    <>
      <div className="track-fields">
        <SubjectSelect emptyLabel={null} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input name="module" className="input" list={`mods-${id}`} placeholder="Module (optional)" aria-label="Module" maxLength={120} defaultValue={card?.module ?? ""} />
        <datalist id={`mods-${id}`}>
          {modules.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input name="topic" className="input" list={`tops-${id}`} placeholder="Topic (optional)" aria-label="Topic" maxLength={120} defaultValue={card?.topic ?? ""} />
        <datalist id={`tops-${id}`}>
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <textarea name="front" className="input" placeholder="Question (front)" aria-label="Question" rows={3} maxLength={2500} required defaultValue={card?.front} />
      <textarea name="back" className="input" placeholder="Answer (back)" aria-label="Answer" rows={3} maxLength={2500} required defaultValue={card?.back} />
    </>
  );
}

function fieldsFrom(form: FormData): CardFields {
  const get = (k: string) => String(form.get(k) ?? "");
  return { subject: get("subject"), module: get("module"), topic: get("topic"), front: get("front"), back: get("back") };
}

function CardList({
  group,
  cards,
  allCards,
  syllabus,
  now,
  onClose,
  onStudy,
  onChanged,
}: {
  group: Group;
  cards: Card[];
  allCards: Card[];
  syllabus: Record<string, string[]>;
  now: number;
  onClose: () => void;
  onStudy: (ids: string[]) => void;
  onChanged: (id: string, fields: Partial<Card> | null) => void;
}) {
  const { pending, reply, run } = useAction();
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <section className="card" aria-label="Cards in this group" id="fc-list">
      <div className="card-head">
        <h2 className="card-title">{groupLabel(group)}</h2>
        <div className="row-actions">
          <button type="button" className="btn btn-small" onClick={() => onStudy(studyOrder(cards, now))} disabled={cards.length === 0}>
            Study these
          </button>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {cards.length === 0 ? <p className="track-empty">No cards here any more.</p> : null}
      <div className="track-list">
        {cards.map((card) =>
          editId === card.id ? (
            <form
              key={card.id}
              className="track-form fc-edit"
              onSubmit={(e) => {
                e.preventDefault();
                const fields = fieldsFrom(new FormData(e.currentTarget));
                run(
                  () => updateCard(card.id, fields),
                  () => {
                    onChanged(card.id, {
                      subject: fields.subject,
                      module: fields.module.trim() || null,
                      topic: fields.topic.trim() || null,
                      front: fields.front.trim(),
                      back: fields.back.trim(),
                    });
                    setEditId(null);
                  },
                );
              }}
            >
              <CardFieldsForm card={card} allCards={allCards} syllabus={syllabus} defaultSubject={card.subject} />
              <div className="note-actions">
                <button type="submit" className="btn btn-dark" disabled={pending}>
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditId(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Delete this card?")) return;
                    run(async () => {
                      const ok = await deleteCard(card.id);
                      if (ok) onChanged(card.id, null);
                      return ok ? { ok: true, message: "Card deleted." } : { ok: false, message: "That card couldn't be deleted." };
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </form>
          ) : (
            <div className="tt-item" key={card.id}>
              <button type="button" className="task-body task-open" onClick={() => setEditId(card.id)} aria-label={`Edit or move: ${card.front}`}>
                <span className="task-title fc-list-title">{card.front}</span>
                <span className="task-sub">
                  {[group.module ? null : moduleOf(card), group.topic ? null : topicOf(card), new Date(card.due_at).getTime() <= now ? "Due now" : null]
                    .filter(Boolean)
                    .join(" · ") || " "}
                </span>
              </button>
              <button type="button" className="btn btn-small" onClick={() => setEditId(card.id)}>
                Edit
              </button>
            </div>
          ),
        )}
      </div>
      <ReplyLine reply={reply} />
    </section>
  );
}

function AddCard({
  allCards,
  syllabus,
  defaultSubject,
  onAdded,
}: {
  allCards: Card[];
  syllabus: Record<string, string[]>;
  defaultSubject: string;
  onAdded: (card: Card) => void;
}) {
  const { pending, reply, run } = useAction();
  const [key, setKey] = useState(0);
  return (
    <section className="card" aria-label="Make a flashcard">
      <h2 className="card-title">Make a flashcard</h2>
      <form
        key={key}
        className="track-form"
        onSubmit={(e) => {
          e.preventDefault();
          const fields = fieldsFrom(new FormData(e.currentTarget));
          run(
            async () => {
              const saved = await createCard(fields);
              if (!saved) return { ok: false, message: "That card couldn't be saved. Fill in both sides and try again." };
              onAdded(saved);
              return { ok: true, message: "Added. It's due now, so it's in your study pile." };
            },
            () => setKey((k) => k + 1),
          );
        }}
      >
        <CardFieldsForm allCards={allCards} syllabus={syllabus} defaultSubject={defaultSubject} />
        <div className="note-actions">
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? "Adding…" : "Add card"}
          </button>
        </div>
      </form>
      <ReplyLine reply={reply} />
    </section>
  );
}

function Duplicates({ archived, models, aiReady }: { archived: ArchivedCard[]; models: AiModelOption[]; aiReady: boolean }) {
  const { pending, reply, run } = useAction();
  const [model, setModel] = useAiModel(models);
  return (
    <section className="card" aria-label="Duplicates">
      <div className="card-head">
        <h2 className="card-title">Duplicates</h2>
        <span className="card-meta">Checked automatically every morning</span>
      </div>
      <p className="track-empty">
        Cards that ask the same question are hidden, keeping the one you&apos;ve practised most. Only the questions are sent to
        the AI.
      </p>
      {aiReady && models.length > 0 ? <ModelPicker models={models} value={model} onChange={setModel} /> : null}
      <div className="note-actions">
        <button type="button" className="btn" disabled={pending} onClick={() => run(() => checkDuplicatesNow(model))}>
          {pending ? "Checking…" : "Check for duplicates now"}
        </button>
        {!aiReady ? <span className="card-meta">Without an AI key, only exact copies are found.</span> : null}
      </div>
      <ReplyLine reply={reply} />
      {archived.length > 0 ? (
        <details className="more">
          <summary>Archived duplicates ({archived.length})</summary>
          <div className="track-list">
            {archived.map((a) => (
              <div className="tt-item" key={a.id}>
                <div className="task-body">
                  <span className="task-title fc-list-title">{a.front}</span>
                  <span className="task-sub fc-list-title">
                    {a.subject}
                    {a.keptFront ? ` · same as: ${a.keptFront}` : ""}
                  </span>
                </div>
                <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => restoreCard(a.id))}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
