import { TOPICS } from "@/lib/hsc";
import { JUNIOR_GROUPS, STAGE4_CORE, STAGE4_ELECTIVES, STAGE5_CORE, STAGE5_ELECTIVES } from "@/lib/junior-subjects";

// Every NSW Stage 6 (Year 11–12) subject, for the subject pickers on Summaries,
// Flashcards, To-do and Notes, and for the AI to file flashcards under.
//
// Source: NESA's "HSC Board Developed courses to be examined in 2026" list (via
// UAC), checked November 2026, plus the VET courses students commonly take. The
// old Information Processes and Technology and PDHPE courses have been replaced
// by Enterprise Computing, Software Engineering and Health and Movement Science.
// Languages are listed by language: pick the language whatever the course level.

import type { SubjectGroup } from "@/lib/junior-subjects";
export type { SubjectGroup };

export const GENERAL_SUBJECT = "General / Other";

// Stage 6 (Years 11–12). "My courses" (the owner's old fixed list) is no longer
// shown: everyone now picks their own subjects on /welcome and in Settings.
export const STAGE6_GROUPS: SubjectGroup[] = [
  {
    label: "English",
    subjects: [
      "English Standard",
      "English Advanced",
      "English Studies",
      "English EAL/D",
      "English Extension 1",
      "English Extension 2",
    ],
  },
  {
    label: "Mathematics",
    subjects: [
      "Mathematics Standard 1",
      "Mathematics Standard 2",
      "Mathematics Advanced",
      "Mathematics Extension 1",
      "Mathematics Extension 2",
    ],
  },
  {
    label: "Science",
    subjects: [
      "Biology",
      "Chemistry",
      "Earth and Environmental Science",
      "Investigating Science",
      "Physics",
      "Science Extension",
    ],
  },
  {
    label: "HSIE",
    subjects: [
      "Aboriginal Studies",
      "Ancient History",
      "Modern History",
      "History Extension",
      "Geography",
      "Business Studies",
      "Economics",
      "Legal Studies",
      "Society and Culture",
      "Studies of Religion",
    ],
  },
  { label: "PDHPE", subjects: ["Health and Movement Science", "Community and Family Studies"] },
  {
    label: "Technology",
    subjects: [
      "Agriculture",
      "Design and Technology",
      "Engineering Studies",
      "Enterprise Computing",
      "Food Technology",
      "Industrial Technology",
      "Software Engineering",
      "Textiles and Design",
    ],
  },
  {
    label: "Creative Arts",
    subjects: ["Dance", "Drama", "Music 1", "Music 2", "Music Extension", "Visual Arts"],
  },
  {
    label: "Languages",
    subjects: [
      "Arabic",
      "Armenian",
      "Chinese",
      "Classical Greek",
      "Classical Hebrew",
      "Croatian",
      "Dutch",
      "Filipino",
      "French",
      "German",
      "Hindi",
      "Hungarian",
      "Indonesian",
      "Italian",
      "Japanese",
      "Khmer",
      "Korean",
      "Latin",
      "Macedonian",
      "Modern Greek",
      "Modern Hebrew",
      "Persian",
      "Polish",
      "Portuguese",
      "Punjabi",
      "Russian",
      "Serbian",
      "Spanish",
      "Swedish",
      "Tamil",
      "Turkish",
      "Vietnamese",
    ],
  },
  {
    label: "VET",
    subjects: [
      "VET Entertainment",
      "VET Automotive",
      "VET Business Services",
      "VET Construction",
      "VET Electrotechnology",
      "VET Financial Services",
      "VET Hospitality",
      "VET Human Services",
      "VET Information and Digital Technology",
      "VET Metal and Engineering",
      "VET Primary Industries",
      "VET Retail Services",
      "VET Sports Coaching",
      "VET Tourism, Travel and Events",
    ],
  },
  { label: "Other", subjects: [GENERAL_SUBJECT] },
];

// Every subject the site knows (Years 7–12), each once. Used to check a
// subject name before saving it.
export const SUBJECT_GROUPS: SubjectGroup[] = [...STAGE6_GROUPS.filter((g) => g.label !== "Other"), ...JUNIOR_GROUPS, { label: "Other", subjects: [GENERAL_SUBJECT] }];
export const ALL_SUBJECTS: string[] = [...new Set(SUBJECT_GROUPS.flatMap((g) => g.subjects))];

// ---------------------------------------------------------------------------
// Year levels. The site is for high school: Years 7–12.
// ---------------------------------------------------------------------------

export const YEARS = [7, 8, 9, 10, 11, 12] as const;
export type YearLevel = (typeof YEARS)[number];

export function isYear(value: unknown): value is YearLevel {
  return value !== null && value !== "" && YEARS.includes(Number(value) as YearLevel);
}

// The subjects everyone in that year takes (ticked for you on the picker).
export function coreFor(year: YearLevel): string[] {
  if (year <= 8) return STAGE4_CORE;
  if (year <= 10) return STAGE5_CORE;
  return []; // Years 11–12 only require English, and you pick which English.
}

// The other subjects you can choose in that year.
export function choicesFor(year: YearLevel): SubjectGroup[] {
  if (year <= 8) return STAGE4_ELECTIVES;
  if (year <= 10) return STAGE5_ELECTIVES;
  return STAGE6_GROUPS.filter((g) => g.label !== "Other");
}

export const MAX_MY_SUBJECTS = 16;

// Keeps only real subjects for that year, in order, once each.
export function cleanMySubjects(year: YearLevel, value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const allowed = new Set([...coreFor(year), ...choicesFor(year).flatMap((g) => g.subjects)]);
  return [...new Set(list.filter((s): s is string => typeof s === "string" && allowed.has(s)))].slice(0, MAX_MY_SUBJECTS);
}
const BY_LOWER = new Map(ALL_SUBJECTS.map((s) => [s.toLowerCase(), s]));

// The exact subject name for anything close ("physics" → "Physics"), or null.
export function matchSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return BY_LOWER.get(value.trim().toLowerCase()) ?? null;
}

// A subject name to save: a known subject, otherwise General / Other.
export function cleanSubject(value: unknown): string {
  return matchSubject(value) ?? GENERAL_SUBJECT;
}

// Same, but empty stays empty (for optional subject fields on To-do and Notes).
export function optionalSubject(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return matchSubject(value);
}

// ---------------------------------------------------------------------------
// Suggested modules (and topics) per subject. Used as suggestions in the
// flashcard dropdowns and given to the AI, so cards get filed under real module
// names. Modules and topics are always free text: anyone can type their own.
//
// Your seven courses come from lib/hsc.ts (checked against the NESA syllabuses:
// Maths and English on the 2024 syllabuses, first HSC 2027; Physics and
// Engineering on their current syllabuses). The others below are only the ones
// we're confident about; a subject with no entry just has free typing.
// ---------------------------------------------------------------------------

export type Module = { name: string; topics: string[] };

const plain = (...names: string[]): Module[] => names.map((name) => ({ name, topics: [] }));

const OTHER_SYLLABUS: Record<string, Module[]> = {
  // 2017 syllabuses, taught until the new science syllabuses start (HSC 2028).
  Biology: plain(
    "Module 1: Cells as the basis of life",
    "Module 2: Organisation of living things",
    "Module 3: Biological diversity",
    "Module 4: Ecosystem dynamics",
    "Module 5: Heredity",
    "Module 6: Genetic change",
    "Module 7: Infectious disease",
    "Module 8: Non-infectious disease and disorders",
  ),
  Chemistry: plain(
    "Module 1: Properties and structure of matter",
    "Module 2: Introduction to quantitative chemistry",
    "Module 3: Reactive chemistry",
    "Module 4: Drivers of reactions",
    "Module 5: Equilibrium and acid reactions",
    "Module 6: Acid/base reactions",
    "Module 7: Organic chemistry",
    "Module 8: Applying chemical ideas",
  ),
  "Investigating Science": plain(
    "Module 1: Cause and effect – observing",
    "Module 2: Cause and effect – inferences and generalisations",
    "Module 3: Scientific models",
    "Module 4: Theories and laws",
    "Module 5: Scientific investigations",
    "Module 6: Technologies",
    "Module 7: Fact or fallacy?",
    "Module 8: Science and society",
  ),
  "Business Studies": plain(
    "Nature of business",
    "Business management",
    "Business planning",
    "Operations",
    "Marketing",
    "Finance",
    "Human resources",
  ),
  Economics: plain(
    "Introduction to economics",
    "Consumers and business",
    "Markets",
    "Labour markets",
    "Financial markets",
    "Government in the economy",
    "The global economy",
    "Australia's place in the global economy",
    "Economic issues",
    "Economic policies and management",
  ),
  "Legal Studies": plain(
    "The legal system",
    "The individual and the law",
    "Law in practice",
    "Crime",
    "Human rights",
    "Consumers",
    "Family",
    "Shelter",
    "Workplace",
    "World order",
  ),
};

function fromTopics(course: string): Module[] {
  return (TOPICS[course] ?? []).flatMap((group) => group.topics.map((t) => ({ name: t.name, topics: t.ideas })));
}

export const SYLLABUS: Record<string, Module[]> = {
  ...OTHER_SYLLABUS,
  ...Object.fromEntries(Object.keys(TOPICS).map((c) => [c, fromTopics(c)])),
};

export function modulesFor(subject: string): Module[] {
  return SYLLABUS[subject] ?? [];
}
