"use server";

import { createNoteWith } from "@/app/(app)/notes/actions";
import { aiChat } from "@/lib/ai";

const SUMMARY_SYSTEM = `You summarise a student's study material. Reply with:
1. A 2-3 sentence overview.
2. 4-8 key points as bullet lines starting with "- ".
3. If useful, a short "Remember:" line with the few things most worth memorising.
Stay faithful to the source, keep it concise and in plain English. Do not invent facts.`;

export async function summarise(
  text: string,
  course: string,
): Promise<{ ok: boolean; text: string }> {
  const content = text.trim();
  if (content.length < 20) {
    return { ok: false, text: "Paste a bit more text to summarise." };
  }

  try {
    const subjectLine = course ? `Subject: ${course}.\n\n` : "";
    const out = await aiChat(
      [{ role: "user", content: `${subjectLine}Summarise these study notes:\n\n${content}` }],
      { system: SUMMARY_SYSTEM, temperature: 0.3 },
    );
    return { ok: true, text: out };
  } catch {
    return { ok: false, text: "Sorry — couldn't summarise just then. Try again in a moment." };
  }
}

export async function saveSummaryToNotes(
  title: string,
  body: string,
  course: string | null,
): Promise<string | null> {
  return createNoteWith(title, body, course);
}
