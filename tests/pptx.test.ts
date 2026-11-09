import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { chunkSlides, PptxError, readPptx, resolve } from "@/lib/extract/pptx";
import { safeFileName, uploadKind } from "@/lib/upload-files";
import { nextStep } from "@/lib/upload-jobs";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function sp(text: string[], opts: { title?: boolean; lvl?: number[] } = {}) {
  const ph = opts.title ? '<p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' : '<p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>';
  const paras = text.map((t, i) => `<a:p>${opts.lvl?.[i] ? `<a:pPr lvl="${opts.lvl[i]}"/>` : ""}<a:r><a:t>${t}</a:t></a:r></a:p>`).join("");
  return `<p:sp>${ph}<p:txBody>${paras}</p:txBody></p:sp>`;
}

function slide(inner: string, hidden = false) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}${hidden ? ' show="0"' : ""}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
}

// A small deck: files named out of order, a hidden slide, a table, speaker
// notes, and a slide that's only a picture.
function fixture(extra: Record<string, Uint8Array> = {}) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "ppt/presentation.xml": strToU8(
      `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId4"/><p:sldId id="259" r:id="rId5"/></p:sldIdLst></p:presentation>`,
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId3" Type="${REL}/slide" Target="slides/slide2.xml"/>
      <Relationship Id="rId4" Type="${REL}/slide" Target="slides/slide3.xml"/>
      <Relationship Id="rId5" Type="${REL}/slide" Target="slides/slide4.xml"/>
      <Relationship Id="rId9" Type="${REL}/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>`,
    ),
    // slide2.xml is shown FIRST (rId3 is first in the list).
    "ppt/slides/slide2.xml": strToU8(slide(sp(["Projectile motion"], { title: true }) + sp(["Horizontal velocity is constant", "No air resistance", "a = g downwards"], { lvl: [0, 1, 0] }))),
    "ppt/slides/slide1.xml": strToU8(slide(sp(["Hidden working"], { title: true }) + sp(["Extra derivation steps go here"]), true)),
    "ppt/slides/slide3.xml": strToU8(
      slide(
        sp(["Equations"], { title: true }) +
          '<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Quantity</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Formula</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Range</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>u&#178; sin 2&#952; / g</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>',
      ),
    ),
    "ppt/slides/_rels/slide3.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
    ),
    "ppt/notesSlides/notesSlide1.xml": strToU8(
      `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Remember to derive the range formula in the exam.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    ),
    "ppt/slides/slide4.xml": strToU8(slide('<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture" descr="Diagram of a projectile path"/></p:nvPicPr></p:pic>')),
    "ppt/media/image1.png": new Uint8Array(5000),
    ...extra,
  };
  return zipSync(files);
}

test("reads slides in the real order with titles, bullets, tables, notes and hidden slides", () => {
  const deck = readPptx(fixture());
  assert.equal(deck.slides.length, 4);
  const [s1, s2, s3, s4] = deck.slides;
  assert.equal(s1.title, "Projectile motion"); // slide2.xml, first in the id list
  assert.match(s1.body, /Horizontal velocity is constant\n {2}No air resistance\na = g downwards/);
  assert.equal(s2.hidden, true);
  assert.deepEqual(deck.hiddenSlides, [2]);
  assert.equal(s3.tables, 1);
  assert.match(s3.body, /Range \| u² sin 2θ \/ g/);
  assert.equal(s3.notes, "Remember to derive the range formula in the exam.");
  assert.equal(s4.lowText, true);
  assert.deepEqual(s4.altText, ["Diagram of a projectile path"]);
  assert.deepEqual(deck.lowTextSlides, [4]);
  assert.equal(deck.pictures, 1);
});

test("rejects XML with a DOCTYPE or entity (XXE)", () => {
  const evil = `<?xml version="1.0"?><!DOCTYPE p [<!ENTITY x SYSTEM "file:///etc/passwd">]><p:sld ${NS}><p:cSld><p:spTree>${sp(["&x;"])}</p:spTree></p:cSld></p:sld>`;
  assert.throws(() => readPptx(fixture({ "ppt/slides/slide2.xml": strToU8(evil) })), PptxError);
});

test("rejects a zip bomb without decompressing it fully", () => {
  // 30 MB of zeros squeezes into a tiny part: far past the size and ratio caps.
  const bomb = new Uint8Array(30 * 1024 * 1024);
  assert.throws(() => readPptx(fixture({ "ppt/slides/slide2.xml": bomb })), PptxError);
  // Too many files.
  const many: Record<string, Uint8Array> = {};
  for (let i = 0; i < 40; i++) many[`junk/${i}.txt`] = strToU8("x");
  assert.throws(() => readPptx(fixture(many), { maxEntries: 20, maxPartBytes: 8e6, maxTotalBytes: 6e7, maxRatio: 120, maxSlides: 400 }), PptxError);
});

test("relationship targets can't leave the ppt folder", () => {
  assert.equal(resolve("ppt/slides", "../notesSlides/notesSlide1.xml"), "ppt/notesSlides/notesSlide1.xml");
  assert.equal(resolve("ppt", "../../etc/passwd"), null);
  assert.equal(resolve("ppt", "https://example.com/x.xml"), null);
  assert.equal(resolve("ppt", "/docProps/app.xml"), null);
});

test("chunks group slides, skip picture-only slides, and Quick mode makes fewer", () => {
  const slides = Array.from({ length: 25 }, (_, i) => ({ position: i + 1, title: `Slide ${i + 1}`, body: "x".repeat(300), notes: null, lowText: i === 4 }));
  const normal = chunkSlides(slides);
  assert.deepEqual(normal[0], { from: 1, to: 11 }); // 10 slides, slide 5 skipped
  assert.equal(normal.length, 3);
  assert.equal(chunkSlides(slides, { quick: true }).length, 1);
  const big = Array.from({ length: 6 }, (_, i) => ({ position: i + 1, title: null, body: "y".repeat(3000), notes: null, lowText: false }));
  assert.equal(chunkSlides(big).length, 3); // ~7k characters per chunk
});

test("the job picks up where it stopped", () => {
  const now = Date.now();
  assert.deepEqual(nextStep({ status: "running", total: 4, resultsDone: 2, lockedUntil: null }, now), { chunk: 2 });
  assert.equal(nextStep({ status: "running", total: 4, resultsDone: 2, lockedUntil: new Date(now + 10_000).toISOString() }, now), "busy");
  assert.deepEqual(nextStep({ status: "running", total: 4, resultsDone: 2, lockedUntil: new Date(now - 1).toISOString() }, now), { chunk: 2 });
  assert.equal(nextStep({ status: "running", total: 4, resultsDone: 4, lockedUntil: null }, now), "finish");
  assert.equal(nextStep({ status: "done", total: 4, resultsDone: 4, lockedUntil: null }, now), "done");
  assert.equal(nextStep({ status: "queued", total: 4, resultsDone: 0, lockedUntil: null }, now), "not_started");
});

test("file types and names", () => {
  assert.deepEqual(uploadKind("Week 3.PPTX"), { kind: "pptx" });
  assert.deepEqual(uploadKind("show.ppsx"), { kind: "pptx" });
  assert.match((uploadKind("old.ppt") as { error: string }).error, /save or export it as \.pptx/);
  assert.match((uploadKind("macro.pptm") as { error: string }).error, /macros/);
  assert.match((uploadKind("deck.key") as { error: string }).error, /Keynote/);
  assert.equal(safeFileName("../../etc/pass wd.pptx"), "etc_pass_wd.pptx");
});
