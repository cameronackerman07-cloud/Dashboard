"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
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

export function PracticeClient({ courses }: { courses: string[] }) {
  const [pending, startTransition] = useTransition();
  const [course, setCourse] = useState(courses[0] ?? "");
  const [topic, setTopic] = useState("");
  const [marks, setMarks] = useState("4");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [marking, setMarking] = useState("");
  const [status, setStatus] = useState("");

  function gen() {
    if (pending) return;
    setStatus("");
    setMarking("");
    setAnswer("");
    setQuestion("");
    startTransition(async () => {
      const res = await generateQuestion(course, topic, marks);
      if (res.ok) setQuestion(res.text);
      else setStatus(res.text);
    });
  }

  function mark() {
    if (pending) return;
    if (!answer.trim()) {
      setStatus("Write an answer first.");
      return;
    }
    setStatus("");
    setMarking("");
    startTransition(async () => {
      const res = await markAnswer(course, question, answer);
      if (res.ok) setMarking(res.text);
      else setStatus(res.text);
    });
  }

  return (
    <>
      <section className="card" aria-label="Make a question">
        <h2 className="card-title">Practise a question</h2>
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
          <button type="button" className="btn btn-dark track-add" onClick={gen} disabled={pending}>
            {pending ? "Working…" : "Generate"}
          </button>
        </div>
        {status ? <span className="card-meta">{status}</span> : null}
      </section>

      {question ? (
        <section className="card" aria-label="Question">
          <div className="card-head">
            <h2 className="card-title">Question</h2>
            <span className="chip-outline">{course}</span>
          </div>
          <p className="bubble-text">{question}</p>
          <textarea
            className="input note-body"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write your answer…"
            aria-label="Your answer"
            rows={8}
          />
          <div className="note-actions">
            <button type="button" className="btn btn-dark" onClick={mark} disabled={pending}>
              {pending ? "Working…" : "Mark my answer"}
            </button>
          </div>
        </section>
      ) : null}

      {marking ? (
        <section className="card" aria-label="Marking">
          <div className="card-head">
            <h2 className="card-title">Marking</h2>
            <span className="card-meta">NESA-style</span>
          </div>
          <p className="bubble-text">{marking}</p>
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
