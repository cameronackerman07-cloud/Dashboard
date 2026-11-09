"use client";

import { useEffect, useRef, useState } from "react";

type Step = { status: "running" | "done" | "failed" | "busy"; done: number; total: number; label: string; error?: string };

// Calls the step route over and over (one chunk each) and shows progress.
// Closing the page doesn't lose work: the 30-minute tick carries on, and
// opening the summary again picks up where it stopped.
export function JobRunner({ uploadId, total, onDone }: { uploadId: string; total: number; onDone: () => void }) {
  const [state, setState] = useState<Step>({ status: "running", done: 0, total, label: "Starting…" });
  const [paused, setPaused] = useState(false);
  const fails = useRef(0);

  useEffect(() => {
    let stop = false;
    async function loop() {
      while (!stop) {
        if (paused) return;
        let res: Step;
        try {
          const r = await fetch(`/api/summaries/${uploadId}/step`, { method: "POST" });
          res = (await r.json()) as Step;
        } catch {
          res = { status: "running", done: state.done, total: state.total, label: state.label, error: "Connection lost. Retrying…" };
        }
        if (stop) return;
        setState(res);
        if (res.status === "done") {
          onDone();
          return;
        }
        if (res.status === "failed") return;
        if (res.error) {
          fails.current++;
          if (fails.current >= 3) {
            setPaused(true);
            return;
          }
          await new Promise((r) => setTimeout(r, 4000 * fails.current));
        } else {
          fails.current = 0;
          if (res.status === "busy") await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
    loop();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId, paused]);

  const pct = state.total ? Math.round((state.done / (state.total + 1)) * 100) : 0;
  return (
    <div className="estimate" aria-live="polite">
      <div className="bar" role="progressbar" aria-label="Summary progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="card-meta">{state.label}</p>
      {state.error ? (
        <p className="ai-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {paused ? (
        <div className="note-actions">
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              fails.current = 0;
              setPaused(false);
            }}
          >
            Try again
          </button>
          <span className="card-meta">Your progress is saved. You can also come back later.</span>
        </div>
      ) : (
        <p className="card-meta">You can leave this page: it keeps going in the background (within about 30 minutes) and you&apos;ll find it under Past summaries.</p>
      )}
    </div>
  );
}
