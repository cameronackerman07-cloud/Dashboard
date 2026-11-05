"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

// A handwriting pad for maths working. Strokes are kept as points in a fixed
// coordinate space, so they survive window resizes and export sharply.

type Tip = "ballpoint" | "fountain" | "marker" | "pencil" | "highlighter" | "eraser";

// `m` is a width multiplier, used by the fountain pen.
type Point = { x: number; y: number; m?: number };
type Stroke = { tip: Tip; color: string; width: number; seed: number; points: Point[] };

export type DrawingPadHandle = {
  toImage: () => string | null; // a JPEG data URL, or null if nothing is drawn
  clear: () => void;
};

const TIPS: { id: Tip; label: string; multiplier: number }[] = [
  { id: "ballpoint", label: "Ballpoint", multiplier: 1 },
  { id: "fountain", label: "Fountain", multiplier: 1.15 },
  { id: "marker", label: "Marker", multiplier: 2.2 },
  { id: "pencil", label: "Pencil", multiplier: 1 },
  { id: "highlighter", label: "Highlighter", multiplier: 6 },
  { id: "eraser", label: "Eraser", multiplier: 10 },
];

// `logical` is the width in pad units and `screen` in on-screen pixels. Whichever
// comes out thicker wins, so strokes stay usable on a small phone screen.
const SIZES = [
  { id: "fine", label: "Fine", logical: 2, screen: 1.2 },
  { id: "medium", label: "Medium", logical: 3, screen: 1.8 },
  { id: "thick", label: "Thick", logical: 5, screen: 3 },
  { id: "extra", label: "Extra thick", logical: 8, screen: 5 },
];

const BLACK = "#0a0a0a";
const YELLOW = "#facc15";
const COLOURS = [
  { hex: BLACK, name: "Black" },
  { hex: "#1d4ed8", name: "Blue" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#15803d", name: "Green" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#7e22ce", name: "Purple" },
  { hex: YELLOW, name: "Yellow" },
];

const LOGICAL_WIDTH = 1000;
const START_HEIGHT = 900;
const HEIGHT_STEP = 500;
const MAX_HEIGHT = 3200; // iPhones refuse very large canvases
const EXPORT_WIDTH = 1400;
const MAX_EXPORT_CHARS = 3_000_000; // keep under the server action's limit
const AXIS_SNAP_DEGREES = 6;

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(n: number, low: number, high: number) {
  return Math.min(high, Math.max(low, n));
}

// A pale version of the colour. Drawn with "darken", so ink underneath stays
// readable and overlapping highlighter doesn't build up into blotches.
function lighten(hex: string): string {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16);
    return Math.round(value + (255 - value) * 0.55);
  };
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

// Repeatable randomness, so pencil grain looks the same every time it's redrawn.
function grain(seed: number): number {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

function setStyle(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number) {
  ctx.globalCompositeOperation =
    stroke.tip === "eraser"
      ? "destination-out"
      : stroke.tip === "highlighter"
        ? "darken"
        : "source-over";
  const colour = stroke.tip === "highlighter" ? lighten(stroke.color) : stroke.color;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = stroke.width * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function segmentWidth(stroke: Stroke, i: number, scale: number): number {
  const base = stroke.width * scale;
  if (stroke.tip === "fountain") return base * (stroke.points[i].m ?? 1);
  if (stroke.tip === "marker") {
    // A chisel tip held at 45 degrees: thick one way, thin the other. The angle
    // comes from a few points back so small wobbles don't make the width jump.
    if (i === 0) return base * 0.7;
    const from = stroke.points[Math.max(0, i - 3)];
    const to = stroke.points[i];
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    return base * (0.4 + 0.6 * Math.abs(Math.sin(angle - Math.PI / 4)));
  }
  return base;
}

function drawPencil(ctx: CanvasRenderingContext2D, stroke: Stroke, i: number, scale: number) {
  const pts = stroke.points;
  const to = pts[i];
  const from = pts[Math.max(0, i - 1)];
  const width = stroke.width * scale;
  const distance = Math.hypot(to.x - from.x, to.y - from.y) * scale;
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.6, width * 0.25)));
  const dot = Math.max(1, width * 0.4);

  for (let s = 0; s < steps; s++) {
    const t = (s + 1) / steps;
    for (let k = 0; k < 3; k++) {
      const key = stroke.seed + i * 131 + s * 17 + k * 7;
      ctx.globalAlpha = 0.25 + grain(key) * 0.45;
      ctx.fillRect(
        (from.x + (to.x - from.x) * t) * scale + (grain(key + 1) - 0.5) * width - dot / 2,
        (from.y + (to.y - from.y) * t) * scale + (grain(key + 2) - 0.5) * width - dot / 2,
        dot,
        dot,
      );
    }
  }
  ctx.globalAlpha = 1;
}

// Draws the part of a stroke that ends at point `i`, smoothing through midpoints.
function drawSegment(ctx: CanvasRenderingContext2D, stroke: Stroke, i: number, scale: number) {
  if (stroke.tip === "pencil") {
    drawPencil(ctx, stroke, i, scale);
    return;
  }
  const pts = stroke.points;
  ctx.lineWidth = segmentWidth(stroke, i, scale);
  if (i === 0) {
    ctx.beginPath();
    ctx.arc(pts[0].x * scale, pts[0].y * scale, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  if (i === 1) {
    const m = mid(pts[0], pts[1]);
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
    ctx.lineTo(m.x * scale, m.y * scale);
  } else {
    const start = mid(pts[i - 2], pts[i - 1]);
    const end = mid(pts[i - 1], pts[i]);
    ctx.moveTo(start.x * scale, start.y * scale);
    ctx.quadraticCurveTo(pts[i - 1].x * scale, pts[i - 1].y * scale, end.x * scale, end.y * scale);
  }
  ctx.stroke();
}

// The last half-segment, from the final midpoint out to the final point.
function drawTail(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number) {
  const pts = stroke.points;
  if (stroke.tip === "pencil" || pts.length < 2) return;
  const last = pts[pts.length - 1];
  const m = mid(pts[pts.length - 2], last);
  ctx.lineWidth = segmentWidth(stroke, pts.length - 1, scale);
  ctx.beginPath();
  ctx.moveTo(m.x * scale, m.y * scale);
  ctx.lineTo(last.x * scale, last.y * scale);
  ctx.stroke();
}

function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  for (const stroke of strokes) {
    setStyle(ctx, stroke, scale);
    for (let i = 0; i < stroke.points.length; i++) drawSegment(ctx, stroke, i, scale);
    drawTail(ctx, stroke, scale);
  }
  ctx.globalCompositeOperation = "source-over";
}

// If a stroke is roughly a straight line, returns the clean version of it. Curves
// and handwriting come back as null and are left alone. Near-level and near-upright
// lines snap exactly, which suits graph axes.
function straightened(pts: Point[], perScreenPx: number): Point[] | null {
  if (pts.length < 2) return null;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 20 * perScreenPx) return null;

  let travelled = 0;
  let furthest = 0;
  for (let i = 1; i < pts.length; i++) {
    travelled += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const offLine =
      Math.abs((end.x - start.x) * (start.y - pts[i].y) - (start.x - pts[i].x) * (end.y - start.y)) /
      length;
    furthest = Math.max(furthest, offLine);
  }
  if (travelled > length * 1.25) return null;
  if (furthest > Math.max(6 * perScreenPx, length * 0.07)) return null;

  let target = { x: end.x, y: end.y };
  const degrees = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  const fromLevel = Math.min(Math.abs(degrees), 180 - Math.abs(degrees));
  if (fromLevel <= AXIS_SNAP_DEGREES) {
    target = { x: start.x + Math.sign(end.x - start.x) * length, y: start.y };
  } else if (Math.abs(Math.abs(degrees) - 90) <= AXIS_SNAP_DEGREES) {
    target = { x: start.x, y: start.y + Math.sign(end.y - start.y) * length };
  }

  // Several points rather than two, so a fountain pen's width can still taper.
  const count = 16;
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const source = pts[Math.round(t * (pts.length - 1))];
    return {
      x: start.x + (target.x - start.x) * t,
      y: start.y + (target.y - start.y) * t,
      m: source.m,
    };
  });
}

export function DrawingPad({
  ref,
  onInkChange,
  disabled = false,
}: {
  ref?: Ref<DrawingPadHandle>;
  onInkChange?: (hasInk: boolean) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const clearedRef = useRef<Stroke[] | null>(null); // lets Undo bring back a Clear
  const activeRef = useRef<{
    pointerId: number;
    stroke: Stroke;
    perScreenPx: number;
    lastTime: number;
  } | null>(null);

  const [height, setHeight] = useState(START_HEIGHT);
  const [tip, setTip] = useState<Tip>("ballpoint");
  const [sizeId, setSizeId] = useState("medium");
  const [color, setColor] = useState(BLACK);
  const [straighten, setStraighten] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  // Once a stylus is seen, fingers scroll the page instead of drawing (palm rejection).
  const [penSeen, setPenSeen] = useState(false);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAll(ctx, strokesRef.current, canvas.width / LOGICAL_WIDTH);
  }

  function changed() {
    const strokes = strokesRef.current;
    setHasStrokes(strokes.length > 0);
    setCanUndo(strokes.length > 0 || !!clearedRef.current);
    setCanRedo(redoRef.current.length > 0);
    onInkChange?.(strokes.some((s) => s.tip !== "eraser"));
  }

  // Keep the bitmap matched to its on-screen size. While the pad is hidden its
  // size is 0, so this also redraws everything when it's shown again.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        redraw();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    // A new question: start completely fresh, with nothing left to undo.
    clear() {
      strokesRef.current = [];
      redoRef.current = [];
      clearedRef.current = null;
      activeRef.current = null;
      setHeight(START_HEIGHT);
      redraw();
      changed();
    },
    toImage() {
      const inked = strokesRef.current.filter((s) => s.tip !== "eraser");
      if (inked.length === 0) return null;

      // Crop empty space off the bottom: a smaller image is quicker to mark.
      const lowest = Math.max(...inked.flatMap((s) => s.points.map((p) => p.y)));
      const logicalHeight = Math.min(height, Math.max(200, lowest + 40));
      const scale = EXPORT_WIDTH / LOGICAL_WIDTH;

      // Erasing only works on a transparent layer, so draw ink first, then put it on white.
      const ink = document.createElement("canvas");
      ink.width = EXPORT_WIDTH;
      ink.height = Math.round(logicalHeight * scale);
      const inkCtx = ink.getContext("2d");
      const out = document.createElement("canvas");
      out.width = ink.width;
      out.height = ink.height;
      const outCtx = out.getContext("2d");
      if (!inkCtx || !outCtx) return null;

      drawAll(inkCtx, strokesRef.current, scale);
      outCtx.fillStyle = "#ffffff";
      outCtx.fillRect(0, 0, out.width, out.height);
      outCtx.drawImage(ink, 0, 0);

      const image = out.toDataURL("image/jpeg", 0.85);
      return image.length <= MAX_EXPORT_CHARS ? image : out.toDataURL("image/jpeg", 0.55);
    },
  }));

  function toPoint(e: { clientX: number; clientY: number }): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || activeRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType === "pen") setPenSeen(true);
    if (e.pointerType === "touch" && penSeen) return;

    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer can already be gone, such as a stylus lifted straight away.
    }

    const perScreenPx = LOGICAL_WIDTH / e.currentTarget.getBoundingClientRect().width;
    const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[1];
    const multiplier = TIPS.find((t) => t.id === tip)?.multiplier ?? 1;
    const stroke: Stroke = {
      tip,
      color,
      width: Math.max(size.logical, size.screen * perScreenPx) * multiplier,
      seed: strokesRef.current.length + 1,
      points: [{ ...toPoint(e), m: 1 }],
    };
    activeRef.current = { pointerId: e.pointerId, stroke, perScreenPx, lastTime: e.timeStamp };
    strokesRef.current.push(stroke);
    redoRef.current = [];
    clearedRef.current = null;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const scale = canvas.width / LOGICAL_WIDTH;
      setStyle(ctx, stroke, scale);
      drawSegment(ctx, stroke, 0, scale);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = canvas.width / LOGICAL_WIDTH;
    setStyle(ctx, active.stroke, scale);

    // Coalesced events catch the points between frames, so fast writing stays smooth.
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const events = coalesced.length ? coalesced : [e.nativeEvent];
    const pts = active.stroke.points;
    for (const ev of events) {
      const p = toPoint(ev);
      const prev = pts[pts.length - 1];
      const distance = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (distance < 0.5) continue;

      // Fountain pen: a stylus uses pressure; otherwise slower writing is thicker.
      const elapsed = Math.max(1, ev.timeStamp - active.lastTime);
      const speed = distance / active.perScreenPx / elapsed;
      const wanted =
        ev.pointerType === "pen" && ev.pressure > 0
          ? 0.35 + ev.pressure * 1.3
          : clamp(1.5 - speed * 0.5, 0.45, 1.5);
      p.m = (prev.m ?? 1) * 0.75 + wanted * 0.25;
      active.lastTime = ev.timeStamp;

      pts.push(p);
      drawSegment(ctx, active.stroke, pts.length - 1, scale);
    }
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    activeRef.current = null;

    const line =
      straighten && active.stroke.tip !== "eraser"
        ? straightened(active.stroke.points, active.perScreenPx)
        : null;
    if (line) {
      active.stroke.points = line;
      redraw();
    } else {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        setStyle(ctx, active.stroke, canvas.width / LOGICAL_WIDTH);
        drawTail(ctx, active.stroke, canvas.width / LOGICAL_WIDTH);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    changed();
  }

  function undo() {
    if (activeRef.current) return;
    const last = strokesRef.current.pop();
    if (last) {
      redoRef.current.push(last);
    } else if (clearedRef.current) {
      strokesRef.current = clearedRef.current;
      clearedRef.current = null;
    }
    redraw();
    changed();
  }

  function redo() {
    if (activeRef.current) return;
    const next = redoRef.current.pop();
    if (next) strokesRef.current.push(next);
    redraw();
    changed();
  }

  function clearPad() {
    if (activeRef.current) return;
    clearedRef.current = strokesRef.current;
    strokesRef.current = [];
    redoRef.current = [];
    redraw();
    changed();
  }

  function chooseTip(next: Tip) {
    // Black highlighter is just grey, so offer yellow, and go back again afterwards.
    if (next === "highlighter" && color === BLACK) setColor(YELLOW);
    if (tip === "highlighter" && next !== "highlighter" && next !== "eraser" && color === YELLOW) {
      setColor(BLACK);
    }
    setTip(next);
  }

  function chooseColour(next: string) {
    setColor(next);
    if (tip === "eraser") setTip("ballpoint"); // picking a colour means you want to draw
  }

  return (
    <div className="draw">
      <div className="tool-row" role="group" aria-label="Pen tip">
        {TIPS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-btn${tip === t.id ? " is-active" : ""}`}
            aria-pressed={tip === t.id}
            onClick={() => chooseTip(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tool-row" role="group" aria-label="Pen size">
        {SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tool-btn${sizeId === s.id ? " is-active" : ""}`}
            aria-pressed={sizeId === s.id}
            onClick={() => setSizeId(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="tool-row" role="group" aria-label="Pen colour">
        {COLOURS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className={`swatch${color === c.hex ? " is-active" : ""}`}
            style={{ background: c.hex }}
            aria-label={c.name}
            title={c.name}
            aria-pressed={color === c.hex}
            onClick={() => chooseColour(c.hex)}
          />
        ))}
        <label className="tool-btn swatch-custom">
          Custom
          <input
            type="color"
            aria-label="Choose a custom colour"
            value={color}
            onChange={(e) => chooseColour(e.target.value)}
          />
        </label>
      </div>

      <div className="tool-row" role="toolbar" aria-label="Drawing actions">
        <button
          type="button"
          className={`tool-btn${straighten ? " is-active" : ""}`}
          aria-pressed={straighten}
          onClick={() => setStraighten((on) => !on)}
        >
          Straighten lines
        </button>
        <button type="button" className="tool-btn" onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="tool-btn" onClick={redo} disabled={!canRedo}>
          Redo
        </button>
        <button type="button" className="tool-btn" onClick={clearPad} disabled={!hasStrokes}>
          Clear
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => setHeight((h) => Math.min(MAX_HEIGHT, h + HEIGHT_STEP))}
          disabled={height >= MAX_HEIGHT}
        >
          More space
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="draw-canvas"
        style={{
          aspectRatio: `${LOGICAL_WIDTH} / ${height}`,
          touchAction: penSeen ? "pan-y" : "none",
        }}
        role="img"
        aria-label="Handwriting area for your working"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <span className="card-meta">
        {straighten
          ? "Straighten is on: roughly straight strokes snap straight. Curves and writing stay as drawn."
          : penSeen
            ? "Stylus detected: write with it, and scroll with your finger."
            : "Write with a finger, stylus or mouse. On a phone, scroll by dragging outside the writing area."}
      </span>
    </div>
  );
}
