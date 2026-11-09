// Finds the pictures inside an uploaded file that are worth reading with a
// vision AI, and reads the charts inside Word files. Pure code (no
// "server-only") so the tests can run it; PDF pictures need pdf.js (unpdf).
//
// Skipped on purpose: tiny images (icons, bullets), the same picture repeated
// on several slides (logos, backgrounds), formats the AI can't read (EMF, WMF,
// SVG, TIFF), and anything past the per-file cap.

import { chartLines, readChartXml } from "./charts";
import { imageMime, PPTX_LIMITS, READABLE_IMAGE, rels, tokens, unzipParts, unzipRaw, type SlidePicture } from "./pptx";
import { encodePng, shrink } from "./png";

export type Picture = { slide: number | null; label: string; mime: string; data: Uint8Array };

export const PICTURE_LIMITS = {
  maxPictures: 24, // per file
  minBytes: 6_000, // smaller is almost always an icon
  maxBytes: 4 * 1024 * 1024, // per picture
  decorativeRepeats: 3, // the same picture on this many slides is a logo or background
  minPixels: 120, // PDF pictures smaller than this (either side) are skipped
  maxSide: 1600, // PDF pictures are shrunk to this before sending
  maxPdfPages: 60,
};

// PowerPoint: which of the deck's pictures to read, in slide order.
export function pickPptxPictures(bytes: Uint8Array, images: SlidePicture[], limits = PICTURE_LIMITS): Picture[] {
  const slidesFor = new Map<string, Set<number>>();
  for (const im of images) slidesFor.set(im.path, (slidesFor.get(im.path) ?? new Set()).add(im.slide));
  const firstUse: SlidePicture[] = [];
  const seen = new Set<string>();
  for (const im of images) {
    if (seen.has(im.path) || (slidesFor.get(im.path)?.size ?? 0) >= limits.decorativeRepeats) continue;
    seen.add(im.path);
    firstUse.push(im);
  }
  if (!firstUse.length) return [];
  const paths = new Set(firstUse.map((i) => i.path));
  const media = unzipRaw(bytes, (n) => paths.has(n), { ...PPTX_LIMITS, maxPartBytes: limits.maxBytes, maxRatio: 1000 });
  const out: Picture[] = [];
  for (const im of firstUse) {
    const data = media.get(im.path);
    if (!data || data.length < limits.minBytes || data.length > limits.maxBytes) continue;
    out.push({ slide: im.slide, label: `Slide ${im.slide} picture`, mime: imageMime(im.path), data });
    if (out.length >= limits.maxPictures) break;
  }
  return out;
}

// Word: chart text (real numbers) and the pictures, in document order.
export function readDocxExtras(bytes: Uint8Array, limits = PICTURE_LIMITS): { charts: string[]; pictures: Picture[] } {
  const want = (n: string) => n === "word/document.xml" || n === "word/_rels/document.xml.rels" || /^word\/charts\/chart\d+\.xml$/.test(n);
  const files = unzipParts(bytes, PPTX_LIMITS, want);
  const doc = files.get("word/document.xml");
  if (!doc) return { charts: [], pictures: [] };
  const byId = new Map(rels(files.get("word/_rels/document.xml.rels"), "word", "word").map((r) => [r.id, r.target]));
  const charts: string[] = [];
  const picPaths: string[] = [];
  const count = new Map<string, number>();
  for (const t of tokens(doc)) {
    if (!("name" in t) || t.close) continue;
    if (t.name === "c:chart" && t.attrs["r:id"]) {
      const target = byId.get(t.attrs["r:id"]);
      const xml = target && /^word\/charts\/chart\d+\.xml$/.test(target) ? files.get(target) : undefined;
      if (xml) {
        try {
          charts.push(...chartLines(readChartXml(xml)));
        } catch {
          /* skip a broken chart */
        }
      }
    } else if (t.name === "a:blip" && t.attrs["r:embed"]) {
      const target = byId.get(t.attrs["r:embed"]);
      if (target && /^word\/media\/[\w.-]+$/.test(target) && READABLE_IMAGE.test(target)) {
        count.set(target, (count.get(target) ?? 0) + 1);
        if (!picPaths.includes(target)) picPaths.push(target);
      }
    }
  }
  const keep = picPaths.filter((p) => (count.get(p) ?? 0) < limits.decorativeRepeats);
  const set = new Set(keep);
  const media = keep.length ? unzipRaw(bytes, (n) => set.has(n), { ...PPTX_LIMITS, maxPartBytes: limits.maxBytes, maxRatio: 1000 }) : new Map<string, Uint8Array>();
  const pictures: Picture[] = [];
  for (const p of keep) {
    const data = media.get(p);
    if (!data || data.length < limits.minBytes || data.length > limits.maxBytes) continue;
    pictures.push({ slide: null, label: `Picture ${pictures.length + 1}`, mime: imageMime(p), data });
    if (pictures.length >= limits.maxPictures) break;
  }
  return { charts, pictures };
}

// PDF: the pictures on each page (a scanned page is one big picture), as PNGs.
export async function pdfPictures(bytes: Uint8Array, limits = PICTURE_LIMITS): Promise<Picture[]> {
  const { extractImages, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const out: Picture[] = [];
  const pages = Math.min(pdf.numPages, limits.maxPdfPages);
  for (let page = 1; page <= pages && out.length < limits.maxPictures; page++) {
    let list: Awaited<ReturnType<typeof extractImages>> = [];
    try {
      list = await extractImages(pdf, page);
    } catch {
      continue;
    }
    for (const im of list) {
      if (im.width < limits.minPixels || im.height < limits.minPixels) continue;
      const small = shrink(im.data, im.width, im.height, im.channels, limits.maxSide);
      const png = encodePng(small.data, small.width, small.height, im.channels);
      if (png.length > limits.maxBytes) continue;
      out.push({ slide: page, label: `Page ${page} picture`, mime: "image/png", data: png });
      if (out.length >= limits.maxPictures) break;
    }
  }
  return out;
}

// A photo uploaded on its own.
export function photoPicture(name: string, bytes: Uint8Array, limits = PICTURE_LIMITS): Picture[] {
  if (bytes.length > limits.maxBytes) return [];
  return [{ slide: null, label: "Photo", mime: imageMime(name), data: bytes }];
}
