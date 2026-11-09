"use client";

import { createContext, useContext } from "react";
import type { YearLevel } from "@/lib/subjects";

// The signed-in person's year and subjects, handed down from the app layout so
// every subject picker can put "My subjects" first.
export type School = { year: YearLevel | null; subjects: string[] };

const Ctx = createContext<School>({ year: null, subjects: [] });

export function MySubjectsProvider({ value, children }: { value: School; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMySubjects(): School & { first: string } {
  const v = useContext(Ctx);
  return { ...v, first: v.subjects[0] ?? "General / Other" };
}
