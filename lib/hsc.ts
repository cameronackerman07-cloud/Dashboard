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

// Syllabus topics per course, for the topic dropdown. Year 12 (HSC) first.
// Maths and English follow the 2024 syllabuses (first HSC 2027); Physics and
// Engineering Studies follow their current syllabuses. `ideas` are suggested
// keywords for "Refine", not a full list of dot points.
export type Topic = { name: string; ideas: string[] };
export type TopicGroup = { year: string; topics: Topic[] };

const t = (name: string, ideas: string[]): Topic => ({ name, ideas });

export const TOPICS: Record<string, TopicGroup[]> = {
  "Engineering Studies": [
    {
      year: "Year 12 (HSC)",
      topics: [
        t("Civil structures", ["stress and strain", "truss analysis", "bending stress", "concrete and prestressing", "corrosion", "orthogonal drawing"]),
        t("Personal and public transport", ["friction", "work, energy and power", "heat treatment of steel", "cast iron", "engines and electricity", "sectional drawing"]),
        t("Aeronautical engineering", ["lift and drag", "Bernoulli's principle", "fluid mechanics", "aluminium alloys", "composites", "propulsion systems"]),
        t("Telecommunications engineering", ["analogue and digital signals", "fibre optics", "semiconductors", "copper alloys", "polymers", "electronics"]),
      ],
    },
    {
      year: "Year 11",
      topics: [
        t("Engineering fundamentals", ["materials properties", "forces and vectors", "mechanical drawing", "engineering careers"]),
        t("Engineered products", ["mass production", "polymers", "ceramics", "product design"]),
        t("Braking systems", ["friction", "hydraulics", "stress in components", "heat treatment"]),
        t("Biomedical engineering", ["biocompatible materials", "prosthetics", "medical devices", "ethics"]),
      ],
    },
  ],
  "Mathematics Advanced": [
    {
      year: "Year 12 (HSC)",
      topics: [
        t("Graph transformations and modelling", ["translations and dilations", "y = af(b(x + c)) + d", "modelling with functions"]),
        t("Sequences and series", ["arithmetic series", "geometric series", "limiting sum", "annuities"]),
        t("Differential calculus", ["chain rule", "product and quotient rules", "derivatives of trig functions", "exponentials and logs"]),
        t("Integral calculus", ["area under curves", "trapezoidal rule", "integrating trig functions", "area between curves"]),
        t("Applications of calculus", ["stationary points", "optimisation", "rates of change", "kinematics"]),
        t("Random variables", ["continuous probability distributions", "normal distribution", "z-scores", "expected value"]),
        t("Financial mathematics", ["compound interest", "annuities", "loan repayments", "depreciation"]),
      ],
    },
    {
      year: "Year 11",
      topics: [
        t("Functions", ["linear and quadratic functions", "domain and range", "inverse functions", "inequalities"]),
        t("Trigonometric functions", ["sine and cosine rules", "radians", "trig identities", "exact values"]),
        t("Introduction to calculus", ["first principles", "tangents and normals", "rates of change"]),
        t("Exponential and logarithmic functions", ["log laws", "e^x", "exponential growth and decay"]),
        t("Probability and discrete distributions", ["conditional probability", "expected value", "Venn diagrams"]),
      ],
    },
  ],
  "Mathematics Extension 1": [
    {
      year: "Year 12 (HSC)",
      topics: [
        t("Proof by mathematical induction", ["divisibility", "series", "inequalities"]),
        t("Vectors", ["dot product", "projectile motion", "vector proofs", "resolving forces"]),
        t("Inverse trigonometric functions", ["graphs of inverse trig", "derivatives of inverse trig", "auxiliary angle"]),
        t("Further calculus skills", ["integration by substitution", "sin² and cos² integrals", "volumes of solids of revolution"]),
        t("Further applications of calculus", ["differential equations", "slope fields", "related rates", "logistic growth"]),
        t("Binomial distribution", ["Bernoulli trials", "normal approximation", "sample proportions"]),
      ],
    },
    {
      year: "Year 11",
      topics: [
        t("Further work with functions", ["inequalities", "parametric form", "reciprocal graphs"]),
        t("Polynomials", ["remainder theorem", "sums and products of roots", "multiple roots"]),
        t("Further trigonometry", ["t-formulae", "compound angles", "trig equations"]),
        t("Permutations and combinations", ["pigeonhole principle", "arrangements in a circle", "nCr"]),
        t("Binomial theorem", ["binomial expansion", "Pascal's triangle", "greatest coefficient"]),
      ],
    },
  ],
  "Mathematics Extension 2": [
    {
      year: "Year 12 (HSC)",
      topics: [
        t("The nature of proof", ["proof by contradiction", "inequalities", "AM-GM", "induction"]),
        t("Further work with vectors", ["3D vectors", "vector equations of lines", "spheres"]),
        t("Complex numbers", ["mod-arg form", "De Moivre's theorem", "roots of unity", "complex loci"]),
        t("Further integration", ["integration by parts", "partial fractions", "recurrence relations", "t-substitution"]),
        t("Mechanics", ["simple harmonic motion", "resisted motion", "projectiles with resistance"]),
      ],
    },
  ],
  Physics: [
    {
      year: "Year 12 (HSC)",
      topics: [
        t("Module 5: Advanced mechanics", ["projectile motion", "circular motion", "orbits and gravitation", "Kepler's laws"]),
        t("Module 6: Electromagnetism", ["charged particles in fields", "motor effect", "electromagnetic induction", "transformers"]),
        t("Module 7: The nature of light", ["Maxwell's equations", "diffraction and interference", "photoelectric effect", "special relativity"]),
        t("Module 8: From the universe to the atom", ["Big Bang", "spectra", "Bohr model", "nuclear decay and fission"]),
      ],
    },
    {
      year: "Year 11",
      topics: [
        t("Module 1: Kinematics", ["displacement-time graphs", "relative velocity", "equations of motion"]),
        t("Module 2: Dynamics", ["Newton's laws", "momentum", "work and energy", "friction on slopes"]),
        t("Module 3: Waves and thermodynamics", ["sound waves", "Doppler effect", "refraction", "specific heat"]),
        t("Module 4: Electricity and magnetism", ["Coulomb's law", "circuits", "magnetic fields"]),
      ],
    },
  ],
  "VET Entertainment": [
    {
      year: "HSC exam focus areas",
      topics: [
        t("Work health and safety", ["risk assessment", "manual handling", "working at heights", "electrical safety"]),
        t("Working in the live production industry", ["roles and responsibilities", "industry awareness", "communication"]),
        t("Staging and sets", ["stage terminology", "rigging", "bump in and bump out"]),
        t("Audio", ["microphones", "signal flow", "mixing desks", "feedback"]),
        t("Lighting", ["lantern types", "DMX", "lighting states", "colour"]),
        t("Vision systems", ["projectors", "cables and connectors", "video signal"]),
      ],
    },
  ],
  "English Standard": [
    {
      year: "Year 12 (HSC)",
      topics: [
        t("Texts and human experiences", ["individual and collective experiences", "anomalies and paradoxes", "unseen texts"]),
        t("Language, identity and culture", ["representation of identity", "language and power", "culture"]),
        t("Close study of literature", ["extended response", "context and values", "key scenes"]),
        t("The craft of writing", ["imaginative writing", "discursive writing", "reflection statement"]),
      ],
    },
    {
      year: "Year 11",
      topics: [
        t("Reading to write", ["close reading", "writing in response to texts", "language forms and features"]),
        t("Contemporary possibilities", ["digital and multimodal texts", "how technology shapes texts"]),
        t("Close study of literature", ["prescribed text", "analytical response", "context and values"]),
      ],
    },
  ],
};

export function topicsFor(course: string): TopicGroup[] {
  return TOPICS[course] ?? [];
}

export function findTopic(course: string, name: string): Topic | null {
  for (const group of topicsFor(course)) {
    const found = group.topics.find((x) => x.name === name);
    if (found) return found;
  }
  return null;
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
