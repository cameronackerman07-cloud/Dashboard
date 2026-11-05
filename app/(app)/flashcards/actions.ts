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

export async function deleteCard(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  revalidatePath("/flashcards");
  return !error;
}
