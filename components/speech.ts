"use client";

// Spoken replies with the browser's own speech (free, on the device).
// iPhones only allow speech that starts from a tap, so callers start it from
// the mic flow or show a "Tap to hear" button when it's blocked.

const KEY = "voice-speak-replies";
const RATE_KEY = "voice-speech-rate";

function get(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

// On by default once you've used voice; off for typed messages unless you turn it on.
export function speakReplies(): boolean {
  return get(KEY) !== "0";
}
export function setSpeakReplies(on: boolean) {
  set(KEY, on ? "1" : "0");
}
export function speechRate(): number {
  const n = Number(get(RATE_KEY));
  return n >= 0.6 && n <= 1.6 ? n : 1;
}
export function setSpeechRate(n: number) {
  set(RATE_KEY, String(Math.min(1.6, Math.max(0.6, n))));
}

function voice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis?.getVoices?.() ?? [];
  return all.find((v) => v.lang === "en-AU") ?? all.find((v) => v.lang === "en-GB") ?? all.find((v) => v.lang.startsWith("en")) ?? null;
}

// Strips markdown-ish bits so it reads naturally.
function clean(text: string): string {
  return text.replace(/[*_#`>]+/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

// Returns false if the browser blocked it (no speech, or not started by a tap).
export function speak(text: string, onEnd?: () => void): boolean {
  try {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean(text));
    const v = voice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "en-AU";
    u.rate = speechRate();
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
