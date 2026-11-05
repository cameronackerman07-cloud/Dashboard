"use server";

import { aiChat, type AiMessage } from "@/lib/ai";

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

export async function askTutor(
  messages: AiMessage[],
): Promise<{ ok: boolean; text: string }> {
  if (!messages.length) return { ok: false, text: "Ask a question to get started." };

  try {
    const text = await aiChat(messages.slice(-12), {
      system: TUTOR_SYSTEM,
      temperature: 0.5,
    });
    return { ok: true, text };
  } catch {
    return {
      ok: false,
      text: "Sorry — the AI couldn't answer just then. Give it another go in a moment.",
    };
  }
}
