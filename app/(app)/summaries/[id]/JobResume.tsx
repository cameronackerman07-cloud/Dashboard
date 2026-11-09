"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { JobRunner } from "../JobRunner";
import { startSummary } from "../upload-actions";

export function JobResume({ uploadId, status, done, total, error }: { uploadId: string; status: string; done: number; total: number; error: string | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(status === "running");
  const [message, setMessage] = useState<string | null>(null);
  if (running) return <JobRunner uploadId={uploadId} total={total} onDone={() => router.refresh()} />;
  return (
    <section className="card" aria-label="Not finished">
      <p>
        This summary isn&apos;t finished{total ? ` (${done} of ${total} parts done)` : ""}.{error ? ` ${error}` : ""}
      </p>
      <div className="note-actions">
        <button
          type="button"
          className="btn btn-dark"
          onClick={async () => {
            const res = await startSummary(uploadId, false).catch(() => ({ ok: false, message: "Couldn't reach the server." }));
            if (res.ok) setRunning(true);
            else setMessage(res.message);
          }}
        >
          {status === "queued" ? "Make summary and flashcards" : "Start again"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const res = await startSummary(uploadId, true).catch(() => ({ ok: false, message: "Couldn't reach the server." }));
            if (res.ok) setRunning(true);
            else setMessage(res.message);
          }}
        >
          Quick mode
        </button>
      </div>
      {message ? <p className="ai-error">{message}</p> : null}
    </section>
  );
}
