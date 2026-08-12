import type { Point, WhipState } from './physics';
import { lerp } from './constraints';

/**
 * Visual parameters that are independent of the active skin.
 * Values carried over verbatim from the v1 overlay.html `P` object.
 */
export interface RenderParams {
  lineWidthHandle: number;
  lineWidthTip: number;
  outlineWidth: number;
  handleExtraWidth: number;
  handleThickSegments: number;
  /** Extra padding around the whip's bounding box when clearing (px). */
  dirtyMargin: number;
}

export const DEFAULT_RENDER: RenderParams = {
  lineWidthHandle: 7,
  lineWidthTip: 5,
  outlineWidth: 3,
  handleExtraWidth: 5,
  handleThickSegments: 2,
  dirtyMargin: 24,
};

/**
 * Skin-driven colors and effects consumed by the renderer.
 *
 * Structurally compatible with `SkinVisuals` from `shared/skins`, so a parsed
 * manifest's `visuals` can be passed straight in. Kept as its own type so the
 * renderer does not depend on the IPC/schema layer.
 */
export interface SkinConfig {
  handleColor: string;
  bodyGradient: [string, string];
  tipGlow: boolean;
  outlineColor: string;
  bgAlpha: number;
}

export const DEFAULT_SKIN: SkinConfig = {
  handleColor: '#111111',
  bodyGradient: ['#111111', '#333333'],
  tipGlow: false,
  outlineColor: '#ffffff',
  bgAlpha: 0.011,
};

/** Axis-aligned bounding box in canvas coordinates. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Color helpers ───────────────────────────────────────────────────────────

/** Parse `#rrggbb` into its channels. Throws on malformed input. */
function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Interpolate between two `#rrggbb` colors.
 * `t` is clamped to [0, 1] so callers need not guard the ends.
 */
export function lerpColor(from: string, to: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = parseHex(from);
  const [r2, g2, b2] = parseHex(to);
  const r = Math.round(lerp(r1, r2, clamped));
  const g = Math.round(lerp(g1, g2, clamped));
  const b = Math.round(lerp(b1, b2, clamped));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ── Catmull-Rom spline (migrated from v1 overlay.html) ──────────────────────

/** Spline control point for index `i`, extrapolating past either end. */
function catmullPoint(pts: Point[], i: number): { x: number; y: number } {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (i < 0) {
    if (n >= 2) {
      return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    }
    return { x: pts[0].x, y: pts[0].y };
  }
  if (i >= n) {
    if (n >= 2) {
      const a = pts[n - 2];
      const b = pts[n - 1];
      return { x: 2 * b.x - a.x, y: 2 * b.y - a.y };
    }
    return { x: pts[n - 1].x, y: pts[n - 1].y };
  }
  return pts[i];
}

/**
 * Cubic Bézier from `pts[i]` to `pts[i+1]` matching a uniform Catmull-Rom
 * spline through the four surrounding points.
 */
export function whipSegmentBezier(
  pts: Point[],
  i: number
): { cp1x: number; cp1y: number; cp2x: number; cp2y: number; x2: number; y2: number } {
  const p0 = catmullPoint(pts, i - 1);
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = catmullPoint(pts, i + 2);
  return {
    cp1x: p1.x + (p2.x - p0.x) / 6,
    cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6,
    cp2y: p2.y - (p3.y - p1.y) / 6,
    x2: p2.x,
    y2: p2.y,
  };
}

// ── Dirty-region clearing (R-PERF-002) ─────────────────────────────────────

/** Bounding box enclosing every whip point. */
export function computeBoundingBox(pts: Point[]): BoundingBox {
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Clear only the region the whip occupies, plus a margin for stroke width and
 * motion between frames. Clearing the whole canvas each frame is what
 * R-PERF-002 forbids.
 */
export function clearDirtyRegion(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  params: RenderParams = DEFAULT_RENDER
): void {
  const box = computeBoundingBox(pts);
  const m = params.dirtyMargin;
  ctx.clearRect(box.x - m, box.y - m, box.w + m * 2, box.h + m * 2);
}

// ── Whip rendering ─────────────────────────────────────────────────────────

/** Trace the full spline path from the handle to the tip. */
function traceSpline(ctx: CanvasRenderingContext2D, pts: Point[], upTo: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < upTo; i++) {
    const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
  }
  ctx.stroke();
}

/**
 * Draw the whip using the given skin.
 *
 * Renders in three passes, matching v1: an outline halo over the whole spline,
 * a thicker halo over the handle links, then the body itself with the skin's
 * gradient interpolated from handle to tip.
 *
 * `particleEffect` from the manifest is intentionally not handled here — it
 * needs per-particle state across frames, so it belongs to a separate layer
 * rather than this stateless draw call.
 */
export function drawWhip(
  ctx: CanvasRenderingContext2D,
  state: WhipState,
  skin: SkinConfig = DEFAULT_SKIN,
  params: RenderParams = DEFAULT_RENDER
): void {
  const pts = state.pts;
  if (pts.length < 2) return;

  const links = pts.length - 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Pass 1 — outline halo across the whole spline.
  ctx.strokeStyle = skin.outlineColor;
  ctx.lineWidth = params.lineWidthTip + params.outlineWidth * 2;
  traceSpline(ctx, pts, links);

  // Pass 2 — thicker halo over the handle links only.
  const thickLinks = Math.min(params.handleThickSegments, links);
  if (thickLinks > 0 && params.handleExtraWidth > 0) {
    ctx.lineWidth = params.lineWidthHandle + params.handleExtraWidth + params.outlineWidth * 2;
    traceSpline(ctx, pts, thickLinks);
  }

  // Pass 3 — the body, per link, so the gradient can advance along the whip.
  const glowApplied = skin.tipGlow;
  if (glowApplied) {
    ctx.shadowColor = skin.bodyGradient[1];
    ctx.shadowBlur = 12;
  }
  for (let i = 0; i < links; i++) {
    const t = i / Math.max(1, links - 1);
    const extra = i < params.handleThickSegments ? params.handleExtraWidth : 0;
    ctx.strokeStyle =
      i < params.handleThickSegments
        ? skin.handleColor
        : lerpColor(skin.bodyGradient[0], skin.bodyGradient[1], t);
    ctx.lineWidth = lerp(params.lineWidthHandle, params.lineWidthTip, t) + extra;
    const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i);
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    ctx.stroke();
  }
  if (glowApplied) {
    ctx.shadowBlur = 0;
  }
}

/**
 * Paint the near-invisible backdrop that lets a transparent window receive
 * mouse events (needed on Windows; harmless elsewhere).
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  skin: SkinConfig = DEFAULT_SKIN
): void {
  ctx.fillStyle = `rgba(0,0,0,${skin.bgAlpha})`;
  ctx.fillRect(0, 0, width, height);
}
