"use server";

import { revalidatePath } from "next/cache";
import { aiErrorMessage } from "@/lib/ai";
import { dedupeUser } from "@/lib/dedupe";
import { nextReview, normKey, type Rating } from "@/lib/flashcards";
import { cleanSubject } from "@/lib/subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid, optionalText, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// RLS keeps every row scoped to the signed-in user.

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];
const MAX_SIDE = 2500;

export async function reviewCard(id: string, rating: Rating): Promise<boolean> {
  if (!isUuid(id) || !RATINGS.includes(rating)) return false;

  const supabase = await createClient();
  const { data: card } = await supabase
    .from("flashcards")
    .select("interval_days, ease, reps, lapses")
    .eq("id", id)
    .maybeSingle();
  if (!card) return false;

  const { error } = await supabase
    .from("flashcards")
    .update({
      ...nextReview({ interval_days: card.interval_days, ease: Number(card.ease) }, rating, Date.now()),
      reps: (card.reps ?? 0) + 1,
      lapses: (card.lapses ?? 0) + (rating === "again" ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

export type CardFields = { subject: string; module: string; topic: string; front: string; back: string };

function clean(input: CardFields) {
  const front = String(input.front ?? "").trim();
  const back = String(input.back ?? "").trim();
  return {
    subject: cleanSubject(input.subject),
    module: optionalText(input.module, 120),
    topic: optionalText(input.topic, 120),
    front,
    back,
    norm_key: normKey(front),
    ok: !!front && !!back && front.length <= MAX_SIDE && back.length <= MAX_SIDE,
  };
}

export type SavedCard = {
  id: string;
  subject: string;
  module: string | null;
  topic: string | null;
  front: string;
  back: string;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
};

// Your own card. It's due straight away, so you can study it now.
export async function createCard(input: CardFields): Promise<SavedCard | null> {
  const c = clean(input);
  if (!c.ok || !(await currentUserId())) return null;
  const supabase = await createClient();
  const dueAt = new Date().toISOString();
  const { ok: _ok, ...row } = c;
  const { data, error } = await supabase
    .from("flashcards")
    .insert({ ...row, due_at: dueAt })
    .select("id")
    .single();
  if (error || !data) return null;
  revalidatePath("/flashcards");
  return { id: data.id as string, ...row, due_at: dueAt, interval_days: 0, ease: 2.5, reps: 0 };
}

// Edit a card, or move it to another subject, module or topic.
export async function updateCard(id: string, input: CardFields): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const c = clean(input);
  if (!c.ok) return { ok: false, message: "Fill in both the question and the answer." };
  const supabase = await createClient();
  const { ok: _ok, ...row } = c;
  const { error } = await supabase
    .from("flashcards")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/flashcards");
  return { ok: true, message: "Card saved." };
}

export async function deleteCard(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  revalidatePath("/flashcards");
  return !error;
}

// Brings back a card the duplicate check hid. It stays marked as checked, so
// it won't be hidden again.
export async function restoreCard(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase
    .from("flashcards")
    .update({ duplicate_of: null, deduped_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/flashcards");
  return { ok: true, message: "Card restored." };
}

// The same duplicate check the daily job runs, for just you, right now.
export async function checkDuplicatesNow(model?: string): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  try {
    const supabase = await createClient();
    const s = await dedupeUser(supabase, userId, { deadline: Date.now() + 52_000, model });
    revalidatePath("/flashcards");
    const hidden = s.exact + s.similar;
    if (s.subjects === 0) return { ok: true, message: "No new cards to check since last time." };
    const base = hidden
      ? `Hid ${hidden} duplicate card${hidden === 1 ? "" : "s"} (${s.exact} exact, ${s.similar} worded differently). They're under Archived duplicates if you want any back.`
      : `Checked ${s.checked} new card${s.checked === 1 ? "" : "s"}: no duplicates found.`;
    return {
      ok: true,
      message: s.failed ? `${base} Some couldn't be checked (the free AI limit may be reached); they'll be tried again tomorrow.` : base,
    };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}
