"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubjectOptions } from "@/components/SubjectSelect";
import { MAX_DIRECT_UPLOAD_BYTES, sizeText, uploadKind } from "@/lib/upload-files";
import type { Estimate } from "@/lib/upload-jobs";
import { JobRunner } from "./JobRunner";
import { prepareUploaded, requestUpload, startSummary } from "./upload-actions";

const ACCEPT = ".pptx,.ppsx,.pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.heic,.heif,image/*";

// Sends the file straight to Supabase Storage with a progress bar (never
// through Vercel), then reads it on the server and shows how many AI calls
// the summary will take before anything is sent to the AI.
function putWithProgress(url: string, file: File, onProgress: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (key) xhr.setRequestHeader("apikey", key);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

type Stage =
  | { step: "idle" }
  | { step: "uploading"; progress: number }
  | { step: "reading" }
  | { step: "estimate"; uploadId: string; estimate: Estimate; budget: number; hasKey: boolean }
  | { step: "running"; uploadId: string; total: number };

export function DirectUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [keep, setKeep] = useState(false);
  const [stage, setStage] = useState<Stage>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const busy = stage.step === "uploading" || stage.step === "reading";

  function pick(f: File | null) {
    setError(null);
    setFile(f);
    if (!f) return;
    const k = uploadKind(f.name);
    if ("error" in k) setError(k.error);
    else if (f.size > MAX_DIRECT_UPLOAD_BYTES) setError(`That file is ${sizeText(f.size)}. The limit is 25 MB: split it, or save the deck without videos.`);
  }

  async function upload() {
    if (!file || error) return;
    setError(null);
    setStage({ step: "uploading", progress: 0 });
    try {
      const ticket = await requestUpload({ name: file.name, size: file.size, subject, keepOriginal: keep });
      if (!ticket.ok) throw new Error(ticket.message);
      try {
        await putWithProgress(ticket.signedUrl, file, (p) => setStage({ step: "uploading", progress: p }));
      } catch {
        throw new Error("The upload didn't finish. Check your connection and try again.");
      }
      setStage({ step: "reading" });
      const res = await prepareUploaded(ticket.uploadId);
      if (!res.ok) throw new Error(res.message);
      setStage({ step: "estimate", uploadId: ticket.uploadId, estimate: res.estimate, budget: res.budget, hasKey: res.hasKey });
    } catch (e) {
      setStage({ step: "idle" });
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
    }
  }

  async function start(uploadId: string, quick: boolean) {
    setError(null);
    const res = await startSummary(uploadId, quick).catch(() => ({ ok: false, message: "Couldn't reach the server." }) as const);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setStage({ step: "running", uploadId, total: "total" in res ? (res.total ?? 0) : 0 });
  }

  return (
    <section className="card" aria-label="Upload a file">
      <h2 className="card-title">Upload a file</h2>
      <p className="privacy-note" role="note">
        Don&apos;t upload anything with personal details. Only the text is sent to the AI, using your own key. The original file is deleted after it&apos;s read, unless you
        keep it.
      </p>
      {stage.step === "idle" || stage.step === "uploading" || stage.step === "reading" ? (
        <div className="track-form">
          <label className="field">
            <span className="field-label">Subject</span>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy}>
              <option value="">Let the AI decide</option>
              <SubjectOptions />
            </select>
          </label>
          <label className="file-drop">
            <input type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <span className="file-drop-main">{file ? `${file.name} · ${sizeText(file.size)}` : "Choose a PowerPoint, PDF, Word, .txt or .md file"}</span>
            <span className="field-help">Up to 25 MB. PowerPoint: .pptx (save .ppt and Keynote files as .pptx first).</span>
          </label>
          <label className="paste-replace">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} disabled={busy} />
            <span>Keep original files (stored privately in your Supabase account)</span>
          </label>
          {stage.step === "uploading" ? (
            <div>
              <div className="bar" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stage.progress * 100)}>
                <span style={{ width: `${Math.round(stage.progress * 100)}%` }} />
              </div>
              <p className="card-meta">Uploading… {Math.round(stage.progress * 100)}%</p>
            </div>
          ) : null}
          {stage.step === "reading" ? (
            <p className="card-meta" role="status">
              Reading the file…
            </p>
          ) : null}
          <div className="note-actions">
            <button type="button" className="btn btn-dark" disabled={!file || !!error || busy} onClick={upload}>
              {busy ? "Working…" : "Upload and read"}
            </button>
          </div>
        </div>
      ) : null}

      {stage.step === "estimate" ? (
        <div className="estimate" role="status">
          <p>
            <strong>
              {stage.estimate.pptx ? `${stage.estimate.slides} slides read.` : "File read."}
            </strong>{" "}
            Summarising it takes about <strong>{stage.estimate.aiCalls}</strong> AI call{stage.estimate.aiCalls === 1 ? "" : "s"} (Quick mode:{" "}
            {stage.estimate.quickAiCalls}). You have {stage.budget} left today.
          </p>
          {stage.estimate.lowText.length ? (
            <p className="card-meta">
              Skipped slide{stage.estimate.lowText.length === 1 ? "" : "s"} {stage.estimate.lowText.join(", ")}: no text and no pictures the AI can read.
            </p>
          ) : null}
          {stage.estimate.hidden.length ? <p className="card-meta">Hidden slides included: {stage.estimate.hidden.join(", ")}.</p> : null}
          {stage.estimate.charts ? <p className="card-meta">{stage.estimate.charts} chart{stage.estimate.charts === 1 ? "" : "s"} read, with their real numbers (no AI needed).</p> : null}
          {stage.estimate.picturesToRead ? (
            <p className="card-meta">
              {stage.estimate.picturesToRead} picture{stage.estimate.picturesToRead === 1 ? "" : "s"} (diagrams, graphs, photos, scanned pages) will be read by a vision AI, using {stage.estimate.pictureCalls} of those calls. Logos and tiny icons are skipped. Each picture is deleted as soon as it&apos;s read; only its text is kept. Reading pictures needs a Gemini key.
            </p>
          ) : null}
          {stage.estimate.aiCalls > stage.budget ? (
            <p className="ai-error" role="alert">
              That&apos;s more than you have left today. Use Quick mode, raise your daily allowance in Settings → AI keys, or finish tomorrow: the progress is kept.
            </p>
          ) : null}
          {!stage.hasKey ? <p className="ai-error">Add a free AI key in Settings → AI keys first.</p> : null}
          <div className="note-actions">
            <button type="button" className="btn btn-dark" disabled={!stage.hasKey} onClick={() => start(stage.uploadId, false)}>
              Make summary and flashcards
            </button>
            <button type="button" className="btn" disabled={!stage.hasKey} onClick={() => start(stage.uploadId, true)}>
              Quick mode ({stage.estimate.quickAiCalls} calls)
            </button>
          </div>
        </div>
      ) : null}

      {stage.step === "running" ? <JobRunner uploadId={stage.uploadId} total={stage.total} onDone={() => router.push(`/summaries/${stage.uploadId}`)} /> : null}

      {error ? (
        <p className="ai-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
