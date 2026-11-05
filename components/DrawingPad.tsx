"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

// A handwriting pad for maths working. Strokes are kept as points in a fixed
// coordinate space, so they survive window resizes and export sharply.

type Point = { x: number; y: number };
type Stroke = { tool: "pen" | "eraser"; width: number; points: Point[] };

export type DrawingPadHandle = {
  toImage: () => string | null; // a JPEG data URL, or null if nothing is drawn
  clear: () => void;
};

const LOGICAL_WIDTH = 1000;
const START_HEIGHT = 900;
const HEIGHT_STEP = 500;
const MAX_HEIGHT = 3200; // iPhones refuse very large canvases
// Stroke widths, in logical units and in on-screen pixels. Whichever comes out
// thicker wins, so the pen and eraser stay usable on a small phone screen.
const PEN_WIDTH = 3;
const PEN_SCREEN_PX = 1.8;
const ERASER_WIDTH = 30;
const ERASER_SCREEN_PX = 22;
const EXPORT_WIDTH = 1400;
const MAX_EXPORT_CHARS = 3_000_000; // keep under the server action's limit

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function setStyle(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number) {
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = "#0a0a0a";
  ctx.fillStyle = "#0a0a0a";
  ctx.lineWidth = stroke.width * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

// Draws the part of a stroke that ends at point `i`, smoothing through midpoints.
function drawSegment(ctx: CanvasRenderingContext2D, pts: Point[], i: number, scale: number) {
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
function drawTail(ctx: CanvasRenderingContext2D, pts: Point[], scale: number) {
  if (pts.length < 2) return;
  const last = pts[pts.length - 1];
  const m = mid(pts[pts.length - 2], last);
  ctx.beginPath();
  ctx.moveTo(m.x * scale, m.y * scale);
  ctx.lineTo(last.x * scale, last.y * scale);
  ctx.stroke();
}

function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  for (const stroke of strokes) {
    setStyle(ctx, stroke, scale);
    for (let i = 0; i < stroke.points.length; i++) drawSegment(ctx, stroke.points, i, scale);
    drawTail(ctx, stroke.points, scale);
  }
  ctx.globalCompositeOperation = "source-over";
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
  const activeRef = useRef<{ pointerId: number; stroke: Stroke } | null>(null);

  const [height, setHeight] = useState(START_HEIGHT);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [strokeCount, setStrokeCount] = useState(0);
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
    setStrokeCount(strokesRef.current.length);
    onInkChange?.(strokesRef.current.some((s) => s.tool === "pen"));
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

  function clear() {
    strokesRef.current = [];
    activeRef.current = null;
    setHeight(START_HEIGHT);
    redraw();
    changed();
  }

  useImperativeHandle(ref, () => ({
    clear,
    toImage() {
      const pens = strokesRef.current.filter((s) => s.tool === "pen");
      if (pens.length === 0) return null;

      // Crop empty space off the bottom: a smaller image is quicker to mark.
      const lowest = Math.max(...pens.flatMap((s) => s.points.map((p) => p.y)));
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
    e.currentTarget.setPointerCapture(e.pointerId);

    const perScreenPx = LOGICAL_WIDTH / e.currentTarget.getBoundingClientRect().width;
    const width =
      tool === "pen"
        ? Math.max(PEN_WIDTH, PEN_SCREEN_PX * perScreenPx)
        : Math.max(ERASER_WIDTH, ERASER_SCREEN_PX * perScreenPx);

    const stroke: Stroke = { tool, width, points: [toPoint(e)] };
    activeRef.current = { pointerId: e.pointerId, stroke };
    strokesRef.current.push(stroke);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const scale = canvas.width / LOGICAL_WIDTH;
      setStyle(ctx, stroke, scale);
      drawSegment(ctx, stroke.points, 0, scale);
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
      if (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) < 0.5) continue;
      pts.push(p);
      drawSegment(ctx, pts, pts.length - 1, scale);
    }
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    activeRef.current = null;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const scale = canvas.width / LOGICAL_WIDTH;
      setStyle(ctx, active.stroke, scale);
      drawTail(ctx, active.stroke.points, scale);
      ctx.globalCompositeOperation = "source-over";
    }
    changed();
  }

  function undo() {
    if (activeRef.current) return;
    strokesRef.current.pop();
    redraw();
    changed();
  }

  return (
    <div className="draw">
      <div className="draw-tools" role="toolbar" aria-label="Drawing tools">
        <div className="seg">
          <button
            type="button"
            className={`seg-btn${tool === "pen" ? " is-active" : ""}`}
            aria-pressed={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            type="button"
            className={`seg-btn${tool === "eraser" ? " is-active" : ""}`}
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
        </div>
        <button type="button" className="btn" onClick={undo} disabled={strokeCount === 0}>
          Undo
        </button>
        <button type="button" className="btn" onClick={clear} disabled={strokeCount === 0}>
          Clear
        </button>
        <button
          type="button"
          className="btn"
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
        {penSeen
          ? "Stylus detected: write with it, and scroll with your finger."
          : "Write with a finger, stylus or mouse. On a phone, scroll by dragging outside the writing area."}
      </span>
    </div>
  );
}
