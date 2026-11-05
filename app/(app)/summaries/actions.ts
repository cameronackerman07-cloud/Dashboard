"use server";

import { createNoteWith } from "@/app/(app)/notes/actions";
import { aiChat, aiErrorMessage, fallbackNote } from "@/lib/ai";
import { isSignedIn } from "@/lib/supabase/server";

const SUMMARY_SYSTEM = `You summarise a student's study material. Reply with:
1. A 2-3 sentence overview.
2. 4-8 key points as bullet lines starting with "- ".
3. If useful, a short "Remember:" line with the few things most worth memorising.
Stay faithful to the source, keep it concise and in plain English. Do not invent facts.`;

export async function summarise(
  text: string,
  course: string,
  model?: string,
): Promise<{ ok: boolean; text: string; model?: string; note?: string }> {
  const content = text.trim();
  if (content.length < 20) {
    return { ok: false, text: "Paste a bit more text to summarise." };
  }
  if (!(await isSignedIn())) {
    return { ok: false, text: "You've been signed out. Refresh the page and sign in again." };
  }

  try {
    const subjectLine = course ? `Subject: ${course}.\n\n` : "";
    const res = await aiChat(
      [{ role: "user", content: `${subjectLine}Summarise these study notes:\n\n${content}` }],
      { system: SUMMARY_SYSTEM, temperature: 0.3, model },
    );
    return { ok: true, text: res.text, model: res.modelLabel, note: fallbackNote(model, res) };
  } catch (err) {
    return { ok: false, text: aiErrorMessage(err) };
  }
}

export async function saveSummaryToNotes(
  title: string,
  body: string,
  course: string | null,
): Promise<string | null> {
  return createNoteWith(title, body, course);
}
