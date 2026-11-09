import assert from "node:assert/strict";
import { test } from "node:test";
import { matchIntent, matchSubjectWords } from "@/lib/assistant/intents";

const PAGES = [
  { slug: "timer", label: "Timer" },
  { slug: "life", label: "My life" },
  { slug: "flashcards", label: "Flashcards" },
  { slug: "pay", label: "Pay & budget" },
];

test("timer fast paths", () => {
  assert.deepEqual(matchIntent("Start a 25 minute Physics timer", PAGES), { kind: "timer_start", minutes: 25, subject: "Physics" });
  assert.deepEqual(matchIntent("start a timer for 45 minutes for maths ext 2", PAGES), { kind: "timer_start", minutes: 45, subject: "Mathematics Extension 2" });
  assert.deepEqual(matchIntent("Start a one hour", PAGES), null);
  assert.deepEqual(matchIntent("start studying engineering for an hour", PAGES), { kind: "timer_start", minutes: 60, subject: "Engineering Studies" });
  assert.deepEqual(matchIntent("stop the timer", PAGES), { kind: "timer_stop" });
  assert.deepEqual(matchIntent("I'm done studying", PAGES), { kind: "timer_stop" });
  assert.deepEqual(matchIntent("pause", PAGES), { kind: "timer_pause" });
});

test("read-only fast paths", () => {
  assert.deepEqual(matchIntent("What's due?", PAGES), { kind: "due" });
  assert.deepEqual(matchIntent("what's on today", PAGES), { kind: "today" });
  assert.deepEqual(matchIntent("When's my next shift?", PAGES), { kind: "next_shift" });
  assert.deepEqual(matchIntent("How many hours have I studied this week?", PAGES), { kind: "study_week" });
  assert.deepEqual(matchIntent("How long until the HSC?", PAGES), { kind: "hsc" });
  assert.deepEqual(matchIntent("cleaning hours", PAGES), { kind: "cleaning" });
  assert.deepEqual(matchIntent("Open my life", PAGES), { kind: "open", page: "life" });
  assert.deepEqual(matchIntent("go to flashcards", PAGES), { kind: "open", page: "flashcards" });
});

test("everything else goes to the AI", () => {
  assert.equal(matchIntent("Explain projectile motion", PAGES), null);
  assert.equal(matchIntent("Should I go to the party Saturday night?", PAGES), null);
  assert.equal(matchIntent("open the pod bay doors", PAGES), null);
});

test("subject words", () => {
  assert.equal(matchSubjectWords("maths advanced homework"), "Mathematics Advanced");
  assert.equal(matchSubjectWords("Mathematics Extension 1"), "Mathematics Extension 1");
  assert.equal(matchSubjectWords("history"), null);
});

import fs from "node:fs";
import { transcribe, type VoiceDeps } from "@/lib/voice";

function deps(over: Partial<VoiceDeps> = {}): VoiceDeps & { clips: number; sent: number } {
  const d: VoiceDeps & { clips: number; sent: number } = {
    clips: 0,
    sent: 0,
    vocab: "HSC",
    clipsLastHour: async (): Promise<number> => d.clips,
    recordClip: async () => void d.clips++,
    groqKey: async () => "gsk_test",
    fetch: (async () => {
      d.sent++;
      return new Response(JSON.stringify({ text: " start a 25 minute physics timer " }), { status: 200 });
    }) as typeof fetch,
    ...over,
  };
  return d;
}
const clip = () => new Blob([new Uint8Array(4000)], { type: "audio/mp4" });

test("AI_MOCK gives a canned transcript without calling anything", async () => {
  const d = deps({ mock: true });
  const r = await transcribe(clip(), 3, d);
  assert.equal(r.body.text, "What's due this week?");
  assert.equal(d.sent, 0);
});

test("transcribes, and limits to 30 clips an hour", async () => {
  const d = deps();
  const r = await transcribe(clip(), 3, d);
  assert.equal(r.body.text, "start a 25 minute physics timer");
  d.clips = 30;
  const limited = await transcribe(clip(), 3, d);
  assert.equal(limited.status, 429);
  assert.equal(d.sent, 1);
});

test("Groq 429 says voice is resting; no key asks for one; long clips are refused", async () => {
  assert.match((await transcribe(clip(), 3, deps({ fetch: (async () => new Response("", { status: 429 })) as typeof fetch }))).body.message!, /resting/);
  assert.equal((await transcribe(clip(), 3, deps({ groqKey: async () => null }))).body.needsKey, true);
  assert.equal((await transcribe(clip(), 75, deps())).status, 413);
  assert.equal((await transcribe(new Blob([new Uint8Array(10)], { type: "video/quicktime" }), 2, deps())).status, 415);
});

test("audio is never written anywhere", () => {
  for (const f of ["lib/voice.ts", "app/api/voice/transcribe/route.ts", "components/VoiceButton.tsx"]) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.equal(/node:fs|writeFile|\.storage\.|localStorage\.setItem\([^)]*(audio|blob|chunk)|console\.(log|error)\([^)]*(audio|blob)/i.test(src), false, f);
  }
  const route = fs.readFileSync(new URL("../app/api/voice/transcribe/route.ts", import.meta.url), "utf8");
  // The only insert is the timestamp row.
  assert.deepEqual(route.match(/\.insert\([^)]*\)/g), ['.insert({ user_id: userId })']);
});
