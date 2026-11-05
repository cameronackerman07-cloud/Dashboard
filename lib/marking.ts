// Splits the AI marker's reply into the sections the HSC practice page shows.

export type MarkSection = { title: string; body: string };

export type ParsedMarking = {
  score: string | null; // e.g. "3/4"
  sections: MarkSection[];
};

// The prompt asks for these exact headings, in this order.
const HEADINGS: Record<string, string> = {
  "WHAT I READ": "What I read",
  "MARKING CRITERIA": "Marking criteria",
  "WHAT YOU DID WELL": "What you did well",
  "WHAT WENT WRONG": "What went wrong",
  "WORKED SOLUTION": "Worked solution",
};

const HEADING_LINE = new RegExp(
  `^[\\s#*_>-]*(${Object.keys(HEADINGS).join("|")})[\\s*_]*(?::[\\s*_]*(.*))?$`,
  "i",
);
const SCORE_LINE = /^[\s#*_>-]*mark[\s*_]*:?[\s*_]*(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+)/i;

export function parseMarking(raw: string): ParsedMarking {
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

  // If the model ignored the headings, show its whole reply rather than lose it.
  if (filled.length === 0) {
    return { score, sections: [{ title: "Marking", body: raw.trim() }] };
  }
  return { score, sections: filled };
}
