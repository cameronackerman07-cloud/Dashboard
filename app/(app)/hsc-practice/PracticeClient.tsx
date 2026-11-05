"use client";

import { useRef, useState, useTransition } from "react";
import { DrawingPad, type DrawingPadHandle } from "@/components/DrawingPad";
import { Icon } from "@/components/Icon";
import { ModelPicker, useAiModel } from "@/components/ModelPicker";
import type { AiModelOption } from "@/lib/ai";
import type { ParsedMarking } from "@/lib/marking";
import { generateQuestion, markAnswer } from "./actions";

const NESA_LINKS = [
  {
    label: "NESA HSC past exam papers",
    href: "https://www.educationstandards.nsw.edu.au/wps/portal/nesa/11-12/resources/hsc-exam-papers",
  },
  {
    label: "NSW syllabuses & marking guidelines",
    href: "https://curriculum.nsw.edu.au/",
  },
];

const CONNECTION_ERROR = "Couldn't reach the server. Check your connection and try again.";

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

  const [course, setCourse] = useState(courses[0] ?? "");
  const [topic, setTopic] = useState("");
  const [marks, setMarks] = useState("4");

  // The subject is kept with the question, so changing the dropdown afterwards
  // can't mark this answer as if it were a different subject.
  const [question, setQuestion] = useState<{ text: string; course: string } | null>(null);
  const [questionMeta, setQuestionMeta] = useState("");

  const [mode, setMode] = useState<"type" | "draw">("type");
  const [answer, setAnswer] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const padRef = useRef<DrawingPadHandle>(null);

  const [marking, setMarking] = useState<ParsedMarking | null>(null);
  const [markingMeta, setMarkingMeta] = useState("");
  const [status, setStatus] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");

  const canDraw = models.some((m) => m.vision);
  const pickedCantRead = hasInk && model !== "auto" && models.some((m) => m.id === model && !m.vision);

  function resetAnswer() {
    setAnswer("");
    setHasInk(false);
    padRef.current?.clear();
    setMarking(null);
    setMarkingMeta("");
    setSubmitStatus("");
  }

  function generate() {
    if (pending) return;
    setStatus("");
    setQuestion(null);
    setQuestionMeta("");
    resetAnswer();
    setBusy("generate");
    startTransition(async () => {
      try {
        const res = await generateQuestion(course, topic, marks, model);
        if (res.ok) {
          setQuestion({ text: res.text, course });
          setQuestionMeta(res.note ?? `Written by ${res.model}`);
        } else {
          setStatus(res.text);
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
        });
        if (res.ok) {
          setMarking(res.marking);
          setMarkingMeta(res.note ?? `Marked by ${res.model}.`);
        } else {
          setSubmitStatus(res.text);
        }
      } catch {
        setSubmitStatus(CONNECTION_ERROR);
      }
      setBusy(null);
    });
  }

  return (
    <>
      <section className="card" aria-label="Make a question">
        <h2 className="card-title">Practise a question</h2>
        <ModelPicker models={models} value={model} onChange={setModel} />
        <div className="track-fields">
          <select className="input" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Subject">
            {courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional) e.g. Projectile motion"
            aria-label="Topic"
            maxLength={120}
          />
          <select className="input" value={marks} onChange={(e) => setMarks(e.target.value)} aria-label="Marks">
            {["2", "3", "4", "5", "6", "8"].map((m) => (
              <option key={m} value={m}>
                {m} marks
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-dark track-add" onClick={generate} disabled={pending}>
            {busy === "generate" ? "Generating…" : "Generate"}
          </button>
        </div>
        {status ? (
          <p className="ai-error" role="alert">
            {status}
          </p>
        ) : null}
      </section>

      {question ? (
        <section className="card" aria-label="Question">
          <div className="card-head">
            <h2 className="card-title">Question</h2>
            <span className="chip-outline">{question.course}</span>
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
            <textarea
              className="input note-body answer-box"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer and working…"
              aria-label="Your answer"
              rows={8}
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
          <span className="card-meta">
            {markingMeta} AI marking can get things wrong, so check anything surprising with your
            teacher or a NESA marking guideline.
          </span>
        </section>
      ) : null}

      <section className="card" aria-label="Official resources">
        <h2 className="card-title">Official NESA resources</h2>
        <ul className="plan-list">
          {NESA_LINKS.map((l) => (
            <li key={l.href}>
              <Icon name="link" size={18} />
              <a href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <span className="card-meta">Opens on the official NESA / NSW Curriculum site in a new tab.</span>
      </section>
    </>
  );
}
