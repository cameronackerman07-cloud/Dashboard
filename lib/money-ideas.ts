// Money ideas (pure code): the user's situation, a starter catalogue of
// realistic, safe ways for a NSW secondary student to earn, and scoring.
// Pay rates are never quoted from memory: job ideas say "check the current
// rate" and link Fair Work. Service ideas estimate from a price YOU would
// charge, shown as an assumption. Every estimate is a rough estimate.

export type Transport = "licence_car" | "learner" | "bike" | "public" | "none";
export type Situation = {
  ageBracket: string;
  region: string;
  hoursPerWeek: number;
  skills: string[];
  transport: Transport;
  startupBudgetCents: number;
  weeklyGoalCents: number;
};

export const DEFAULT_SITUATION: Situation = { ageBracket: "16–17, Year 11", region: "", hoursPerWeek: 4, skills: [], transport: "public", startupBudgetCents: 5000, weeklyGoalCents: 5000 };

export function parseSituation(v: unknown): Situation {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, min: number, max: number, d: number) => (Number.isFinite(Number(x)) && Number(x) >= min && Number(x) <= max ? Number(x) : d);
  const transports: Transport[] = ["licence_car", "learner", "bike", "public", "none"];
  return {
    ageBracket: typeof s.ageBracket === "string" && s.ageBracket.trim() ? s.ageBracket.trim().slice(0, 40) : DEFAULT_SITUATION.ageBracket,
    region: typeof s.region === "string" ? s.region.trim().slice(0, 60) : "",
    hoursPerWeek: n(s.hoursPerWeek, 0, 40, DEFAULT_SITUATION.hoursPerWeek),
    skills: Array.isArray(s.skills) ? s.skills.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 20) : [],
    transport: transports.includes(s.transport as Transport) ? (s.transport as Transport) : DEFAULT_SITUATION.transport,
    startupBudgetCents: n(s.startupBudgetCents, 0, 1_000_000, DEFAULT_SITUATION.startupBudgetCents),
    weeklyGoalCents: n(s.weeklyGoalCents, 0, 1_000_000, DEFAULT_SITUATION.weeklyGoalCents),
  };
}

export type Link = { label: string; href: string };
export type IdeaSeed = {
  key: string;
  type: "job" | "apprenticeship" | "gig" | "service" | "tutoring" | "selling" | "freelance" | "scholarship" | "extras";
  title: string;
  summary: string;
  effort: number; // 1 easy … 5 hard
  startupCents: number;
  hours: number;
  priceCents?: [number, number]; // your own price per hour (services), not a pay rate
  needsTransport?: boolean;
  skills?: string[]; // fits these skills
  ageLegal: string;
  firstSteps: string[];
  links: Link[];
};

const FAIR_WORK: Link = { label: "Fair Work: pay guides and junior rates", href: "https://www.fairwork.gov.au/pay-and-wages/minimum-wages/junior-pay-rates" };
const ATO_TFN: Link = { label: "ATO: tax file number and tax-free threshold", href: "https://www.ato.gov.au/individuals-and-families/tax-file-number" };
const ATO_ABN: Link = { label: "ATO: do you need an ABN?", href: "https://www.ato.gov.au/businesses-and-organisations/starting-registering-or-closing-a-business/starting-your-own-business/do-you-need-an-abn" };
const WWCC: Link = { label: "NSW Working With Children Check", href: "https://www.service.nsw.gov.au/transaction/apply-for-a-working-with-children-check" };

export const MONEY_BASICS = "Money basics: give employers your TFN, the tax-free threshold usually applies to your first job, and self-employed work may need an ABN. Income can affect some government payments. This is general information, not tax advice.";
export const BASICS_LINKS = [ATO_TFN, ATO_ABN];

export const CATALOGUE: IdeaSeed[] = [
  { key: "job:casual", type: "job", title: "Casual job (retail, food, supermarket)", summary: "Regular weekend or after-school shifts at a local shop, cafe or supermarket.", effort: 3, startupCents: 0, hours: 6, ageLegal: "Most NSW employers hire from 14–15. Junior pay rates apply under 21.", firstSteps: ["Make a one-page resume", "Ask in person at 5 local shops", "Apply on the shop's own careers page"], links: [FAIR_WORK, ATO_TFN] },
  { key: "apprenticeship:sbat", type: "apprenticeship", title: "School-based apprenticeship or traineeship", summary: "Paid work that also counts towards your HSC — for example in entertainment, hospitality or IT.", effort: 4, startupCents: 0, hours: 7, skills: ["AV", "sound", "lighting", "IT"], ageLegal: "Arranged through your school's careers adviser; you stay enrolled in the HSC.", firstSteps: ["Ask your careers adviser about school-based traineeships", "Check which ones link to VET Entertainment"], links: [{ label: "NSW: school-based apprenticeships and traineeships", href: "https://education.nsw.gov.au/teaching-and-learning/curriculum/career-learning-and-vet/school-based-apprenticeships-and-traineeships" }, FAIR_WORK] },
  { key: "gig:av", type: "gig", title: "Event and AV crew", summary: "Help set up sound, lighting or staging for school, church, community or local events.", effort: 2, startupCents: 0, hours: 4, skills: ["AV", "sound", "lighting", "VET Entertainment"], needsTransport: true, ageLegal: "Usually casual employment; some venues need you to be 16+.", firstSteps: ["Tell local event companies and venues you're studying VET Entertainment", "Offer to help at the next school production"], links: [FAIR_WORK] },
  { key: "gig:referee", type: "gig", title: "Paid sports refereeing", summary: "Referee junior games on weekends for your local association.", effort: 2, startupCents: 3000, hours: 3, skills: ["refereeing", "sport"], ageLegal: "Associations set their own minimum age and course; a Working With Children Check may be needed for 18+ only.", firstSteps: ["Ask your club about the next referee course", "Get your uniform and whistle"], links: [WWCC] },
  { key: "service:yard", type: "service", title: "Yard work and garden tidy-ups", summary: "Mowing, weeding and leaf clearing for neighbours.", effort: 2, startupCents: 0, hours: 3, priceCents: [2000, 3000], ageLegal: "Use the customer's equipment unless you're trained on it. Self-employed work may need an ABN.", firstSteps: ["Make a simple flyer for your street", "Ask 3 neighbours"], links: [ATO_ABN] },
  { key: "service:carwash", type: "service", title: "Car washing", summary: "Wash cars at people's homes on weekends.", effort: 2, startupCents: 3000, hours: 3, priceCents: [1500, 2500], ageLegal: "Low risk. Self-employed work may need an ABN.", firstSteps: ["Buy a bucket, sponge and car wash", "Offer family and neighbours a first wash"], links: [ATO_ABN] },
  { key: "service:pets", type: "service", title: "Pet care and dog walking", summary: "Walk dogs or feed pets while neighbours are away.", effort: 1, startupCents: 0, hours: 3, priceCents: [1500, 2500], ageLegal: "Some apps need you to be 18+; working for neighbours directly is fine.", firstSteps: ["Tell neighbours with dogs", "Agree a price and times in writing"], links: [ATO_ABN] },
  { key: "service:cleaning", type: "service", title: "Extra cleaning jobs", summary: "Use your cleaning experience for one-off house or end-of-lease cleans.", effort: 3, startupCents: 2000, hours: 3, priceCents: [2500, 3500], skills: ["cleaning"], ageLegal: "Self-employed work may need an ABN.", firstSteps: ["Ask your current boss if there are extra shifts first", "Offer friends' families a one-off clean"], links: [ATO_ABN] },
  { key: "tutoring:juniors", type: "tutoring", title: "Tutor younger students", summary: "Help Year 7–10 students with maths or physics, online or at a library.", effort: 2, startupCents: 0, hours: 2, priceCents: [2500, 4000], skills: ["Mathematics Advanced", "Mathematics Extension 1", "Physics", "maths"], ageLegal: "Tutoring under-18s may need a Working With Children Check once you're 18. Meet in public places.", firstSteps: ["Ask your old primary/high school teachers who needs help", "Post in a local community group with a parent's help"], links: [WWCC, ATO_ABN] },
  { key: "selling:declutter", type: "selling", title: "Sell things you don't use", summary: "Sell old games, clothes and gear on a marketplace site.", effort: 1, startupCents: 0, hours: 1, ageLegal: "Most marketplaces need you to be 18+ — ask a parent to list for you. Meet buyers in public with an adult.", firstSteps: ["Pick 5 things to sell", "Take clear photos in daylight"], links: [] },
  { key: "freelance:design", type: "freelance", title: "Simple design or video editing", summary: "Make posters, social posts or short edits for local clubs and businesses.", effort: 3, startupCents: 0, hours: 3, priceCents: [2000, 3500], skills: ["design", "video", "editing", "photography"], ageLegal: "Freelance sites often need 18+; work directly with local clubs instead. May need an ABN.", firstSteps: ["Make 3 sample pieces", "Offer one free piece to a local club for your portfolio"], links: [ATO_ABN] },
  { key: "scholarship:search", type: "scholarship", title: "Scholarships, grants and competitions", summary: "Apply for student scholarships, bursaries and competitions with prize money.", effort: 3, startupCents: 0, hours: 1, ageLegal: "Never pay to apply. Check the organiser is real.", firstSteps: ["Ask your careers adviser for this year's list", "Put the closing dates into your calendar"], links: [{ label: "UAC: scholarships", href: "https://www.uac.edu.au/future-applicants/scholarships" }] },
  { key: "extras:cashback", type: "extras", title: "Legitimate cash-back and surveys (tiny extras)", summary: "Small amounts from cash-back or well-known survey panels. Only worth a few dollars.", effort: 1, startupCents: 0, hours: 1, ageLegal: "Many need you to be 18+. Never give bank details to a survey site.", firstSteps: ["Check the age limit first", "Never pay to join"], links: [] },
];

const BANNED = /(gambl|casino|betting|crypto|forex|trading scheme|mlm|multi-level|network marketing|pay to (get|join)|upfront fee|bank details)/i;

export function isSafeIdea(text: string): boolean {
  return !BANNED.test(text);
}

// Rough weekly range for an idea, with the assumptions written out.
export function estimate(seed: IdeaSeed, hoursAvailable: number): { low: number; high: number; assumptions: string } {
  const hours = Math.min(seed.hours, Math.max(0, hoursAvailable));
  if (seed.priceCents) {
    const [lo, hi] = seed.priceCents;
    return { low: Math.round(lo * hours), high: Math.round(hi * hours), assumptions: `Rough estimate: ${hours} h a week at a price you'd charge of $${lo / 100}–$${hi / 100} an hour. Not a pay rate.` };
  }
  if (seed.type === "job" || seed.type === "apprenticeship" || seed.type === "gig") {
    return { low: 0, high: 0, assumptions: `About ${hours} h a week. Check the current junior pay rate on Fair Work's pay guides — rates depend on age and award.` };
  }
  return { low: 0, high: 0, assumptions: "Varies a lot — treat any amount as a bonus." };
}

// Higher is better: easy, cheap, flexible around study, fits skills, and pays.
export function scoreIdea(seed: IdeaSeed, s: Situation, status: string, heavyWeek = false): number {
  if (status === "dismissed") return 0;
  let score = 50;
  score -= (seed.effort - 1) * 6;
  score -= seed.startupCents > s.startupBudgetCents ? 25 : (seed.startupCents / Math.max(1, s.startupBudgetCents)) * 5;
  score -= seed.hours > s.hoursPerWeek ? (seed.hours - s.hoursPerWeek) * 4 : 0;
  if (seed.needsTransport && (s.transport === "none" || s.transport === "public")) score -= 8;
  const skills = s.skills.map((x) => x.toLowerCase());
  if (seed.skills?.some((k) => skills.some((x) => x.includes(k.toLowerCase()) || k.toLowerCase().includes(x)))) score += 15;
  const est = estimate(seed, s.hoursPerWeek);
  if (est.high > 0) score += Math.min(10, (est.high / Math.max(1, s.weeklyGoalCents)) * 10);
  if (seed.type === "job" || seed.type === "apprenticeship") score += 6; // steady income
  if (heavyWeek) score -= seed.hours * 2;
  if (status === "interested") score += 10;
  if (status === "trying") score += 15;
  return Math.max(0, Math.round(score * 10) / 10);
}

// Ideas suggested by the AI from general knowledge: strict shape, labelled "verify".
export type AiIdea = { type: IdeaSeed["type"]; title: string; summary: string; effort: number; hours: number; firstSteps: string[] };
const TYPES: IdeaSeed["type"][] = ["job", "apprenticeship", "gig", "service", "tutoring", "selling", "freelance", "scholarship", "extras"];

export function parseAiIdeas(v: unknown): AiIdea[] | null {
  const list = (v as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) return null;
  const out: AiIdea[] = [];
  for (const raw of list.slice(0, 5)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title.trim().slice(0, 100) : "";
    const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 300) : "";
    if (!title || !summary || !isSafeIdea(`${title} ${summary}`)) continue;
    out.push({
      type: TYPES.includes(r.type as IdeaSeed["type"]) ? (r.type as IdeaSeed["type"]) : "service",
      title,
      summary,
      effort: Math.min(5, Math.max(1, Math.round(Number(r.effort) || 3))),
      hours: Math.min(10, Math.max(1, Math.round(Number(r.hours) || 2))),
      firstSteps: Array.isArray(r.firstSteps) ? r.firstSteps.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 160)).slice(0, 4) : [],
    });
  }
  return out;
}

export function slugKey(title: string): string {
  return `ai:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
}
