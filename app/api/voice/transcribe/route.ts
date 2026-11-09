import { NextResponse } from "next/server";
import { markKey, recordUsage, resolveKeys, type KeySet } from "@/lib/ai-keys";
import { COURSES } from "@/lib/nav";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/supabase/server";
import { transcribe } from "@/lib/voice";

// Press-to-talk transcription with Whisper on the user's own Groq key
// (https://console.groq.com/docs/speech-to-text). The audio is read into
// memory, sent once, and dropped: never written to disk, the database,
// Storage or the logs. See lib/voice.ts.
//
// Gemini isn't used as a fallback: its audio input doesn't take the formats
// iPhones and Chrome record (audio/mp4 and audio/webm). On desktop browsers
// that have it, the page can use the browser's own speech recognition.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Spelling hints only: course names and command words. Nothing personal.
const VOCAB = `HSC, NESA, ATAR, ${COURSES.join(", ")}, The BRIAN, flashcards, study timer, study planner, to-do, Pomodoro.`;

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, message: "You've been signed out. Sign in again." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "That recording didn't come through. Try again." }, { status: 400 });
  }
  const audio = form.get("audio");
  const db = adminConfigured() ? createAdminClient() : null;
  let keys: KeySet | null = null;
  const res = await transcribe(audio instanceof Blob ? audio : null, Number(form.get("seconds") ?? 0), {
    mock: process.env.AI_MOCK === "1",
    vocab: VOCAB,
    fetch,
    clipsLastHour: async () => {
      if (!db) return 0;
      const { count } = await db.from("voice_clips").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
      return count ?? 0;
    },
    recordClip: async () => {
      if (db) await db.from("voice_clips").insert({ user_id: userId });
    },
    groqKey: async () => {
      keys = await resolveKeys(userId);
      return keys.keys.groq ?? null;
    },
    onRateLimited: async () => void (keys && (await markKey(keys, "groq", "rate_limited").catch(() => undefined))),
    onInvalidKey: async () => void (keys && (await markKey(keys, "groq", "invalid").catch(() => undefined))),
    onUsed: async () => void (keys && (await recordUsage(keys, "groq").catch(() => undefined))),
  });
  return NextResponse.json(res.body, { status: res.status });
}
