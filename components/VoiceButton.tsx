"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fastAnswer } from "@/app/(app)/voice-actions";
import { Icon } from "@/components/Icon";
import { setSpeakReplies, setSpeechRate, speak, speakReplies, speechRate, stopSpeaking } from "@/components/speech";

// Press to talk, on every page. Why it works this way: on iPhone and iPad
// Home Screen apps the browser's own speech recognition doesn't exist, and no
// website can listen all the time for a wake word. So you tap (or hold), we
// record up to 60 seconds, and Whisper on your own Groq key writes it down.
// The mic is only on while the recording indicator shows.

const MAX_SECONDS = 60;
const SEEN_KEY = "voice-notice-seen";

type State =
  | { s: "idle" }
  | { s: "notice" }
  | { s: "recording"; started: number }
  | { s: "transcribing" }
  | { s: "review"; text: string }
  | { s: "thinking"; text: string }
  | { s: "answer"; text: string; href?: string; blocked?: boolean }
  | { s: "error"; message: string; needsKey?: boolean; denied?: boolean };

type BrowserRecognition = new () => { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onerror: (() => void) | null; start: () => void };

function browserSpeech(): BrowserRecognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: BrowserRecognition; webkitSpeechRecognition?: BrowserRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function bestType(): string {
  const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  try {
    return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
  } catch {
    return "";
  }
}

export function VoiceButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ s: "idle" });
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [secure, setSecure] = useState(true);
  const [speakOn, setSpeakOn] = useState(true);
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext | null; chunks: Blob[]; cancelled: boolean; timer: number; raf: number } | null>(null);
  const pressAt = useRef(0);
  const open = state.s !== "idle";

  useEffect(() => {
    setSecure(window.isSecureContext);
    setSpeakOn(speakReplies());
    setRate(speechRate());
  }, []);

  const release = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    window.clearInterval(r.timer);
    cancelAnimationFrame(r.raf);
    r.stream.getTracks().forEach((t) => t.stop()); // the mic light goes off
    r.ctx?.close().catch(() => undefined);
    rec.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => release(), [release]);

  async function send(text: string) {
    setState({ s: "thinking", text });
    try {
      const fast = await fastAnswer(text);
      if (fast) {
        const blocked = speakOn ? !speak(fast.text, () => setSpeaking(false)) : false;
        setSpeaking(speakOn && !blocked);
        setState({ s: "answer", text: fast.text, href: fast.href, blocked });
        if (fast.href && /^Opening /.test(fast.text)) router.push(fast.href);
        else router.refresh();
        return;
      }
    } catch {
      /* fall through to the assistant */
    }
    // Everything else goes to The BRIAN, with the same preview → Apply → Undo.
    if (pathname === "/assistant") {
      window.dispatchEvent(new CustomEvent("voice:ask", { detail: { text } }));
      setState({ s: "idle" });
    } else {
      setState({ s: "idle" });
      router.push(`/assistant?q=${encodeURIComponent(text)}&voice=1`);
    }
  }

  async function upload(blob: Blob, seconds: number) {
    setState({ s: "transcribing" });
    const body = new FormData();
    body.append("audio", blob, blob.type.includes("mp4") ? "clip.m4a" : "clip.webm");
    body.append("seconds", String(Math.round(seconds)));
    try {
      const res = await fetch("/api/voice/transcribe", { method: "POST", body });
      const data = (await res.json()) as { ok: boolean; text?: string; message?: string; needsKey?: boolean };
      if (!data.ok || !data.text) setState({ s: "error", message: data.message ?? "I didn't catch that.", needsKey: data.needsKey });
      else setState({ s: "review", text: data.text });
    } catch {
      setState({ s: "error", message: "Couldn't reach the server. Check your connection." });
    }
  }

  async function start() {
    stopSpeaking();
    setSpeaking(false);
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) {
        setState({ s: "notice" });
        return;
      }
    } catch {
      /* no storage: just go */
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({ s: "error", message: "This browser can't record audio. Try Safari on iPhone, or Chrome." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const denied = (e as { name?: string }).name === "NotAllowedError";
      setState({ s: "error", denied, message: denied ? "The microphone is blocked." : "Couldn't start the microphone." });
      return;
    }
    // A fresh recorder every time: iOS can lock up a reused one after audio plays.
    const type = bestType();
    const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let last = 0;
      const loop = (t: number) => {
        if (!reduce || t - last > 300) {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          last = t;
        }
        raf = requestAnimationFrame(loop);
        if (rec.current) rec.current.raf = raf;
      };
      raf = requestAnimationFrame(loop);
    } catch {
      /* no meter, still records */
    }
    const started = Date.now();
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const cancelled = rec.current?.cancelled;
      const secs = (Date.now() - started) / 1000;
      const blob = new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" });
      release();
      if (cancelled) setState({ s: "idle" });
      else if (secs < 0.6 || blob.size < 800) setState({ s: "error", message: "That was too short. Tap, speak, then tap again." });
      else void upload(blob, secs);
    };
    const timer = window.setInterval(() => {
      const s = (Date.now() - started) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    rec.current = { recorder, stream, ctx, chunks, cancelled: false, timer, raf };
    recorder.start();
    setElapsed(0);
    setState({ s: "recording", started });
  }

  // Optional desktop fallback when there's no Groq key (not available in iPhone Home Screen apps).
  function useBrowserSpeech() {
    const SR = browserSpeech();
    if (!SR) return;
    const r = new SR();
    r.lang = "en-AU";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: { results: { 0: { transcript: string } }[] }) => setState({ s: "review", text: e.results[0][0].transcript });
    r.onerror = () => setState({ s: "error", message: "The browser couldn't hear that. Try again." });
    setState({ s: "recording", started: Date.now() });
    r.start();
  }

  function stop() {
    const r = rec.current;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
  }
  function cancel() {
    if (rec.current) {
      rec.current.cancelled = true;
      stop();
    } else setState({ s: "idle" });
  }

  // Tap to start/stop; or hold and let go to stop.
  function onDown() {
    pressAt.current = Date.now();
    if (state.s !== "recording") void start();
  }
  function onUp() {
    // A long press (hold to talk) stops when you let go; a quick tap keeps it going.
    if (state.s === "recording" && Date.now() - pressAt.current > 450) stop();
  }
  function onClick() {
    if (state.s === "recording" && Date.now() - pressAt.current <= 450 && pressAt.current - state.started > 300) stop();
  }

  // Desktop keyboard shortcut: Alt+Shift+M (when you're not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.altKey && e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        if (rec.current) stop();
        else void start();
      }
    };
    const onOpen = () => void start();
    window.addEventListener("keydown", onKey);
    window.addEventListener("voice:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("voice:open", onOpen);
    };
  });

  const live =
    state.s === "recording" ? "Listening" : state.s === "transcribing" ? "Transcribing" : state.s === "thinking" ? "Thinking" : state.s === "answer" ? state.text : state.s === "error" ? state.message : "";

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {open ? (
        <section className="voice-panel" role="dialog" aria-label="Voice">
          <div className="card-head">
            <strong>{state.s === "recording" ? "Listening…" : state.s === "transcribing" ? "Writing it down…" : state.s === "thinking" ? "Thinking…" : "Voice"}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close voice"
              onClick={() => {
                stopSpeaking();
                cancel();
                setState({ s: "idle" });
              }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {state.s === "notice" ? (
            <>
              <p>Your recording goes to your own Groq account to be written down, then it&apos;s thrown away. Nothing is kept here.</p>
              <p className="card-meta">The mic is only on while the &quot;Listening&quot; bar shows. Recordings stop after 60 seconds.</p>
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => {
                  try {
                    window.localStorage.setItem(SEEN_KEY, "1");
                  } catch {
                    /* ignore */
                  }
                  void start();
                }}
              >
                Got it, start
              </button>
            </>
          ) : null}

          {state.s === "recording" ? (
            <>
              <div className="voice-meter" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} className={level * 12 > i ? "on" : ""} />
                ))}
              </div>
              <p className="card-meta">
                {Math.floor(elapsed)}s of {MAX_SECONDS}s · tap the mic again to stop
              </p>
              <div className="note-actions">
                <button type="button" className="btn btn-dark" onClick={stop} aria-label="Stop recording">
                  Done
                </button>
                <button type="button" className="btn" onClick={cancel} aria-label="Cancel recording">
                  Cancel
                </button>
              </div>
            </>
          ) : null}

          {state.s === "review" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const text = String(new FormData(e.currentTarget).get("t") ?? "").trim();
                if (text) void send(text);
              }}
              className="track-form"
            >
              <label className="field">
                <span className="field-label">Check it, then send</span>
                <textarea name="t" className="input" rows={3} defaultValue={state.text} maxLength={2000} autoFocus />
              </label>
              <div className="note-actions">
                <button type="submit" className="btn btn-dark">
                  Send
                </button>
                <button type="button" className="btn" onClick={() => setState({ s: "idle" })}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {state.s === "answer" ? (
            <>
              <p className="voice-answer">{state.text}</p>
              <div className="note-actions">
                {speaking ? (
                  <button type="button" className="btn" onClick={() => (stopSpeaking(), setSpeaking(false))} aria-label="Stop speaking">
                    <Icon name="stop" size={16} /> Stop
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => setSpeaking(speak(state.text, () => setSpeaking(false)))} aria-label="Read the answer aloud">
                    Tap to hear
                  </button>
                )}
                {state.href ? (
                  <Link href={state.href} className="btn">
                    Open
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}

          {state.s === "error" ? (
            <>
              <p className="ai-error" role="alert">
                {state.message}
              </p>
              {state.denied ? (
                <p className="card-meta">
                  On iPhone or iPad: open Settings → Apps → Safari → Microphone and choose Ask or Allow, then close and reopen the Dashboard app and tap the mic again. On a computer: click the
                  icon next to the web address and allow the microphone.
                </p>
              ) : null}
              {state.needsKey ? (
                <div className="note-actions">
                  <Link href="/settings/ai-keys" className="btn btn-dark">
                    Add a free Groq key
                  </Link>
                  {browserSpeech() ? (
                    <button type="button" className="btn" onClick={useBrowserSpeech}>
                      Use this browser&apos;s speech instead
                    </button>
                  ) : null}
                </div>
              ) : null}
              {state.needsKey && browserSpeech() ? <p className="card-meta">The browser&apos;s own speech recognition may send your audio to the browser maker (for example Google in Chrome).</p> : null}
            </>
          ) : null}

          {state.s === "answer" || state.s === "error" || state.s === "notice" ? (
            <details className="timer-help">
              <summary>Voice settings and hands-free</summary>
              <label className="paste-replace">
                <input
                  type="checkbox"
                  checked={speakOn}
                  onChange={(e) => {
                    setSpeakOn(e.target.checked);
                    setSpeakReplies(e.target.checked);
                  }}
                />
                <span>Speak replies out loud</span>
              </label>
              <label className="field">
                <span className="field-label">Speaking speed ({rate.toFixed(1)}×)</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.1}
                  value={rate}
                  onChange={(e) => {
                    setRate(Number(e.target.value));
                    setSpeechRate(Number(e.target.value));
                  }}
                />
              </label>
              <p className="card-meta">
                For hands-free, say &quot;Hey Siri, Ask The BRIAN&quot; (set it up in Settings → iPhone &amp; Siri). The site itself can&apos;t listen all the time: websites can only use
                the mic while they&apos;re open and after you tap, and iPhone web apps can&apos;t run in the background.
              </p>
            </details>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className={`voice-fab${state.s === "recording" ? " is-recording" : ""}`}
        aria-label={!secure ? "Voice needs a secure (https) connection" : state.s === "recording" ? "Stop recording" : "Talk to The BRIAN"}
        aria-pressed={state.s === "recording"}
        disabled={!secure || state.s === "transcribing" || state.s === "thinking"}
        title={secure ? "Talk (Alt+Shift+M)" : "Voice needs https"}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (state.s === "recording") stop();
            else void start();
          }
        }}
      >
        <Icon name={state.s === "recording" ? "stop" : "mic"} size={26} />
      </button>
    </>
  );
}
