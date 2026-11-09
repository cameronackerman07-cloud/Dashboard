"use client";

import { useState, useTransition } from "react";
import { saveSchool } from "@/app/welcome/actions";
import { choicesFor, coreFor, MAX_MY_SUBJECTS, YEARS, type YearLevel } from "@/lib/subjects";

// Pick your year, then tick your subjects. The core subjects for your year are
// ticked for you; electives are grouped the way NESA groups them.
export function YearSubjects({
  year: startYear,
  subjects: startSubjects,
  askName = false,
  onSaved,
  saveLabel = "Save",
}: {
  year: YearLevel | null;
  subjects: string[];
  askName?: boolean;
  onSaved?: () => void;
  saveLabel?: string;
}) {
  const [year, setYear] = useState<YearLevel | null>(startYear);
  const [picked, setPicked] = useState<string[]>(startSubjects);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  function chooseYear(y: YearLevel) {
    setYear(y);
    const allowed = new Set([...coreFor(y), ...choicesFor(y).flatMap((g) => g.subjects)]);
    // Keep what still fits the new year and tick the core subjects.
    setPicked((p) => [...new Set([...coreFor(y), ...p.filter((s) => allowed.has(s))])]);
    setMessage(null);
  }

  function toggle(s: string) {
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= MAX_MY_SUBJECTS ? p : [...p, s]));
  }

  function save() {
    if (!year) return setMessage({ ok: false, text: "Pick your year first." });
    if (picked.length === 0) return setMessage({ ok: false, text: "Tick at least one subject." });
    start(async () => {
      try {
        const res = await saveSchool({ year, subjects: picked, name: askName ? name : undefined });
        setMessage({ ok: res.ok, text: res.message });
        if (res.ok) onSaved?.();
      } catch {
        setMessage({ ok: false, text: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  const core = year ? coreFor(year) : [];
  const groups = year ? choicesFor(year) : [];
  const seen = new Set(core);

  return (
    <div className="ys">
      {askName ? (
        <label className="field">
          <span className="field-label">Your name (optional)</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="What should the dashboard call you?" />
        </label>
      ) : null}

      <fieldset className="ys-group">
        <legend className="field-label">What year are you in?</legend>
        <div className="ys-years" role="radiogroup" aria-label="Year">
          {YEARS.map((y) => (
            <button key={y} type="button" role="radio" aria-checked={year === y} className={`ys-chip${year === y ? " is-on" : ""}`} onClick={() => chooseYear(y)}>
              Year {y}
            </button>
          ))}
        </div>
      </fieldset>

      {year ? (
        <>
          {core.length ? (
            <fieldset className="ys-group">
              <legend className="field-label">Core subjects (everyone in Year {year} does these)</legend>
              <div className="ys-chips">
                {core.map((s) => (
                  <Tick key={s} s={s} on={picked.includes(s)} toggle={toggle} />
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="field-help">Years 11–12: tick the courses you&apos;re doing, including your English course.</p>
          )}
          {groups.map((g) => {
            const list = g.subjects.filter((s) => !seen.has(s) && (seen.add(s), true));
            return list.length ? (
              <fieldset className="ys-group" key={g.label}>
                <legend className="field-label">{g.label}</legend>
                <div className="ys-chips">
                  {list.map((s) => (
                    <Tick key={s} s={s} on={picked.includes(s)} toggle={toggle} />
                  ))}
                </div>
              </fieldset>
            ) : null;
          })}
          <p className="field-help">
            {picked.length} picked{picked.length >= MAX_MY_SUBJECTS ? ` (the most is ${MAX_MY_SUBJECTS})` : ""}. Subject names follow the NESA syllabuses; if NESA has a new name for a course, both are listed, so pick the one your school uses.
          </p>
        </>
      ) : null}

      {message ? (
        <p className={message.ok ? "card-meta" : "auth-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      <div>
        <button type="button" className="btn btn-dark" onClick={save} disabled={busy}>
          {busy ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

function Tick({ s, on, toggle }: { s: string; on: boolean; toggle: (s: string) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className={`ys-chip${on ? " is-on" : ""}`} onClick={() => toggle(s)}>
      {on ? "✓ " : ""}
      {s}
    </button>
  );
}
