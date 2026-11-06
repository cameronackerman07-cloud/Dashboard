import { matchCourse } from "@/lib/courses";

// Reads a timetable copied from a web page (Atlantis, Sentral, or anything that
// shows the week as a table) or typed out as lines. Runs in the browser only:
// nothing pasted is sent anywhere except the classes you choose to save, and
// only their subject, room and period (teacher names are dropped).

export type Week = "all" | "A" | "B";

export type PastedClass = {
  day: number; // 1 = Monday
  week: Week;
  period: string | null;
  subject: string;
  room: string | null;
  order: number;
};

type DayInfo = { day: number; week: Week; fortnightDay?: number };

const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// "Monday", "Mon A", "Tue Wk B", "Wednesday 2", "Day 7" → which day (and week).
function dayInfo(cell: string): DayInfo | null {
  const first = cell.split("\n")[0].trim();
  if (!first || first.length > 30) return null;

  const named = first.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?(?:\s+|$)(?:(?:week|wk)\s*)?([ab12])?\b/i);
  if (named) {
    const day = DAY_NAMES.indexOf(named[1].toLowerCase()) + 1;
    const w = named[2]?.toUpperCase();
    return { day, week: w === "A" || w === "1" ? "A" : w === "B" || w === "2" ? "B" : "all" };
  }
  const numbered = first.match(/^day\s*(\d{1,2})\b/i);
  if (numbered) {
    const n = Number(numbered[1]);
    if (n < 1 || n > 10) return null;
    return { day: ((n - 1) % 5) + 1, week: "all", fortnightDay: n };
  }
  return null;
}

const TIME = /^\d{1,2}[:.]\d{2}\s*(?:[ap]m)?(?:\s*[-–to]+\s*\d{1,2}[:.]\d{2}\s*(?:[ap]m)?)?$/i;
const BREAK = /^(recess|lunch|break|morning tea|roll ?call|home ?room|sport)\b/i;
const EMPTY = /^(free|-+|–|—|\.|n\/a|none)$/i;
const ROOM =
  /^(?:(?:rm|room)\s*[a-z0-9.-]+|[a-z]{0,4}\s?-?\d{1,3}[a-z]?|(?:lab|library|gym|hall|oval|studio|theatre|workshop)\b.*)$/i;

function cleanSubject(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  return matchCourse(text) ?? text;
}

// One timetable cell → a class, keeping only subject and room.
function readCell(text: string): { subject: string; room: string | null } | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !TIME.test(l));
  if (lines.length === 0 || EMPTY.test(lines[0])) return null;

  let subject = lines[0];
  let room: string | null = null;

  // "Physics (B12)" or "Physics - Room 4"
  const inline = subject.match(/^(.*?)\s*(?:\(([^)]+)\)|[-–|@]\s*((?:rm|room)\s*\S+|[a-z]{0,4}\d{1,3}[a-z]?))\s*$/i);
  if (inline && inline[1] && ROOM.test((inline[2] ?? inline[3] ?? "").trim())) {
    subject = inline[1];
    room = (inline[2] ?? inline[3]).trim();
  }
  if (!room) room = lines.slice(1).find((l) => ROOM.test(l)) ?? null;

  if (subject.length > 80) subject = subject.slice(0, 80);
  return { subject: cleanSubject(subject), room: room ? room.replace(/^(rm|room)\s*/i, "Room ").slice(0, 40) : null };
}

// ---------------------------------------------------------------------------
// Getting a grid out of the clipboard
// ---------------------------------------------------------------------------

const BLOCK = new Set(["DIV", "P", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "UL", "OL"]);

function textOf(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) out += child.textContent ?? "";
    else if (child.nodeType === 1) {
      const el = child as Element;
      if (el.tagName === "BR") out += "\n";
      else if (el.tagName === "STYLE" || el.tagName === "SCRIPT") return;
      else if (BLOCK.has(el.tagName)) out += `\n${textOf(el)}\n`;
      else out += textOf(el);
    }
  });
  return out;
}

function tidy(text: string): string {
  return text
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// The biggest <table> in pasted HTML, with merged cells (rowspan/colspan) filled in.
export function gridFromHtml(html: string): string[][] | null {
  if (!html || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  if (tables.length === 0) return null;
  const table = tables.reduce((a, b) => (b.querySelectorAll("td,th").length > a.querySelectorAll("td,th").length ? b : a));

  const grid: string[][] = [];
  const rows = Array.from(table.querySelectorAll("tr")).filter((tr) => tr.closest("table") === table);
  rows.forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of Array.from(tr.children).filter((el) => el.tagName === "TD" || el.tagName === "TH")) {
      while (grid[r][c] !== undefined) c++;
      const text = tidy(textOf(cell));
      const rowspan = Math.min(20, Math.max(1, Number(cell.getAttribute("rowspan")) || 1));
      const colspan = Math.min(20, Math.max(1, Number(cell.getAttribute("colspan")) || 1));
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = text;
      }
      c += colspan;
    }
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  const filled = grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
  return filled.length >= 2 && width >= 2 ? filled : null;
}

// Tab-separated text (what a copied table becomes as plain text).
export function gridFromText(text: string): string[][] | null {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.filter((l) => l.includes("\t")).length < 2) return null;
  return lines.map((l) => l.split("\t").map((c) => c.trim()));
}

// ---------------------------------------------------------------------------
// Reading a grid
// ---------------------------------------------------------------------------

function transpose(grid: string[][]): string[][] {
  const width = Math.max(...grid.map((r) => r.length));
  return Array.from({ length: width }, (_, c) => grid.map((row) => row[c] ?? ""));
}

function readOriented(grid: string[][]): PastedClass[] | null {
  const headerRow = grid.findIndex((row) => row.filter((cell) => dayInfo(cell)).length >= 2);
  if (headerRow < 0) return null;

  const columns = new Map<number, DayInfo>();
  grid[headerRow].forEach((cell, i) => {
    const info = dayInfo(cell);
    if (info) columns.set(i, info);
  });
  // "Day 1" to "Day 10" is a fortnight: days 6–10 are Week B.
  const fortnight = [...columns.values()].some((d) => (d.fortnightDay ?? 0) > 5);
  for (const [i, d] of columns) {
    if (d.fortnightDay) columns.set(i, { ...d, week: fortnight ? (d.fortnightDay > 5 ? "B" : "A") : "all" });
  }

  const out: PastedClass[] = [];
  grid.slice(headerRow + 1).forEach((row, r) => {
    const labelCell = row.find((cell, i) => !columns.has(i) && cell.trim()) ?? "";
    const label = labelCell.split("\n")[0]?.trim() ?? "";
    if (BREAK.test(label)) return;

    for (const [col, info] of columns) {
      const cell = row[col] ?? "";
      if (!cell.trim() || cell === labelCell || BREAK.test(cell)) continue;
      const read = readCell(cell);
      if (!read) continue;
      out.push({ day: info.day, week: info.week, period: label ? label.slice(0, 40) : null, ...read, order: r });
    }
  });
  return out.length ? out : null;
}

export function readGrid(grid: string[][]): PastedClass[] | null {
  return readOriented(grid) ?? readOriented(transpose(grid));
}

// Lines, for timetables that copy as a list rather than a table:
//   Monday
//   Period 1  Physics  B12
//   P2 - Maths Advanced - Room 4
export function readLines(text: string): PastedClass[] | null {
  const out: PastedClass[] = [];
  let current: DayInfo | null = null;
  let order = 0;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const day = dayInfo(line);
    if (day && line.length <= 20) {
      current = day.fortnightDay && day.fortnightDay > 5 ? { ...day, week: "B" } : day;
      order = 0;
      continue;
    }
    if (!current || BREAK.test(line)) continue;

    const parts = line.split(/\t| {2,}| [-–|] /).map((p) => p.trim()).filter(Boolean);
    let period: string | null = null;
    if (parts.length > 1 && /^(p(eriod)?\s*\d+[a-z]?|\d{1,2}[:.]\d{2}.*|lesson\s*\d+)$/i.test(parts[0])) {
      period = parts.shift()!.slice(0, 40);
    }
    const room = parts.length > 1 && ROOM.test(parts[parts.length - 1]) ? parts.pop()! : null;
    const read = readCell([parts[0] ?? "", room ?? ""].filter(Boolean).join("\n"));
    if (!read) continue;
    out.push({ day: current.day, week: current.week, period, ...read, order: order++ });
  }
  return out.length ? out : null;
}

// Tries a table first, then tab-separated text, then lines.
export function readPastedTimetable(html: string, text: string): PastedClass[] | null {
  const htmlGrid = gridFromHtml(html);
  const fromHtml = htmlGrid ? readGrid(htmlGrid) : null;
  if (fromHtml) return fromHtml;
  const textGrid = gridFromText(text);
  const fromText = textGrid ? readGrid(textGrid) : null;
  if (fromText) return fromText;
  return readLines(text);
}
