"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { DrawingPad, type DrawingPadHandle } from "@/components/DrawingPad";
import { Icon } from "@/components/Icon";
import { ModelPicker, useAiModel } from "@/components/ModelPicker";
import { RichTextEditor, type RichTextHandle } from "@/components/RichTextEditor";
import type { AiModelOption } from "@/lib/ai";
import { bandLabel, bandOptions, LETTERS, pastPaperLinks, type BandLevel, type Mcq } from "@/lib/hsc";
import type { ParsedMarking } from "@/lib/marking";
import { generateMcqs, generateQuestion, markAnswer, saveMcqMistakes } from "./actions";

type Kind = "written" | "mcq" | "own";

const KINDS: { id: Kind; label: string }[] = [
  { id: "written", label: "Written answer" },
  { id: "mcq", label: "Multiple choice" },
  { id: "own", label: "My own question" },
];

const CONNECTION_ERROR = "Couldn't reach the server. Check your connection and try again.";

type Question = { text: string; course: string; topic: string; band: string | null; own: boolean };
type McqSet = { course: string; topic: string; band: string | null; items: Mcq[]; meta: string };

export function PracticeClient({
  courses,
  models,
}: {
  courses: string[];
  models: AiModelOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"generate" | "mark" | null>(null);
  const [model, setModel] = useAiModel(models);

  const [kind, setKind] = useState<Kind>("written");
  const [course, setCourse] = useState(courses[0] ?? "");
  const [topic, setTopic] = useState("");
  const [marks, setMarks] = useState("4");
  const [band, setBand] = useState<BandLevel>("any");
  const [count, setCount] = useState("5");
  const [ownText, setOwnText] = useState("");

  // The subject is kept with the question, so changing the dropdown afterwards
  // can't mark this answer as if it were a different subject.
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionMeta, setQuestionMeta] = useState("");
  const [mcqs, setMcqs] = useState<McqSet | null>(null);

  const [mode, setMode] = useState<"type" | "draw">("type");
  const [answer, setAnswer] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const padRef = useRef<DrawingPadHandle>(null);
  const editorRef = useRef<RichTextHandle>(null);

  const [marking, setMarking] = useState<Omit<ParsedMarking, "cards"> | null>(null);
  const [markingMeta, setMarkingMeta] = useState("");
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [cardsFailed, setCardsFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");

  const canDraw = models.some((m) => m.vision);
  const pickedCantRead = hasInk && model !== "auto" && models.some((m) => m.id === model && !m.vision);

  function resetAnswer() {
    setAnswer("");
    setHasInk(false);
    padRef.current?.clear();
    editorRef.current?.clear();
    setMarking(null);
    setMarkingMeta("");
    setSubmitStatus("");
    setCardIds([]); // a new question keeps the old question's cards
    setCardsFailed(false);
  }

  function startOver() {
    setStatus("");
    setQuestion(null);
    setQuestionMeta("");
    setMcqs(null);
    resetAnswer();
  }

  function chooseCourse(next: string) {
    setCourse(next);
    // Extension courses label bands differently, but the levels line up, so keep the choice.
  }

  function generate() {
    if (pending) return;
    startOver();

    if (kind === "own") {
      const text = ownText.trim();
      if (text.length < 10) {
        setStatus("Paste or type the question first.");
        return;
      }
      const withMarks = /\bmarks?\b/i.test(text) ? text : `${text}\n\n(${marks} marks)`;
      setQuestion({ text: withMarks, course, topic: "", band: null, own: true });
      setQuestionMeta("Your own question");
      return;
    }

    setBusy("generate");
    startTransition(async () => {
      try {
        if (kind === "mcq") {
          const res = await generateMcqs({ course, topic, band, count: Number(count), model });
          if (res.ok) {
            setMcqs({
              course,
              topic,
              band: bandLabel(course, band),
              items: res.questions,
              meta: res.note ?? `Written by ${res.model}`,
            });
          } else {
            setStatus(res.text);
          }
        } else {
          const res = await generateQuestion({ course, topic, marks, band, model });
          if (res.ok) {
            setQuestion({ text: res.text, course, topic, band: bandLabel(course, band), own: false });
            setQuestionMeta(res.note ?? `Written by ${res.model}`);
          } else {
            setStatus(res.text);
          }
        }
      } catch {
        setStatus(CONNECTION_ERROR);
      }
      setBusy(null);
    });
  }

  function submit() {
    if (pending || !question) return;
    const image = padRef.current?.toImage() ?? null;
    if (!answer.trim() && !image) {
      setSubmitStatus("Type or draw your answer first.");
      return;
    }
    setSubmitStatus("");
    setMarking(null);
    setMarkingMeta("");
    setBusy("mark");
    startTransition(async () => {
      try {
        const res = await markAnswer({
          course: question.course,
          question: question.text,
          answer,
          image,
          model,
          topic: question.topic,
          replaceCardIds: cardIds,
        });
        if (res.ok) {
          setMarking(res.marking);
          setMarkingMeta(res.note ?? `Marked by ${res.model}.`);
          setCardsFailed(res.cardsFailed);
          if (!res.cardsFailed) setCardIds(res.cardIds);
        } else {
          setSubmitStatus(res.text);
        }
      } catch {
        setSubmitStatus(CONNECTION_ERROR);
      }
      setBusy(null);
    });
  }

  const generateLabel =
    kind === "own" ? "Use this question" : busy === "generate" ? "Generating…" : "Generate";

  return (
    <>
      <section className="card" aria-label="Make a question">
        <h2 className="card-title">Practise a question</h2>
        <ModelPicker models={models} value={model} onChange={setModel} />

        <div className="seg seg-wrap" role="group" aria-label="Question type">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`seg-btn${kind === k.id ? " is-active" : ""}`}
              aria-pressed={kind === k.id}
              onClick={() => {
                setKind(k.id);
                setStatus("");
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="track-fields">
          <select className="input" value={course} onChange={(e) => chooseCourse(e.target.value)} aria-label="Subject">
            {courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {kind !== "own" ? (
            <>
              <input
                className="input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topic (optional) e.g. Projectile motion"
                aria-label="Topic"
                maxLength={120}
              />
              <select
                className="input"
                value={band}
                onChange={(e) => setBand(e.target.value as BandLevel)}
                aria-label="Band level"
              >
                {bandOptions(course).map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {kind === "mcq" ? (
            <select className="input" value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many questions">
              {["5", "10"].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          ) : (
            <select className="input" value={marks} onChange={(e) => setMarks(e.target.value)} aria-label="Marks">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "15", "20"].map((m) => (
                <option key={m} value={m}>
                  {m} {m === "1" ? "mark" : "marks"}
                </option>
              ))}
            </select>
          )}
          {kind !== "own" ? (
            <button type="button" className="btn btn-dark track-add" onClick={generate} disabled={pending}>
              {generateLabel}
            </button>
          ) : null}
        </div>

        {kind === "own" ? (
          <>
            <textarea
              className="input own-question"
              value={ownText}
              onChange={(e) => setOwnText(e.target.value)}
              placeholder="Paste or type a question from a past paper, a trial paper or your textbook…"
              aria-label="Your question"
              rows={5}
              maxLength={6000}
            />
            <div className="note-actions">
              <button type="button" className="btn btn-dark" onClick={generate} disabled={pending}>
                {generateLabel}
              </button>
              <span className="card-meta">
                If the question doesn&apos;t say how many marks it&apos;s worth, the number you picked is added.
              </span>
            </div>
          </>
        ) : null}

        {status ? (
          <p className="ai-error" role="alert">
            {status}
          </p>
        ) : null}
      </section>

      {mcqs ? (
        <McqSetCard key={mcqs.items.map((q) => q.question).join("|")} set={mcqs} onNewSet={generate} pending={pending} />
      ) : null}

      {question ? (
        <section className="card" aria-label="Question">
          <div className="card-head">
            <h2 className="card-title">Question</h2>
            <div className="fc-tags">
              {question.band ? <span className="chip-outline">{question.band}</span> : null}
              <span className="chip-outline">{question.course}</span>
            </div>
          </div>
          <p className="bubble-text">{question.text}</p>
          {questionMeta ? <span className="card-meta">{questionMeta}</span> : null}

          <div className="seg" role="group" aria-label="How to answer">
            <button
              type="button"
              className={`seg-btn${mode === "type" ? " is-active" : ""}`}
              aria-pressed={mode === "type"}
              onClick={() => setMode("type")}
            >
              Type{answer.trim() ? " ·" : ""}
            </button>
            <button
              type="button"
              className={`seg-btn${mode === "draw" ? " is-active" : ""}`}
              aria-pressed={mode === "draw"}
              onClick={() => setMode("draw")}
              disabled={!canDraw}
            >
              Draw{hasInk ? " ·" : ""}
            </button>
          </div>

          {/* Both stay mounted, so switching tabs never loses your work. */}
          <div hidden={mode !== "type"}>
            <RichTextEditor
              ref={editorRef}
              onChange={setAnswer}
              placeholder="Type your answer and working…"
              ariaLabel="Your answer"
            />
          </div>
          <div hidden={mode !== "draw"}>
            <DrawingPad ref={padRef} onInkChange={setHasInk} disabled={pending} />
          </div>

          {!canDraw ? (
            <span className="card-meta">
              Drawing needs a model that can read images. Add a GEMINI_API_KEY in Vercel to switch it on.
            </span>
          ) : answer.trim() && hasInk ? (
            <span className="card-meta">Your typed answer and your drawing will both be marked.</span>
          ) : null}
          {pickedCantRead ? (
            <span className="card-meta">
              Your picked model can&apos;t read drawings, so one that can will mark this.
            </span>
          ) : null}

          <div className="note-actions">
            <button type="button" className="btn btn-dark" onClick={submit} disabled={pending}>
              {busy === "mark" ? "Marking… (up to a minute)" : "Submit for marking"}
            </button>
          </div>
          {submitStatus ? (
            <p className="ai-error" role="alert">
              {submitStatus}
            </p>
          ) : null}
        </section>
      ) : null}

      {marking ? (
        <section className="card" aria-label="Marking">
          <div className="card-head">
            <h2 className="card-title">Marking</h2>
            {marking.score ? <span className="mark-score">{marking.score}</span> : null}
          </div>
          <div className="mark-sections">
            {marking.sections.map((s) => (
              <div className="mark-section" key={s.title}>
                <h3 className="section-label">{s.title}</h3>
                <p className="bubble-text">{s.body}</p>
              </div>
            ))}
          </div>
          {cardsFailed ? (
            <p className="ai-error" role="alert">
              Your marking is fine, but the flashcards couldn&apos;t be saved. Submit again to retry.
            </p>
          ) : cardIds.length > 0 ? (
            <p className="mark-cards">
              Added {cardIds.length === 1 ? "1 flashcard" : `${cardIds.length} flashcards`} from your
              mistakes. <Link href="/flashcards">Review flashcards</Link>
            </p>
          ) : null}
          <span className="card-meta">
            {markingMeta} AI marking can get things wrong, so check anything surprising with your
            teacher or a NESA marking guideline.
          </span>
        </section>
      ) : null}

      <section className="card" aria-label="Past papers">
        <h2 className="card-title">Past papers for {course}</h2>
        <ul className="plan-list">
          {pastPaperLinks(course).map((l) => (
            <li key={l.href}>
              <Icon name="link" size={18} />
              <span className="link-stack">
                <a href={l.href} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
                <span className="card-meta">{l.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <span className="card-meta">
          Open a paper, then choose <strong>My own question</strong> and paste a question in to answer it here
          and get it marked. The papers stay on their own sites, because they&apos;re NESA&apos;s and the
          schools&apos; copyright.
        </span>
      </section>
    </>
  );
}

function McqSetCard({
  set,
  onNewSet,
  pending,
}: {
  set: McqSet;
  onNewSet: () => void;
  pending: boolean;
}) {
  const [, startTransition] = useTransition();
  const [chosen, setChosen] = useState<(number | null)[]>(() => set.items.map(() => null));
  const [checked, setChecked] = useState(false);
  const [cardNote, setCardNote] = useState("");

  const score = set.items.filter((q, i) => chosen[i] === q.answer).length;
  const unanswered = chosen.filter((c) => c === null).length;

  function check() {
    setChecked(true);
    const mistakes = set.items.filter((q, i) => chosen[i] !== q.answer);
    if (mistakes.length === 0) {
      setCardNote("");
      return;
    }
    setCardNote("Saving your mistakes as flashcards…");
    startTransition(async () => {
      try {
        const res = await saveMcqMistakes({ course: set.course, topic: set.topic, mistakes });
        setCardNote(
          res.ok
            ? `Added ${res.count === 1 ? "1 flashcard" : `${res.count} flashcards`} from the ones you got wrong.`
            : "Your results are fine, but the flashcards couldn't be saved.",
        );
      } catch {
        setCardNote("Your results are fine, but the flashcards couldn't be saved.");
      }
    });
  }

  return (
    <section className="card" aria-label="Multiple choice">
      <div className="card-head">
        <h2 className="card-title">Multiple choice</h2>
        <div className="fc-tags">
          {set.band ? <span className="chip-outline">{set.band}</span> : null}
          <span className="chip-outline">{set.course}</span>
          {checked ? (
            <span className="mark-score">
              {score}/{set.items.length}
            </span>
          ) : null}
        </div>
      </div>
      <span className="card-meta">{set.meta}. One mark each.</span>

      <ol className="mcq-list">
        {set.items.map((q, qi) => {
          const right = chosen[qi] === q.answer;
          return (
            <li key={qi} className="mcq">
              <fieldset className="mcq-fieldset">
                <legend className="mcq-question">
                  <span className="mcq-num">{qi + 1}.</span> {q.question}
                </legend>
                <div className="mcq-options">
                  {q.options.map((option, oi) => {
                    const isAnswer = oi === q.answer;
                    const isChosen = chosen[qi] === oi;
                    const state = !checked
                      ? ""
                      : isAnswer
                        ? " is-correct"
                        : isChosen
                          ? " is-wrong"
                          : "";
                    return (
                      <label key={oi} className={`mcq-option${isChosen ? " is-chosen" : ""}${state}`}>
                        <input
                          type="radio"
                          name={`mcq-${qi}`}
                          checked={isChosen}
                          disabled={checked}
                          onChange={() => setChosen((all) => all.map((c, i) => (i === qi ? oi : c)))}
                        />
                        <span className="mcq-letter">{LETTERS[oi]}</span>
                        <span className="mcq-text">{option}</span>
                        {checked && isAnswer ? <span className="mcq-tag">Correct answer</span> : null}
                        {checked && isChosen && !isAnswer ? <span className="mcq-tag">Your answer</span> : null}
                      </label>
                    );
                  })}
                </div>
                {checked ? (
                  <p className="mcq-result">
                    <strong>
                      {right ? "Correct." : chosen[qi] === null ? "Not answered." : "Not quite."}
                    </strong>{" "}
                    {q.explanation}
                  </p>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="note-actions">
        {checked ? (
          <button type="button" className="btn btn-dark" onClick={onNewSet} disabled={pending}>
            {pending ? "Generating…" : "New set"}
          </button>
        ) : (
          <button type="button" className="btn btn-dark" onClick={check}>
            Check answers
          </button>
        )}
        {!checked && unanswered > 0 ? (
          <span className="card-meta">
            {unanswered} not answered yet. Unanswered questions count as wrong.
          </span>
        ) : null}
      </div>
      {checked && cardNote ? (
        <p className="mark-cards" role="status">
          {cardNote} {cardNote.startsWith("Added") ? <Link href="/flashcards">Review flashcards</Link> : null}
        </p>
      ) : null}
    </section>
  );
}
