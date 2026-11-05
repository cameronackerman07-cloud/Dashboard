// Splits the AI marker's reply into the sections the HSC practice page shows,
// and pulls out the flashcards it wrote about the student's mistakes.

export type MarkSection = { title: string; body: string };
export type DraftCard = { front: string; back: string };

export type ParsedMarking = {
  score: string | null; // e.g. "3/4"
  sections: MarkSection[];
  cards: DraftCard[];
};

// The prompt asks for these exact headings, in this order.
const HEADINGS: Record<string, string> = {
  "WHAT I READ": "What I read",
  "MARKING CRITERIA": "Marking criteria",
  "WHAT YOU DID WELL": "What you did well",
  "WHAT WENT WRONG": "What went wrong",
  "WORKED SOLUTION": "Worked solution",
  FLASHCARDS: "Flashcards",
};

const HEADING_LINE = new RegExp(
  `^[\\s#*_>-]*(${Object.keys(HEADINGS).join("|")})[\\s*_]*(?::[\\s*_]*(.*))?$`,
  "i",
);
const SCORE_LINE = /^[\s#*_>-]*mark[\s*_]*:?[\s*_]*(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+)/i;

const MAX_CARDS = 5;
const MAX_FRONT = 500;
const MAX_BACK = 1500;

// Reads "Q: ..." / "A: ..." pairs. An answer can run over several lines.
function parseCards(body: string): DraftCard[] {
  const cards: DraftCard[] = [];
  let current: DraftCard | null = null;
  let inAnswer = false;

  for (const line of body.split("\n")) {
    const question = /^[\s*_>-]*(?:\d+[.)]\s*)?Q[\s*_]*:[\s*_]*(.*)$/i.exec(line);
    const answer = /^[\s*_>-]*A[\s*_]*:[\s*_]*(.*)$/i.exec(line);
    if (question) {
      current = { front: question[1], back: "" };
      cards.push(current);
      inAnswer = false;
    } else if (answer && current) {
      current.back = answer[1];
      inAnswer = true;
    } else if (current && line.trim()) {
      if (inAnswer) current.back += `\n${line}`;
      else current.front += `\n${line}`;
    }
  }

  return cards
    .map((c) => ({
      front: c.front.trim().slice(0, MAX_FRONT),
      back: c.back.trim().slice(0, MAX_BACK),
    }))
    .filter((c) => c.front && c.back)
    .slice(0, MAX_CARDS);
}

function isFullMarks(score: string | null): boolean {
  if (!score) return false;
  const [got, total] = score.split("/").map(Number);
  return got >= total;
}

export function parseMarking(raw: string, question = ""): ParsedMarking {
  let score: string | null = null;
  const sections: MarkSection[] = [];
  const seen = new Set<string>();
  let current: MarkSection | null = null;

  for (const line of raw.split(/\r?\n/)) {
    // Only the first score line counts: a worked solution can say "Mark: 1/2" too.
    if (!score && !current) {
      const m = SCORE_LINE.exec(line);
      if (m) {
        score = `${m[1]}/${m[2]}`;
        continue;
      }
    }

    const h = HEADING_LINE.exec(line);
    const key = h?.[1].toUpperCase();
    if (h && key && !seen.has(key)) {
      seen.add(key);
      current = { title: HEADINGS[key], body: h[2] ?? "" };
      sections.push(current);
      continue;
    }

    if (current) current.body += `${current.body ? "\n" : ""}${line}`;
  }

  const filled = sections
    .map((s) => ({ title: s.title, body: s.body.replace(/\*\*/g, "").trim() }))
    .filter((s) => s.body);

  const visible = filled.filter((s) => s.title !== HEADINGS.FLASHCARDS);

  // If the model ignored the headings, show its whole reply rather than lose it.
  if (visible.length === 0) {
    return { score, sections: [{ title: "Marking", body: raw.trim() }], cards: [] };
  }

  const full = isFullMarks(score);
  let cards = full ? [] : parseCards(filled.find((s) => s.title === HEADINGS.FLASHCARDS)?.body ?? "");

  // Marks were lost but the model wrote no usable cards: still keep the mistake.
  if (!full && score && cards.length === 0 && question.trim()) {
    const wrong = visible.find((s) => s.title === HEADINGS["WHAT WENT WRONG"])?.body;
    const solution = visible.find((s) => s.title === HEADINGS["WORKED SOLUTION"])?.body;
    const back = [wrong && `What went wrong:\n${wrong}`, solution && `Worked solution:\n${solution}`]
      .filter(Boolean)
      .join("\n\n");
    if (back) {
      cards = [{ front: question.trim().slice(0, MAX_FRONT), back: back.slice(0, MAX_BACK) }];
    }
  }

  return { score, sections: visible, cards };
}
