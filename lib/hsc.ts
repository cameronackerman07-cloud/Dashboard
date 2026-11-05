// HSC practice settings shared by the page and its server actions.

export type BandLevel = "any" | "3" | "4" | "5" | "6";

const isExtension = (course: string) => /extension/i.test(course);

// Extension courses report E1–E4 instead of Bands 1–6. E4 is the top band.
export function bandOptions(course: string): { value: BandLevel; label: string }[] {
  if (isExtension(course)) {
    return [
      { value: "any", label: "Any band" },
      { value: "3", label: "E1 (like Band 3)" },
      { value: "4", label: "E2 (like Band 4)" },
      { value: "5", label: "E3 (like Band 5)" },
      { value: "6", label: "E4 (like Band 6)" },
    ];
  }
  return [
    { value: "any", label: "Any band" },
    { value: "3", label: "Band 3" },
    { value: "4", label: "Band 4" },
    { value: "5", label: "Band 5" },
    { value: "6", label: "Band 6" },
  ];
}

export function bandLabel(course: string, band: BandLevel): string | null {
  if (band === "any") return null;
  return bandOptions(course).find((b) => b.value === band)?.label.replace(/ \(.*\)$/, "") ?? null;
}

// How hard a question aimed at each band should be, for the AI.
export function bandGuide(course: string, band: BandLevel): string {
  const name = bandLabel(course, band);
  const guide: Record<Exclude<BandLevel, "any">, string> = {
    "3": "a straightforward question: recall a key idea or apply a routine one-step method in a familiar context",
    "4": "a moderate question: a routine multi-step problem or explanation in a familiar context, needing sound understanding",
    "5": "a challenging question: link several ideas, work in a less familiar context, and give a well-reasoned answer",
    "6": "one of the hardest questions in the paper: an unfamiliar or complex problem that needs insight, synthesis of several ideas and extended, rigorous reasoning",
  };
  return band === "any"
    ? "any difficulty a real HSC paper might include"
    : `${guide[band]}. It should separate students at ${name} level from those below it`;
}

// A multiple-choice question as the page uses it. `answer` is the index of the
// correct option (0 = A).
export type Mcq = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export const LETTERS = ["A", "B", "C", "D"];

// Official past papers live on NESA's site. We link to them rather than copying
// them, because the papers are NESA's copyright.
const NESA_EXAM_RESOURCES =
  "https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-resources?resource_types=HSC%2520exam%2520pack%2CArchive%2520HSC%2520exam%2520pack&category=";

const NESA_CATEGORY: Record<string, string> = {
  "Engineering Studies": "Technological%2520and%2520Applied%2520Studies",
  "Mathematics Advanced": "Mathematics",
  "Mathematics Extension 1": "Mathematics",
  "Mathematics Extension 2": "Mathematics",
  Physics: "Science",
  "VET Entertainment": "VET",
  "English Standard": "English",
};

export function pastPaperLinks(course: string): { label: string; href: string; note: string }[] {
  const category = NESA_CATEGORY[course];
  return [
    {
      label: category ? `Past HSC papers for ${course} (NESA)` : "Past HSC papers (NESA)",
      href: category
        ? `${NESA_EXAM_RESOURCES}${category}`
        : "https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers",
      note: "Official papers, marking guidelines and sample answers.",
    },
    {
      label: "Past trial papers (THSC Online)",
      href: "https://thsconline.github.io/s/",
      note: "A free, student-run collection of school trial papers.",
    },
    {
      label: "NSW syllabuses",
      href: "https://curriculum.nsw.edu.au/",
      note: "The dot points each question is written from.",
    },
  ];
}
