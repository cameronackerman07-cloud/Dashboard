"use server";

import { aiChat, aiErrorMessage, fallbackNote } from "@/lib/ai";
import { currentUserId } from "@/lib/supabase/server";

const TUTOR_SYSTEM = `You are a warm, patient tutor for a student in Year 11 doing the NSW HSC.
Their subjects are: Engineering Studies, Mathematics Advanced, Mathematics Extension 1,
Mathematics Extension 2, Physics, VET Entertainment and English Standard.

How to help:
- Give a hint or ask a guiding question first. Help them get there themselves.
- Only give the full worked solution when the student clearly asks for it.
- Show steps clearly and keep explanations concise and plain-English.
- For maths, lay out working line by line.
- If a question is unrelated to study, gently steer back.
Never ask for personal information.`;

export type TutorMessage = { role: "user" | "assistant"; content: string };

export async function askTutor(
  messages: TutorMessage[],
  model?: string,
): Promise<{ ok: boolean; text: string; model?: string; note?: string }> {
  if (!messages.length) return { ok: false, text: "Ask a question to get started." };
  const userId = await currentUserId();
  if (!userId) {
    return { ok: false, text: "You've been signed out. Refresh the page and sign in again." };
  }

  try {
    const res = await aiChat(
      messages.slice(-12).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content),
      })),
      { userId, purpose: "tutor", system: TUTOR_SYSTEM, temperature: 0.5, model },
    );
    return { ok: true, text: res.text, model: res.modelLabel, note: fallbackNote(model, res) };
  } catch (err) {
    return { ok: false, text: aiErrorMessage(err) };
  }
}
