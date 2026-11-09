"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SubjectSelect } from "@/components/SubjectSelect";
import { clock, elapsedSeconds, nudges, PRESETS, remainingSeconds, SESSION_KINDS, type StudySession } from "@/lib/study-time";
import { modulesFor } from "@/lib/subjects";
import { weekday } from "@/lib/time";
import { discardTimer, extendTimer, finishTimer, pauseTimer, resumeTimer, startTimer, type TimerReply } from "./actions";

export type TimerSettings = { defaultMinutes: number; breakMinutes: number; pomodoro: boolean; focus: number; short: number; long: number; sound: boolean; vibration: boolean };
export type BlockOption = { id: string; label: string; subject: string; topic: string | null; minutes: number };

const QUEUE_KEY = "timer-queue";
const BREAK_KEY = "timer-break";

type Queued = { op: "finish"; id: string; at: number };

function readQueue(): Queued[] {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    if (q.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* storage unavailable */
  }
}

// A soft two-note chime, made in the browser (no sound file).
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.35 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35);
      o.stop(ctx.currentTime + i * 0.35 + 0.65);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1500);
  } catch {
    /* no audio */
  }
}

export function TimerClient({
  initial,
  serverNow,
  settings,
  blocks,
  linkBlock,
  todaySeconds,
}: {
  initial: StudySession | null;
  serverNow: number;
  settings: TimerSettings;
  blocks: BlockOption[];
  linkBlock: string | null;
  todaySeconds: number;
}) {
  const router = useRouter();
  const [session, setSession] = useState<StudySession | null>(initial);
  const [offset, setOffset] = useState(0); // server clock minus this device's clock
  const [now, setNow] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [minutes, setMinutes] = useState(settings.pomodoro ? settings.focus : settings.defaultMinutes);
  const [custom, setCustom] = useState("");
  const preset = blocks.find((b) => b.id === linkBlock) ?? null;
  const [blockId, setBlockId] = useState<string>(preset?.id ?? "");
  const [subject, setSubject] = useState(preset?.subject ?? "Physics");
  const [topic, setTopic] = useState(preset?.topic ?? "");
  const [kind, setKind] = useState("focus");
  const [pomodoro, setPomodoro] = useState(settings.pomodoro);
  const [breakUntil, setBreakUntil] = useState<{ until: number; long: boolean; group: string | null; count: number } | null>(null);
  const alerted = useRef<string | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const focusCount = useRef(0);
  const groupRef = useRef<string | null>(null);

  useEffect(() => {
    setOffset(serverNow - Date.now());
  }, [serverNow]);
  useEffect(() => setSession(initial), [initial]);
  useEffect(() => {
    if (preset) setMinutes(preset.minutes);
    // Only on first load with ?block=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A break in progress survives a refresh.
  useEffect(() => {
    try {
      const b = JSON.parse(window.localStorage.getItem(BREAK_KEY) ?? "null");
      if (b && b.until > Date.now()) setBreakUntil(b);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [offset]);

  const apply = useCallback((res: TimerReply) => {
    setOffset(res.serverNow - Date.now());
    if ("session" in res) setSession(res.session ?? null);
    setMessage({ ok: res.ok, text: res.message });
  }, []);

  // Send any Finish that was pressed while offline.
  const flush = useCallback(async () => {
    const q = readQueue();
    if (!q.length) return;
    const left: Queued[] = [];
    for (const item of q) {
      try {
        const res = await finishTimer(item.id, item.at);
        apply(res);
      } catch {
        left.push(item);
      }
    }
    writeQueue(left);
    if (!left.length) router.refresh();
  }, [apply, router]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const running = session?.status === "running";
  const paused = session?.status === "paused";
  const remaining = session && now !== null ? remainingSeconds(session, now) : null;
  const elapsed = session && now !== null ? elapsedSeconds(session, now) : null;
  const timesUp = running && remaining !== null && remaining <= 0;

  // Keep the screen on while a timer runs.
  useEffect(() => {
    let cancelled = false;
    async function lock() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (running && nav.wakeLock && !wakeLock.current) {
          const l = await nav.wakeLock.request("screen");
          if (cancelled) await l.release();
          else wakeLock.current = l;
        }
        if (!running && wakeLock.current) {
          await wakeLock.current.release();
          wakeLock.current = null;
        }
      } catch {
        /* not supported or not allowed */
      }
    }
    lock();
    const again = () => document.visibilityState === "visible" && lock();
    document.addEventListener("visibilitychange", again);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", again);
    };
  }, [running]);

  // Page title and the time's-up chime.
  useEffect(() => {
    const base = "Timer · Dashboard";
    if (session && remaining !== null) {
      document.title = timesUp ? `Time's up · ${session.subject}` : `${clock(Math.max(0, remaining))}${paused ? " (paused)" : ""} · ${session.subject}`;
    } else if (breakUntil && now !== null) {
      document.title = `Break ${clock((breakUntil.until - now) / 1000)}`;
    } else document.title = base;
    if (timesUp && session && alerted.current !== session.id) {
      alerted.current = session.id;
      if (settings.sound) chime();
      if (settings.vibration) {
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          /* ignore */
        }
      }
    }
    if (breakUntil && now !== null && now >= breakUntil.until) {
      if (settings.sound) chime();
      setBreakUntil(null);
      try {
        window.localStorage.removeItem(BREAK_KEY);
      } catch {
        /* ignore */
      }
      setMessage({ ok: true, text: "Break's over. Ready for the next focus?" });
    }
  }, [session, remaining, timesUp, paused, settings.sound, settings.vibration, breakUntil, now]);

  useEffect(() => () => void (document.title = "Dashboard"), []);

  function run(fn: () => Promise<TimerReply>, after?: (res: TimerReply) => void) {
    setMessage(null);
    start(async () => {
      try {
        const res = await fn();
        apply(res);
        after?.(res);
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  function onStart() {
    const m = custom ? Math.round(Number(custom)) : minutes;
    if (!Number.isFinite(m) || m < 1 || m > 720) {
      setMessage({ ok: false, text: "Enter between 1 and 720 minutes." });
      return;
    }
    if (breakUntil) {
      setBreakUntil(null);
      try {
        window.localStorage.removeItem(BREAK_KEY);
      } catch {
        /* ignore */
      }
    }
    run(() => startTimer({ minutes: m, subject, topic, kind, plannerBlockId: blockId || undefined, pomodoro, groupId: pomodoro ? (groupRef.current ?? undefined) : undefined }), (res) => {
      if (res.ok && res.session) groupRef.current = res.session.group_id;
    });
  }

  function onFinish() {
    if (!session) return;
    const id = session.id;
    const at = Date.now() + offset;
    const wasPomodoro = !!session.group_id;
    setMessage(null);
    start(async () => {
      try {
        const res = await finishTimer(id, at);
        apply(res);
        router.refresh();
        if (res.ok && wasPomodoro) {
          focusCount.current += 1;
          const long = focusCount.current % 4 === 0;
          const b = { until: Date.now() + offset + (long ? settings.long : settings.short) * 60_000, long, group: groupRef.current, count: focusCount.current };
          setBreakUntil(b);
          try {
            window.localStorage.setItem(BREAK_KEY, JSON.stringify(b));
          } catch {
            /* ignore */
          }
        }
      } catch {
        // Offline: remember it and send it when the connection is back.
        writeQueue([...readQueue().filter((q) => q.id !== id), { op: "finish", id, at }]);
        setSession(null);
        setMessage({ ok: true, text: "You're offline. Your session is saved on this device and will sync when you're back online." });
      }
    });
  }

  const topics = useMemo(() => modulesFor(subject).flatMap((m) => [m.name, ...m.topics]), [subject]);
  const tips = nudges({ todaySeconds: todaySeconds + (elapsed ?? 0), isSchoolDay: now !== null && weekday(now) <= 5, openElapsed: running ? elapsed : null, breakMinutes: settings.breakMinutes });

  const total = session ? session.planned_seconds : breakUntil ? (breakUntil.long ? settings.long : settings.short) * 60 : minutes * 60;
  const left = session && remaining !== null ? Math.max(0, remaining) : breakUntil && now !== null ? Math.max(0, (breakUntil.until - now) / 1000) : (custom ? Number(custom) || 0 : minutes) * 60;
  const fraction = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0;
  const R = 108;
  const C = 2 * Math.PI * R;

  return (
    <section className="card timer-card" aria-label="Study timer">
      <div className="timer-ring" role="timer" aria-live="off" aria-label={session ? `${clock(left)} left of ${session.subject}` : "Timer"}>
        <svg viewBox="0 0 240 240" width="240" height="240" aria-hidden="true">
          <circle cx="120" cy="120" r={R} className="ring-track" />
          <circle cx="120" cy="120" r={R} className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} transform="rotate(-90 120 120)" />
        </svg>
        <div className="timer-readout">
          <span className="timer-time">{now === null ? "--:--" : timesUp ? "0:00" : clock(left)}</span>
          <span className="timer-sub">
            {session ? `${session.subject}${session.topic ? ` · ${session.topic}` : ""}${paused ? " · paused" : ""}` : breakUntil ? (breakUntil.long ? "Long break" : "Short break") : "Ready"}
          </span>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {timesUp ? "Time's up." : paused ? "Paused." : running ? "Timer running." : ""}
      </p>

      {timesUp ? (
        <div className="timer-up" role="alert">
          <strong>Time&apos;s up.</strong> Nice work. Finish to save it, or keep going.
        </div>
      ) : null}

      {session ? (
        <div className="timer-controls">
          {timesUp ? (
            <>
              <button type="button" className="btn btn-dark btn-big" disabled={pending} onClick={onFinish} aria-label="Finish and save">
                Finish
              </button>
              <button type="button" className="btn btn-big" disabled={pending} onClick={() => run(() => extendTimer(session.id, 5))} aria-label="Add 5 minutes">
                +5 min
              </button>
              <button type="button" className="btn btn-big" disabled={pending} onClick={() => run(() => extendTimer(session.id, 10))} aria-label="Add 10 minutes">
                +10 min
              </button>
              <button type="button" className="btn btn-big" disabled={pending} onClick={() => run(() => extendTimer(session.id, 15))} aria-label="Keep going for 15 more minutes">
                Keep going
              </button>
            </>
          ) : (
            <>
              {paused ? (
                <button type="button" className="btn btn-dark btn-big" disabled={pending} onClick={() => run(() => resumeTimer(session.id))} aria-label="Resume timer">
                  Resume
                </button>
              ) : (
                <button type="button" className="btn btn-dark btn-big" disabled={pending} onClick={() => run(() => pauseTimer(session.id))} aria-label="Pause timer">
                  Pause
                </button>
              )}
              <button type="button" className="btn btn-big" disabled={pending} onClick={() => run(() => extendTimer(session.id, 5))} aria-label="Add 5 minutes">
                +5 min
              </button>
              <button type="button" className="btn btn-big" disabled={pending} onClick={onFinish} aria-label="Finish and save">
                Finish
              </button>
              <button
                type="button"
                className="btn btn-big"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Discard this session? Nothing will be saved.")) run(() => discardTimer(session.id));
                }}
                aria-label="Discard this session"
              >
                Discard
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="timer-setup">
          <div className="preset-row" role="group" aria-label="Length">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-big${!custom && minutes === p ? " btn-dark" : ""}`}
                aria-pressed={!custom && minutes === p}
                onClick={() => {
                  setMinutes(p);
                  setCustom("");
                }}
              >
                {p} min
              </button>
            ))}
            <label className="field preset-custom">
              <span className="field-label">Custom (min)</span>
              <input className="input" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="e.g. 40" />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Subject</span>
              <SubjectSelect emptyLabel={null} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Topic (optional)</span>
              <input className="input" list="timer-topics" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Projectile motion" />
              <datalist id="timer-topics">
                {topics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span className="field-label">Kind</span>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                {SESSION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Planner block (optional)</span>
              <select
                className="input"
                value={blockId}
                onChange={(e) => {
                  setBlockId(e.target.value);
                  const b = blocks.find((x) => x.id === e.target.value);
                  if (b) {
                    setSubject(b.subject);
                    setTopic(b.topic ?? "");
                    setMinutes(b.minutes);
                    setCustom("");
                  }
                }}
              >
                <option value="">Not linked</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="paste-replace">
            <input type="checkbox" checked={pomodoro} onChange={(e) => setPomodoro(e.target.checked)} />
            <span>
              Pomodoro: {settings.focus} min focus, {settings.short} min breaks, a {settings.long} min break every 4th. Breaks never count.
            </span>
          </label>
          <div className="timer-controls">
            <button type="button" className="btn btn-dark btn-big" disabled={pending} onClick={onStart} aria-label="Start timer">
              {breakUntil ? "Skip break and start" : "Start"}
            </button>
            {pomodoro && !custom ? (
              <button type="button" className="btn btn-big" onClick={() => setMinutes(settings.focus)} aria-label="Use the Pomodoro focus length">
                {settings.focus} min focus
              </button>
            ) : null}
          </div>
        </div>
      )}

      {message ? (
        <p className={message.ok ? "mark-cards" : "ai-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      {tips.map((t) => (
        <p className="card-meta" key={t}>
          {t}
        </p>
      ))}
      <details className="timer-help">
        <summary>How the timer works on iPhone</summary>
        <p className="card-meta">
          The time is worked out from when you pressed Start, so refreshing, closing the tab, locking your phone or switching to your laptop doesn&apos;t lose it. A closed or asleep
          iPhone app can&apos;t run its own timer or play the chime: the &quot;Time&apos;s up&quot; alert comes as a notification from the server (turn on notifications in Settings). If you
          forget to press Finish, the session is closed for you and counts the planned time only.
        </p>
      </details>
    </section>
  );
}
