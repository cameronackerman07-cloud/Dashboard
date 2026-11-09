import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, unzlibSync, zipSync } from "fflate";
import { chartLines, readChartXml } from "@/lib/extract/charts";
import { encodePng, shrink } from "@/lib/extract/png";
import { pickPptxPictures, readDocxExtras } from "@/lib/extract/pictures";
import { readPptx } from "@/lib/extract/pptx";
import { batchCount, batchEnd } from "@/lib/upload-jobs";
import { uploadKind } from "@/lib/upload-files";

const C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const pts = (vals: (string | number)[]) => vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("");
const chartXml = `<?xml version="1.0"?><c:chartSpace ${C}><c:chart>
  <c:title><c:tx><c:rich><a:p><a:r><a:t>Rainfall by month</a:t></a:r></a:p></c:rich></c:tx></c:title>
  <c:plotArea><c:barChart><c:barDir val="col"/>
    <c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Sydney</c:v></c:pt></c:strCache></c:strRef></c:tx>
      <c:cat><c:strRef><c:strCache>${pts(["Jan", "Feb", "Mar"])}</c:strCache></c:strRef></c:cat>
      <c:val><c:numRef><c:numCache><c:formatCode>General</c:formatCode>${pts([101.2, 117.6, "0.30000000000000004"])}</c:numCache></c:numRef></c:val></c:ser>
  </c:barChart>
  <c:catAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Month</a:t></a:r></a:p></c:rich></c:tx></c:title></c:catAx>
  <c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Rain (mm)</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx>
  </c:plotArea></c:chart></c:chartSpace>`;

test("charts are read with their real numbers, title, type and axes", () => {
  const c = readChartXml(chartXml);
  assert.equal(c.title, "Rainfall by month");
  assert.equal(c.type, "column chart");
  assert.deepEqual(chartLines(c), ["Chart (column chart): Rainfall by month", "  Axes: Month; Rain (mm)", "  Sydney: Jan = 101.2, Feb = 117.6, Mar = 0.3"]);
});

test("chart XML with a DOCTYPE is refused", () => {
  assert.throws(() => readChartXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><c:chartSpace/>'));
});

test("a PNG made from raw pixels has the right header and pixels", () => {
  const px = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]); // 2x2 RGB
  const png = encodePng(px, 2, 2, 3);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(png.buffer, png.byteOffset);
  assert.equal(dv.getUint32(16), 2);
  assert.equal(dv.getUint32(20), 2);
  const idatLen = dv.getUint32(33);
  const raw = unzlibSync(png.subarray(41, 41 + idatLen));
  assert.deepEqual([...raw], [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
});

test("big pictures are shrunk to the longest side", () => {
  const s = shrink(new Uint8Array(4000 * 1000 * 3), 4000, 1000, 3, 1600);
  assert.equal(s.width, 1600);
  assert.equal(s.height, 400);
  assert.equal(s.data.length, 1600 * 400 * 3);
});

function deck() {
  const slide = (inner: string) => `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
  const pic = (rid: string) => `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture"/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill></p:pic>`;
  const relsFor = (list: [string, string, string][]) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, t]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${t}"/>`).join("")}</Relationships>`;
  const files: Record<string, Uint8Array> = {
    "ppt/presentation.xml": strToU8(`<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${[1, 2, 3].map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("")}</p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(relsFor([1, 2, 3].map((n) => [`rId${n}`, "slide", `slides/slide${n}.xml`]))),
    // Slide 1: a diagram, the logo and a chart. Slides 2–3: the logo again.
    "ppt/slides/slide1.xml": strToU8(slide(pic("rId1") + pic("rId2") + '<p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="x" r:id="rId3"/></a:graphicData></a:graphic></p:graphicFrame>')),
    "ppt/slides/slide2.xml": strToU8(slide(pic("rId2") + pic("rId4"))),
    "ppt/slides/slide3.xml": strToU8(slide(pic("rId2"))),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(relsFor([["rId1", "image", "../media/diagram.png"], ["rId2", "image", "../media/logo.png"], ["rId3", "chart", "../charts/chart1.xml"]])),
    "ppt/slides/_rels/slide2.xml.rels": strToU8(relsFor([["rId2", "image", "../media/logo.png"], ["rId4", "image", "../media/drawing.emf"]])),
    "ppt/slides/_rels/slide3.xml.rels": strToU8(relsFor([["rId2", "image", "../media/logo.png"]])),
    "ppt/charts/chart1.xml": strToU8(chartXml),
    "ppt/media/diagram.png": new Uint8Array(20_000).fill(7),
    "ppt/media/logo.png": new Uint8Array(20_000).fill(9),
    "ppt/media/drawing.emf": new Uint8Array(20_000),
  };
  return zipSync(files);
}

test("PowerPoint charts become slide text and only real pictures are picked", () => {
  const bytes = deck();
  const d = readPptx(bytes);
  assert.match(d.slides[0].body, /Chart \(column chart\): Rainfall by month/);
  assert.match(d.slides[0].body, /Sydney: Jan = 101.2/);
  assert.equal(d.slides[0].lowText, false, "a slide with a chart has content");
  // The EMF isn't readable; the logo is on all three slides, so it's decoration.
  const pics = pickPptxPictures(bytes, d.images);
  assert.equal(pics.length, 1);
  assert.equal(pics[0].slide, 1);
  assert.equal(pics[0].mime, "image/png");
  assert.equal(pics[0].data[0], 7);
});

test("tiny pictures are skipped and the per-file cap holds", () => {
  const bytes = deck();
  const d = readPptx(bytes);
  assert.equal(pickPptxPictures(bytes, d.images, { maxPictures: 24, minBytes: 50_000, maxBytes: 4e6, decorativeRepeats: 3, minPixels: 1, maxSide: 1, maxPdfPages: 1 }).length, 0);
});

test("Word charts and pictures are found in order", () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="x" xmlns:c="y"';
  const bytes = zipSync({
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document ${W}><w:body><w:p><a:blip r:embed="rId1"/></w:p><w:p><c:chart r:id="rId2"/></w:p><w:p><a:blip r:embed="rId3"/></w:p></w:body></w:document>`),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/image" Target="media/image1.jpeg"/><Relationship Id="rId2" Type="${REL}/chart" Target="charts/chart1.xml"/><Relationship Id="rId3" Type="${REL}/image" Target="../../outside.png"/></Relationships>`,
    ),
    "word/charts/chart1.xml": strToU8(chartXml),
    "word/media/image1.jpeg": new Uint8Array(30_000).fill(3),
  });
  const x = readDocxExtras(bytes);
  assert.equal(x.charts[0], "Chart (column chart): Rainfall by month");
  assert.equal(x.pictures.length, 1, "a picture outside word/ is never followed");
  assert.equal(x.pictures[0].mime, "image/jpeg");
});

test("pictures are sent four at a time, and big ones on their own", () => {
  const small = Array.from({ length: 9 }, () => ({ size: 100_000 }));
  assert.equal(batchEnd(small, 0), 4);
  assert.equal(batchEnd(small, 8), 9);
  assert.equal(batchCount(small), 3);
  const big = [{ size: 10e6 }, { size: 5e6 }, { size: 1e6 }];
  assert.equal(batchEnd(big, 0), 1, "10 MB + 5 MB is over the 12 MB per call");
  assert.equal(batchCount(big), 2);
  assert.equal(batchCount([]), 0);
});

test("photos can be uploaded; GIFs get a clear message", () => {
  assert.deepEqual(uploadKind("whiteboard.HEIC"), { kind: "image" });
  assert.deepEqual(uploadKind("notes.jpg"), { kind: "image" });
  assert.ok("error" in uploadKind("funny.gif"));
});
