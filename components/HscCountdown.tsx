"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countdownLabel, daysUntil, HSC_DATES, weeksAndDays } from "@/lib/hsc-dates";
import { dayKey, formatDayKeyLong } from "@/lib/time";

export type CountdownDate = { id: string; title: string; day: string; kind: string; course: string | null };

// Home's HSC countdown. Days are counted in Sydney and the card re-checks every
// minute, so the number changes at Sydney midnight even if the page stays open.
export function HscCountdown({ serverNow, firstExam, dates, totalStudy, released }: { serverNow: number; firstExam: CountdownDate | null; dates: CountdownDate[]; totalStudy: string; released: boolean }) {
  const [now, setNow] = useState(serverNow);
  const [mode, setMode] = useState<"official" | "mine">("official");
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    setNow(Date.now());
    try {
      if (window.localStorage.getItem("hsc-countdown-mode") === "mine" && firstExam) setMode("mine");
    } catch {
      /* ignore */
    }
    return () => clearInterval(id);
  }, [firstExam]);

  function pick(m: "official" | "mine") {
    setMode(m);
    try {
      window.localStorage.setItem("hsc-countdown-mode", m);
    } catch {
      /* ignore */
    }
  }

  const official = countdownLabel(now);
  const mine = firstExam ? daysUntil(firstExam.day, now) : null;
  const showMine = mode === "mine" && firstExam && mine !== null;
  const days = showMine ? mine! : official.days;
  const label = showMine ? `Your first exam: ${firstExam!.course ?? firstExam!.title}` : "HSC written exams begin (first possible exam day)";
  const date = showMine ? `${formatDayKeyLong(firstExam!.day)} ${firstExam!.day.slice(0, 4)}` : official.date;
  const sr = showMine ? `${days} days until your first HSC exam, ${firstExam!.course ?? firstExam!.title}, on ${date}` : official.sr;
  const today = dayKey(now);

  return (
    <section className="card hsc-card" aria-label="HSC countdown">
      <div className="card-head">
        <h2 className="card-title">HSC countdown</h2>
        <Link href="/key-dates" className="card-link">
          Key dates →
        </Link>
      </div>
      {firstExam ? (
        <div className="seg" role="group" aria-label="Count down to">
          <button type="button" className={`seg-btn${mode === "official" ? " is-active" : ""}`} aria-pressed={mode === "official"} onClick={() => pick("official")}>
            First exam day
          </button>
          <button type="button" className={`seg-btn${mode === "mine" ? " is-active" : ""}`} aria-pressed={mode === "mine"} onClick={() => pick("mine")}>
            My first exam
          </button>
        </div>
      ) : null}
      <p className="sr-only">{sr}</p>
      <div aria-hidden="true" className="hsc-big">
        <span className="big-number hsc-number">{Math.max(0, days)}</span>
        <span className="hsc-unit">days</span>
      </div>
      <div aria-hidden="true">
        <div style={{ fontWeight: 600 }}>{weeksAndDays(days)}</div>
        <div className="card-meta">
          {label} · {date}
        </div>
      </div>
      {dates.length ? (
        <div className="rows" style={{ borderTop: "1px solid var(--line-soft)" }}>
          {dates
            .filter((d) => d.day >= today)
            .slice(0, 4)
            .map((d) => {
              const n = daysUntil(d.day, now);
              return (
                <div className="row" style={{ justifyContent: "space-between" }} key={d.id}>
                  <span>{d.course ?? d.title}</span>
                  <strong>{n === 0 ? "Today" : `${n} day${n === 1 ? "" : "s"}`}</strong>
                </div>
              );
            })}
        </div>
      ) : null}
      {!firstExam ? (
        <p className="card-meta">
          {released ? (
            <>
              Your exam timetable is out. <Link href="/key-dates">Add your exam dates</Link>.
            </>
          ) : (
            `Enter your dates after NESA releases the timetable on ${formatDayKeyLong(HSC_DATES.writtenTimetable)} 2027.`
          )}
        </p>
      ) : null}
      <p className="card-meta">
        External study so far: <strong>{totalStudy}</strong> · <Link href="/timer">Timer</Link>
      </p>
    </section>
  );
}
