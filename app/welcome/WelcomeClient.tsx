"use client";

import { YearSubjects } from "@/components/YearSubjects";
import type { YearLevel } from "@/lib/subjects";

export function WelcomeClient({ year, subjects }: { year: YearLevel | null; subjects: string[] }) {
  // A full page load so the whole app sees the new subjects.
  return <YearSubjects year={year} subjects={subjects} askName saveLabel="Start using the dashboard" onSaved={() => window.location.assign("/")} />;
}
