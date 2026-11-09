// Reads the text out of a PowerPoint (.pptx / .ppsx) file. A .pptx is a zip of
// XML files. Pure code (no "server-only") so the tests can run it.
//
// Safety:
// - Zip: fflate's streaming unzip. Only the few XML parts we need are ever
//   decompressed (pictures only when asked for, by path, with the same caps);
//   video and everything else are skipped unread.
//   Caps on the number of entries, the size of each part, the total size and
//   the compression ratio stop zip bombs.
// - XML: our own small tag reader. Any DOCTYPE or ENTITY declaration is
//   rejected outright, and only the five built-in entities and numeric
//   character references are decoded, so external entities (XXE) can't happen.
// - Relationships are only followed to parts inside this file's ppt/ folder;
//   external links are ignored.

import { Unzip, UnzipInflate } from "fflate";
import { chartLines, readChartXml } from "./charts";

export class PptxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PptxError";
  }
}

export const PPTX_LIMITS = {
  maxEntries: 3000, // files inside the zip
  maxPartBytes: 8 * 1024 * 1024, // one XML part, uncompressed
  maxTotalBytes: 60 * 1024 * 1024, // all the XML we read, uncompressed
  maxRatio: 120, // uncompressed ÷ compressed, per part
  maxSlides: 400,
};

export type PptxSlide = {
  position: number; // 1-based, in the real presentation order
  title: string | null;
  body: string; // bullet lines, indented two spaces per level
  notes: string | null;
  hidden: boolean;
  lowText: boolean; // almost no text: mostly pictures or diagrams
  tables: number;
  charts: number;
  pictures: number;
  altText: string[];
};

// A picture on a slide, by its path inside the zip (read later, only if wanted).
export type SlidePicture = { slide: number; path: string };
export type PptxResult = { slides: PptxSlide[]; lowTextSlides: number[]; hiddenSlides: number[]; charts: number; pictures: number; images: SlidePicture[] };

// Picture formats a vision AI can read. Others (EMF, WMF, SVG, TIFF) are skipped.
export const READABLE_IMAGE = /\.(png|jpe?g|webp|heic|heif)$/i;
export function imageMime(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "heic" ? "image/heic" : ext === "heif" ? "image/heif" : "image/jpeg";
}

const BAD = "That PowerPoint file looks damaged or unsafe, so it wasn't read. Open it in PowerPoint, Keynote or Google Slides and save it as .pptx again.";

// --- zip --------------------------------------------------------------------

function wanted(name: string): boolean {
  return (
    name === "ppt/presentation.xml" ||
    name === "ppt/_rels/presentation.xml.rels" ||
    /^ppt\/slides\/slide\d+\.xml$/.test(name) ||
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name) ||
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name) ||
    /^ppt\/charts\/chart\d+\.xml$/.test(name)
  );
}

export function unzipParts(bytes: Uint8Array, limits = PPTX_LIMITS, want: (name: string) => boolean = wanted): Map<string, string> {
  const out = new Map<string, string>();
  const dec = new TextDecoder("utf-8");
  for (const [name, buf] of unzipRaw(bytes, want, limits)) out.set(name, dec.decode(buf));
  return out;
}

// The raw bytes of the parts `want` picks (pictures, by exact path).
export function unzipRaw(bytes: Uint8Array, want: (name: string) => boolean, limits = PPTX_LIMITS): Map<string, Uint8Array> {
  const parts = new Map<string, Uint8Array[]>();
  let entries = 0;
  let total = 0;
  let failure: string | null = null;
  const uz = new Unzip();
  uz.register(UnzipInflate);
  uz.onfile = (file) => {
    entries++;
    if (entries > limits.maxEntries) {
      failure = "too many files";
      return;
    }
    if (failure || !want(file.name)) return; // never decompressed
    const declared = file.originalSize ?? 0;
    const packed = file.size ?? 0;
    if (declared > limits.maxPartBytes || (packed > 0 && declared / packed > limits.maxRatio)) {
      failure = "part too large";
      return;
    }
    let got = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (err, data) => {
      if (failure) return;
      if (err) {
        failure = "corrupt";
        return;
      }
      got += data.length;
      total += data.length;
      if (got > limits.maxPartBytes || total > limits.maxTotalBytes || (packed > 0 && got / packed > limits.maxRatio)) {
        failure = "part too large";
        try {
          file.terminate();
        } catch {
          /* already stopped */
        }
        return;
      }
      chunks.push(data);
    };
    parts.set(file.name, chunks);
    file.start();
  };
  try {
    // Feed in pieces so a bomb is caught early.
    const step = 256 * 1024;
    for (let i = 0; i < bytes.length && !failure; i += step) uz.push(bytes.subarray(i, i + step), i + step >= bytes.length);
  } catch {
    failure = failure ?? "corrupt";
  }
  if (failure) throw new PptxError(BAD);
  const out = new Map<string, Uint8Array>();
  for (const [name, chunks] of parts) {
    const len = chunks.reduce((a, c) => a + c.length, 0);
    const buf = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      buf.set(c, o);
      o += c.length;
    }
    out.set(name, buf);
  }
  return out;
}

// --- xml --------------------------------------------------------------------

export type XmlTag = { name: string; attrs: Record<string, string>; close: boolean; selfClose: boolean } | { text: string };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "amp") return "&";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
}

export function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new PptxError(BAD);
}

export function* tokens(xml: string): Generator<XmlTag> {
  assertSafeXml(xml);
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[2]) {
      const attrs: Record<string, string> = {};
      const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[3] ?? ""))) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
      yield { name: m[2], attrs, close: m[1] === "/", selfClose: m[4] === "/" };
    } else if (m[5] !== undefined) {
      yield { text: m[5] };
    } else if (m[6] !== undefined) {
      yield { text: decode(m[6]) };
    }
  }
}

// --- relationships ----------------------------------------------------------

type Rel = { id: string; type: string; target: string };

export function rels(xml: string | undefined, baseDir: string, root = "ppt"): Rel[] {
  if (!xml) return [];
  const out: Rel[] = [];
  for (const t of tokens(xml)) {
    if ("name" in t && !t.close && t.name === "Relationship") {
      if ((t.attrs.TargetMode ?? "").toLowerCase() === "external") continue;
      const target = resolve(baseDir, t.attrs.Target ?? "", root);
      if (target) out.push({ id: t.attrs.Id ?? "", type: t.attrs.Type ?? "", target });
    }
  }
  return out;
}

// "slides/slide1.xml" relative to "ppt" → "ppt/slides/slide1.xml". Anything
// that would leave ppt/ (or word/ for Word files; or is absolute or a URL) is refused.
export function resolve(baseDir: string, target: string, root = "ppt"): string | null {
  if (!target || /^[a-z]+:/i.test(target) || target.includes("\\")) return null;
  const parts = (target.startsWith("/") ? target.slice(1) : `${baseDir}/${target}`).split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (!stack.length) return null;
      stack.pop();
    } else stack.push(p);
  }
  const path = stack.join("/");
  return path.startsWith(`${root}/`) ? path : null;
}

// --- slides -----------------------------------------------------------------

type ShapeText = { title: boolean; lines: string[] };

export function readSlideXml(xml: string): { title: string | null; body: string[]; tables: string[][]; hidden: boolean; charts: number; pictures: number; altText: string[]; chartIds: string[]; pictureIds: string[] } {
  let hidden = false;
  const chartIds: string[] = [];
  const pictureIds: string[] = [];
  let charts = 0;
  let pictures = 0;
  const altText: string[] = [];
  const shapes: ShapeText[] = [];
  const tables: string[][] = [];
  let shape: ShapeText | null = null;
  let para: { lvl: number; text: string } | null = null;
  let inPic = false;
  let table: string[] | null = null;
  let row: string[] | null = null;
  let cell: string | null = null;
  let inText = false;

  for (const t of tokens(xml)) {
    if ("text" in t) {
      if (inText) {
        const s = decode(t.text);
        if (cell !== null && !shape) cell += s;
        else if (para) para.text += s;
        else if (cell !== null) cell += s;
      }
      continue;
    }
    const { name, attrs, close, selfClose } = t;
    if (name === "p:sld" && !close && attrs.show === "0") hidden = true;
    else if (name === "p:sp") {
      if (!close) shape = { title: false, lines: [] };
      if (close || selfClose) {
        if (shape) shapes.push(shape);
        shape = null;
      }
    } else if (name === "p:ph" && shape && !close) {
      if (attrs.type === "title" || attrs.type === "ctrTitle") shape.title = true;
    } else if (name === "a:p") {
      if (!close && !selfClose) para = { lvl: 0, text: "" };
      if (close || selfClose) {
        if (para && para.text.trim()) {
          const line = `${"  ".repeat(Math.min(para.lvl, 8))}${para.text.replace(/\s+/g, " ").trim()}`;
          if (shape) shape.lines.push(line);
          else if (cell !== null) cell += (cell ? " " : "") + para.text.trim();
        }
        para = null;
      }
    } else if (name === "a:pPr" && para && !close) {
      const lvl = Number(attrs.lvl);
      if (Number.isFinite(lvl)) para.lvl = lvl;
    } else if (name === "a:t") {
      inText = !close && !selfClose;
    } else if (name === "a:br" && para) {
      para.text += " ";
    } else if (name === "a:tbl") {
      if (!close) table = [];
      else {
        if (table && table.length) tables.push(table);
        table = null;
      }
    } else if (name === "a:tr" && table) {
      if (!close) row = [];
      else {
        if (row && row.some((c) => c)) table.push(row.join(" | "));
        row = null;
      }
    } else if (name === "a:tc" && row) {
      if (!close && !selfClose) cell = "";
      else {
        if (cell !== null) row.push(cell.replace(/\s+/g, " ").trim());
        cell = null;
      }
    } else if (name === "p:pic") {
      if (!close) {
        inPic = true;
        pictures++;
      }
      if (close || selfClose) inPic = false;
    } else if (name === "a:blip" && inPic && !close && attrs["r:embed"]) {
      pictureIds.push(attrs["r:embed"]);
    } else if (name === "p:cNvPr" && inPic && attrs.descr) {
      altText.push(attrs.descr.replace(/\s+/g, " ").trim().slice(0, 300));
    } else if (name === "c:chart" && !close) {
      charts++;
      if (attrs["r:id"]) chartIds.push(attrs["r:id"]);
    }
  }
  const titleShape = shapes.find((s) => s.title && s.lines.length);
  const title = titleShape ? titleShape.lines.map((l) => l.trim()).join(" ").slice(0, 300) : null;
  const body = shapes.filter((s) => s !== titleShape).flatMap((s) => s.lines);
  return { title, body, tables, hidden, charts, pictures, altText, chartIds, pictureIds };
}

function readNotes(xml: string | undefined): string | null {
  if (!xml) return null;
  // Notes text is in the "body" placeholder; skip the slide picture and slide number.
  const lines: string[] = [];
  let inBody = false;
  let depth = 0;
  let inText = false;
  let para = "";
  for (const t of tokens(xml)) {
    if ("text" in t) {
      if (inText && inBody) para += decode(t.text);
      continue;
    }
    if (t.name === "p:sp") {
      if (!t.close) {
        depth++;
        inBody = false;
      } else {
        depth--;
        inBody = false;
      }
    } else if (t.name === "p:ph" && depth > 0 && !t.close) {
      inBody = t.attrs.type === "body" || (!t.attrs.type && t.attrs.idx === "1");
    } else if (t.name === "a:t") inText = !t.close && !t.selfClose;
    else if (t.name === "a:p" && (t.close || t.selfClose)) {
      if (inBody && para.trim()) lines.push(para.replace(/\s+/g, " ").trim());
      para = "";
    }
  }
  const text = lines.join("\n").trim();
  return text ? text.slice(0, 8000) : null;
}

export const LOW_TEXT_CHARS = 25;

export function readPptx(bytes: Uint8Array, limits = PPTX_LIMITS): PptxResult {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new PptxError("That isn't a PowerPoint (.pptx) file.");
  const files = unzipParts(bytes, limits);
  const pres = files.get("ppt/presentation.xml");
  if (!pres) throw new PptxError("That doesn't look like a PowerPoint file. Save it as .pptx and try again.");

  const presRels = new Map(rels(files.get("ppt/_rels/presentation.xml.rels"), "ppt").map((r) => [r.id, r]));
  // Real order: the slide id list in presentation.xml, not the file names.
  const order: string[] = [];
  for (const t of tokens(pres)) {
    if ("name" in t && !t.close && t.name === "p:sldId") {
      const rid = t.attrs["r:id"];
      const rel = rid ? presRels.get(rid) : undefined;
      if (rel && /\/slide$/.test(rel.type) && /^ppt\/slides\/slide\d+\.xml$/.test(rel.target)) order.push(rel.target);
    }
  }
  if (order.length > limits.maxSlides) throw new PptxError(`That deck has ${order.length} slides. Split it into files of up to ${limits.maxSlides} slides.`);

  const slides: PptxSlide[] = [];
  const images: SlidePicture[] = [];
  order.forEach((path, i) => {
    const xml = files.get(path);
    if (!xml) return;
    const s = readSlideXml(xml);
    const name = path.split("/").pop()!;
    const slideRels = rels(files.get(`ppt/slides/_rels/${name}.rels`), "ppt/slides");
    const notesRel = slideRels.find((r) => /\/notesSlide$/.test(r.type) && /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(r.target));
    const notes = notesRel ? readNotes(files.get(notesRel.target)) : null;
    const tableLines = s.tables.flat();
    const byId = new Map(slideRels.map((r) => [r.id, r.target]));
    // Charts: read straight from the chart's data, so the real numbers are kept.
    const chartText = s.chartIds.flatMap((id) => {
      const target = byId.get(id);
      const xml = target && /^ppt\/charts\/chart\d+\.xml$/.test(target) ? files.get(target) : undefined;
      if (!xml) return [];
      try {
        return chartLines(readChartXml(xml));
      } catch {
        return [];
      }
    });
    for (const id of s.pictureIds) {
      const target = byId.get(id);
      if (target && /^ppt\/media\/[\w.-]+$/.test(target) && READABLE_IMAGE.test(target)) images.push({ slide: i + 1, path: target });
    }
    const bodyLines = [...s.body, ...(tableLines.length ? ["Table:", ...tableLines.map((l) => `  ${l}`)] : []), ...chartText, ...s.altText.map((a) => `[Picture: ${a}]`)];
    const visibleChars = [...s.body, ...tableLines, ...chartText].join("").replace(/\s/g, "").length;
    slides.push({
      position: i + 1,
      title: s.title,
      body: bodyLines.join("\n").slice(0, 20_000),
      notes,
      hidden: s.hidden,
      lowText: visibleChars < LOW_TEXT_CHARS && !(notes && notes.length >= LOW_TEXT_CHARS),
      tables: s.tables.length,
      charts: s.charts,
      pictures: s.pictures,
      altText: s.altText,
    });
  });
  if (!slides.length) throw new PptxError("That deck has no slides to read.");
  return {
    slides,
    lowTextSlides: slides.filter((s) => s.lowText).map((s) => s.position),
    hiddenSlides: slides.filter((s) => s.hidden).map((s) => s.position),
    charts: slides.reduce((a, s) => a + s.charts, 0),
    pictures: slides.reduce((a, s) => a + s.pictures, 0),
    images,
  };
}

// --- chunks -----------------------------------------------------------------

export type Chunk = { from: number; to: number };

// Groups slides (or text parts) into chunks of about `maxSlides` slides or
// `maxChars` characters, whichever comes first. Low-text slides are skipped.
export function chunkSlides(slides: { position: number; title: string | null; body: string; notes: string | null; lowText: boolean }[], opts: { quick?: boolean } = {}): Chunk[] {
  const maxSlides = opts.quick ? 30 : 10;
  const maxChars = opts.quick ? 18_000 : 7_000;
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  let chars = 0;
  let count = 0;
  for (const s of slides) {
    if (s.lowText) continue;
    const len = (s.title ?? "").length + s.body.length + (s.notes ?? "").length;
    if (cur && (count >= maxSlides || chars + len > maxChars)) {
      chunks.push(cur);
      cur = null;
    }
    if (!cur) {
      cur = { from: s.position, to: s.position };
      chars = 0;
      count = 0;
    }
    cur.to = s.position;
    chars += len;
    count++;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
