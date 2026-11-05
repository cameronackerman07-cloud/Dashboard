"use server";

import { revalidatePath } from "next/cache";
import { nextReview, type Rating } from "@/lib/flashcards";
import { createClient } from "@/lib/supabase/server";

// RLS keeps every row scoped to the signed-in user.

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

export async function reviewCard(id: string, rating: Rating): Promise<boolean> {
  if (!RATINGS.includes(rating)) return false;

  const supabase = await createClient();
  const { data: card } = await supabase
    .from("flashcards")
    .select("interval_days, ease")
    .eq("id", id)
    .single();
  if (!card) return false;

  const { error } = await supabase
    .from("flashcards")
    .update({ ...nextReview(card, rating, Date.now()), updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export type NewCard = { course: string | null; topic: string | null; front: string; back: string };

// Your own card. It's due straight away, so you can review it now.
export async function createCard(input: NewCard): Promise<{ id: string; due_at: string } | null> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back || front.length > 2500 || back.length > 2500) return null;

  const supabase = await createClient();
  const dueAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      course: input.course?.trim().slice(0, 80) || null,
      topic: input.topic?.trim().slice(0, 120) || null,
      front,
      back,
      due_at: dueAt,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  revalidatePath("/flashcards");
  return { id: data.id as string, due_at: dueAt };
}

export async function deleteCard(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  revalidatePath("/flashcards");
  return !error;
}
