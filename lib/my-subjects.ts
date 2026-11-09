import "server-only";
import { cache } from "react";
import { COURSES } from "@/lib/nav";
import { cleanMySubjects, isYear, type YearLevel } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/server";

// The signed-in person's year and subjects (picked on /welcome or in Settings),
// read once per request.
//   ready: false  → they haven't picked yet, so the layout sends them to /welcome.
//   missing: true → supabase/phase7.sql hasn't been run, so nothing is forced and
//                   the old fixed course list is used.
export type School = { year: YearLevel | null; subjects: string[]; ready: boolean; missing: boolean };

export const getSchool = cache(async (): Promise<School> => {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { year: null, subjects: [], ready: false, missing: false };
  const { data, error } = await db.from("profiles").select("year_level, subjects").eq("id", user.id).maybeSingle();
  if (error) return { year: null, subjects: [...COURSES], ready: true, missing: true };
  const year = isYear(data?.year_level) ? (Number(data!.year_level) as YearLevel) : null;
  const subjects = year ? cleanMySubjects(year, data?.subjects) : [];
  return { year, subjects, ready: !!year && subjects.length > 0, missing: false };
});

// Your subjects, for pages and AI prompts. Never empty.
export async function getMySubjects(): Promise<string[]> {
  const s = await getSchool();
  return s.subjects.length ? s.subjects : ["English", "Mathematics", "Science"];
}
