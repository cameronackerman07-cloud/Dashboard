// Voice transcription core, separate from the route so it can be tested with
// fakes. The audio stays in memory: it's sent once to Groq and never written
// to disk, the database, Storage or logs.

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_SECONDS = 60;
export const PER_HOUR = 30;
export const MODEL = "whisper-large-v3-turbo";
export const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const TYPES = ["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav"];

export type VoiceDeps = {
  clipsLastHour: () => Promise<number>;
  recordClip: () => Promise<void>; // a timestamp only
  groqKey: () => Promise<string | null>;
  fetch: typeof fetch;
  onRateLimited?: () => Promise<void>;
  onInvalidKey?: () => Promise<void>;
  onUsed?: () => Promise<void>;
  vocab: string;
  mock?: boolean;
};

export type VoiceResult = { status: number; body: { ok: boolean; text?: string; message?: string; needsKey?: boolean } };

const fail = (status: number, message: string, extra: Record<string, unknown> = {}): VoiceResult => ({ status, body: { ok: false, message, ...extra } });

export async function transcribe(audio: Blob | null, seconds: number, deps: VoiceDeps): Promise<VoiceResult> {
  if (!audio || audio.size === 0) return fail(400, "Nothing was recorded. Try again.");
  if (audio.size > MAX_AUDIO_BYTES || (Number.isFinite(seconds) && seconds > MAX_SECONDS + 2)) return fail(413, "That recording is too long. Keep it under a minute.");
  const type = (audio.type || "").split(";")[0].toLowerCase();
  if (type && !TYPES.includes(type)) return fail(415, "That audio format isn't supported.");
  if (deps.mock) return { status: 200, body: { ok: true, text: "What's due this week?" } };

  if ((await deps.clipsLastHour()) >= PER_HOUR) return fail(429, "That's 30 voice clips this hour. Voice is resting for a bit; you can still type.");
  await deps.recordClip();

  const key = await deps.groqKey();
  if (!key) return fail(400, "Add a free Groq key in Settings → AI keys to use voice.", { needsKey: true });

  const ext = type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : type.includes("wav") ? "wav" : "m4a";
  const form = new FormData();
  form.append("file", audio, `clip.${ext}`);
  form.append("model", MODEL);
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("prompt", deps.vocab);

  let res: Response;
  try {
    res = await deps.fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(25_000), cache: "no-store" });
  } catch {
    return fail(502, "Couldn't reach the voice service. Check your connection and try again.");
  }
  if (res.status === 429) {
    await deps.onRateLimited?.();
    return fail(429, "Voice is resting for a minute (your free Groq limit). Try again shortly, or type instead.");
  }
  if (res.status === 401 || res.status === 403) {
    await deps.onInvalidKey?.();
    return fail(400, "Your Groq key didn't work. Check it in Settings → AI keys.");
  }
  if (!res.ok) return fail(502, "The voice service couldn't read that. Try again.");
  const data = (await res.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof data.text === "string" ? data.text.trim().slice(0, 2000) : "";
  await deps.onUsed?.();
  if (!text) return fail(422, "I didn't catch that. Try again a little closer to the mic.");
  return { status: 200, body: { ok: true, text } };
}
