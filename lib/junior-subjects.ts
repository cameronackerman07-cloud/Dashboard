// Years 7–10 (NSW Stages 4 and 5) subjects, for the year-and-subjects picker on
// /welcome and in Settings. Pure data, safe in the browser.
//
// Source: NESA's syllabus pages on curriculum.nsw.edu.au (learning areas:
// HSIE, Technological and Applied Studies, Creative Arts, PDHPE, Languages),
// checked November 2026. Where NESA has released a new syllabus with a new
// name, both names are listed, because schools switch over in different years:
// pick the one your school uses.

export type SubjectGroup = { label: string; subjects: string[] };

// Taken by everyone in Years 7–8 (Stage 4). A language is also required in
// Stage 4: pick it from Languages.
export const STAGE4_CORE = ["English", "Mathematics", "Science", "History", "Geography", "PDHPE", "Technology", "Visual Arts", "Music"];

// Taken by everyone in Years 9–10 (Stage 5).
export const STAGE5_CORE = ["English", "Mathematics", "Science", "History", "Geography", "PDHPE"];

export const JUNIOR_LANGUAGES = [
  "Aboriginal Languages",
  "Arabic",
  "Chinese",
  "French",
  "German",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Latin",
  "Modern Greek",
  "Spanish",
  "Turkish",
  "Vietnamese",
];

// Stage 5 electives (Years 9–10). Most schools run each for 100 or 200 hours.
export const STAGE5_ELECTIVES: SubjectGroup[] = [
  {
    label: "HSIE electives",
    subjects: ["Aboriginal Studies", "Commerce", "Geography Elective", "History Elective", "Work Education"],
  },
  {
    label: "Technology electives",
    subjects: [
      "Agricultural Technology",
      "Aquatic Technology",
      "Marine and Aquaculture Technology",
      "Communication Technology",
      "Computing Technology",
      "Design and Technology",
      "Design Innovation Technology",
      "Engineering Technology",
      "Food Technology",
      "Graphics Technology",
      "Industrial Technology",
      "Textiles Technology",
    ],
  },
  {
    label: "Creative Arts electives",
    subjects: [
      "Dance",
      "Drama",
      "Music",
      "Visual Arts",
      "Photographic and Digital Media",
      "Photography, Film and Digital Media",
      "Visual Design",
      "Visual and Motion Design",
    ],
  },
  {
    label: "PDHPE electives",
    subjects: ["Child Studies", "Physical Activity and Sports Studies", "Physical Activity and Sports Science"],
  },
  { label: "Languages", subjects: JUNIOR_LANGUAGES },
  // Common school-developed courses (NESA lets schools write their own).
  { label: "School-developed", subjects: ["iSTEM", "School-developed elective"] },
];

// Year 7–8 electives: just the language (most schools have no other electives
// until Year 9).
export const STAGE4_ELECTIVES: SubjectGroup[] = [{ label: "Languages", subjects: JUNIOR_LANGUAGES }];

export const JUNIOR_GROUPS: SubjectGroup[] = [
  { label: "Years 7–10 core", subjects: [...new Set([...STAGE4_CORE, ...STAGE5_CORE])] },
  ...STAGE5_ELECTIVES,
];
