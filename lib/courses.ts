import { COURSES } from "@/lib/nav";

// Turns a school's own class name ("12 ENG STUDIES 2027", "11MEX1", "Physics 12P2")
// into one of the dashboard's COURSES, or null if it isn't one of them.
// Order matters: Extension 2 before Extension 1 before Advanced.
// "(?<![a-z])" rather than \b, so codes glued to a year ("12MEX1") still match.
const RULES: { course: string; test: RegExp }[] = [
  { course: "Mathematics Extension 2", test: /(?<![a-z])(?:mx|mex|me|x|ext(?:ension)?\.?\s*)2(?!\d)|maths?\s+ext(?:ension)?\s*2/i },
  { course: "Mathematics Extension 1", test: /(?<![a-z])(?:mx|mex|me|x|ext(?:ension)?\.?\s*)1(?!\d)|maths?\s+ext(?:ension)?\s*1/i },
  { course: "Engineering Studies", test: /engin|(?<![a-z])eng\.?\s*st|(?<![a-z])egs(?![a-z])/i },
  { course: "Mathematics Advanced", test: /math|(?<![a-z])ma[av]?\d?(?![a-z])/i },
  { course: "Physics", test: /physic|(?<![a-z])phy?s?(?![a-z])/i },
  { course: "VET Entertainment", test: /entertain|live\s*prod|(?<![a-z])ent(?![a-z])/i },
  { course: "English Standard", test: /english|(?<![a-z])en(?:g|s|st|std)?\d?(?![a-z])/i },
];

export function matchCourse(name: string): string | null {
  const text = name.trim();
  if (!text) return null;
  const exact = COURSES.find((c) => c.toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  return RULES.find((r) => r.test.test(text))?.course ?? null;
}
