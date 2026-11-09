"use server";

import { revalidatePath } from "next/cache";
import { cleanName } from "@/lib/auth";
import { cleanMySubjects, isYear } from "@/lib/subjects";
import { createClient, currentUserId } from "@/lib/supabase/server";

export type SchoolReply = { ok: boolean; message: string };

// Saves your year and subjects (and, on /welcome, an optional name).
export async function saveSchool(p: { year: number; subjects: string[]; name?: string }): Promise<SchoolReply> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "You're signed out. Sign in again." };
  if (!isYear(p.year)) return { ok: false, message: "Pick your year." };
  const subjects = cleanMySubjects(p.year, p.subjects);
  if (subjects.length === 0) return { ok: false, message: "Pick at least one subject." };
  const name = cleanName(p.name);
  const db = await createClient();
  const { error } = await db
    .from("profiles")
    .update({ year_level: p.year, subjects, ...(name ? { display_name: name } : {}), updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    console.error(`Save year/subjects failed: ${error.code}`);
    return {
      ok: false,
      message: /year_level|subjects|column/i.test(error.message) ? "The database needs updating: run supabase/phase7.sql in Supabase, then try again." : "Couldn't save. Try again.",
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
