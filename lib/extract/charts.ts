// Reads a chart inside a PowerPoint or Word file (a DrawingML chart part,
// e.g. ppt/charts/chart1.xml) and turns it into plain text with the real
// numbers: no AI needed, and nothing is guessed. Pure code, fully tested.

import { tokens } from "./pptx";

const TYPES: Record<string, string> = {
  "c:barChart": "bar chart",
  "c:bar3DChart": "bar chart",
  "c:lineChart": "line graph",
  "c:line3DChart": "line graph",
  "c:pieChart": "pie chart",
  "c:pie3DChart": "pie chart",
  "c:ofPieChart": "pie chart",
  "c:doughnutChart": "doughnut chart",
  "c:areaChart": "area chart",
  "c:area3DChart": "area chart",
  "c:scatterChart": "scatter graph",
  "c:bubbleChart": "bubble chart",
  "c:radarChart": "radar chart",
  "c:stockChart": "stock chart",
  "c:surfaceChart": "surface chart",
  "c:surface3DChart": "surface chart",
};

const MAX_SERIES = 8;
const MAX_POINTS = 40;

type Series = { name: string; cats: Map<number, string>; vals: Map<number, string> };

const num = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v.trim();
  // 0.30000000000000004 → 0.3
  return String(Math.round(n * 1e6) / 1e6);
};

export type ChartText = { title: string | null; type: string; lines: string[] };

export function readChartXml(xml: string): ChartText {
  let type = "chart";
  let barDir: string | null = null;
  let title = "";
  const axisTitles: string[] = [];
  const series: Series[] = [];
  let ser: Series | null = null;
  // Where we are: "title" (chart or axis), "tx" (series name), "cat"/"xVal", "val"/"yVal".
  let inTitle: "chart" | "axis" | null = null;
  let axisTitle = "";
  let part: "tx" | "cat" | "val" | null = null;
  let ptIdx = -1;
  let inV = false;
  let inT = false;
  let depthAx = 0;

  for (const t of tokens(xml)) {
    if ("text" in t) {
      if (inT && inTitle === "chart" && !ser) title += t.text;
      else if (inT && inTitle === "axis") axisTitle += t.text;
      else if (inV && ser && part) {
        const v = t.text.trim();
        if (part === "tx") ser.name += v;
        else if (ptIdx >= 0) (part === "cat" ? ser.cats : ser.vals).set(ptIdx, part === "val" ? num(v) : v);
      }
      continue;
    }
    const { name, attrs, close, selfClose } = t;
    if (TYPES[name] && !close) type = TYPES[name];
    else if (name === "c:barDir" && !close) barDir = attrs.val ?? null;
    else if (name === "c:valAx" || name === "c:catAx" || name === "c:dateAx" || name === "c:serAx") {
      if (!close && !selfClose) depthAx++;
      else if (close) depthAx--;
    } else if (name === "c:title") {
      if (!close && !selfClose) {
        inTitle = depthAx > 0 ? "axis" : ser ? null : "chart";
        axisTitle = "";
      } else if (close) {
        if (inTitle === "axis" && axisTitle.trim()) axisTitles.push(axisTitle.replace(/\s+/g, " ").trim());
        inTitle = null;
      }
    } else if (name === "a:t") inT = !close && !selfClose;
    else if (name === "c:ser") {
      if (!close && !selfClose) ser = { name: "", cats: new Map(), vals: new Map() };
      else if (close) {
        if (ser && series.length < MAX_SERIES) series.push(ser);
        ser = null;
      }
    } else if (ser && (name === "c:tx" || name === "c:cat" || name === "c:xVal" || name === "c:val" || name === "c:yVal")) {
      if (!close && !selfClose) part = name === "c:tx" ? "tx" : name === "c:cat" || name === "c:xVal" ? "cat" : "val";
      else if (close) part = null;
    } else if (name === "c:pt" && ser) {
      if (!close) ptIdx = Number(attrs.idx ?? -1);
      if (close || selfClose) ptIdx = -1;
    } else if (name === "c:v") inV = !close && !selfClose;
  }

  if (type === "bar chart" && barDir === "col") type = "column chart";
  const lines: string[] = [];
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 200) || null;
  if (axisTitles.length) lines.push(`Axes: ${axisTitles.slice(0, 3).join("; ")}`);
  series.forEach((s, i) => {
    const idx = [...new Set([...s.cats.keys(), ...s.vals.keys()])].sort((a, b) => a - b).slice(0, MAX_POINTS);
    const points = idx
      .filter((k) => s.vals.has(k))
      .map((k) => (s.cats.has(k) ? `${s.cats.get(k)} = ${s.vals.get(k)}` : s.vals.get(k)!))
      .join(", ");
    if (points) lines.push(`${s.name.trim() || `Series ${i + 1}`}: ${points}`);
  });
  return { title: cleanTitle, type, lines };
}

// "Chart (column chart): Rainfall by month" + data lines, ready to go in a slide's text.
export function chartLines(c: ChartText): string[] {
  if (!c.lines.length && !c.title) return [];
  return [`Chart (${c.type})${c.title ? `: ${c.title}` : ""}`, ...c.lines.map((l) => `  ${l}`)];
}
