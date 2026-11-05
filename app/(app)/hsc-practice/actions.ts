"use server";

import { aiChat } from "@/lib/ai";

const QUESTION_SYSTEM = `You write practice questions in the authentic style of NSW HSC exams.
Match the real exam: use HSC command terms (Explain, Analyse, Calculate, Assess, Describe, etc.),
realistic wording, and a clear mark allocation. If the question has parts, label them (a), (b), ...
Output ONLY the question and its marks — never the answer or any hints.`;

const MARK_SYSTEM = `You mark a student's answer the way a NESA HSC marker would. Respond with, in order:
1. "Mark: X/Y" using the question's total.
2. "Marking criteria:" then a short list of what earns the marks (the bands/points a marker looks for).
3. "Feedback:" specific comments on the student's answer against those criteria.
4. "To improve:" one or two concrete next steps.
Be fair, accurate and encouraging. Mark the answer to the question given — do not change the question.`;

export async function generateQuestion(
  course: string,
  topic: string,
  marks: string,
): Promise<{ ok: boolean; text: string }> {
  if (!course) return { ok: false, text: "Pick a subject first." };

  try {
    const onTopic = topic.trim() ? ` on the topic "${topic.trim()}"` : "";
    const out = await aiChat(
      [
        {
          role: "user",
          content: `Write one HSC-style ${course} question${onTopic}, worth ${marks || "a few"} marks.`,
        },
      ],
      { system: QUESTION_SYSTEM, temperature: 0.7 },
    );
    return { ok: true, text: out };
  } catch {
    return { ok: false, text: "Couldn't generate a question just then. Try again in a moment." };
  }
}

export async function markAnswer(
  course: string,
  question: string,
  answer: string,
): Promise<{ ok: boolean; text: string }> {
  if (!answer.trim()) return { ok: false, text: "Write an answer first." };

  try {
    const out = await aiChat(
      [
        {
          role: "user",
          content: `Subject: ${course}.\n\nQuestion:\n${question}\n\nStudent's answer:\n${answer}`,
        },
      ],
      { system: MARK_SYSTEM, temperature: 0.2 },
    );
    return { ok: true, text: out };
  } catch {
    return { ok: false, text: "Couldn't mark it just then. Try again in a moment." };
  }
}
