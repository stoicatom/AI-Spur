import { describe, it, expect, vi } from 'vitest';
import {
  lerpColor,
  computeBoundingBox,
  whipSegmentBezier,
  clearDirtyRegion,
  drawWhip,
  drawBackdrop,
  DEFAULT_RENDER,
  DEFAULT_SKIN,
  type SkinConfig,
} from '../overlay/renderer';
import { createWhipState, DEFAULT_PHYSICS, type Point } from '../overlay/physics';

/**
 * jsdom provides no real 2D context, so drawing is verified against a stub that
 * records calls. This checks the renderer's contract with the canvas API
 * (which methods, in what order) rather than rasterized output.
 */
function fakeCtx() {
  return {
    lineCap: '' as CanvasLineCap,
    lineJoin: '' as CanvasLineJoin,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
  };
}

type FakeCtx = ReturnType<typeof fakeCtx>;

/** Cast the stub to the real type at the single boundary that needs it. */
function asCtx(ctx: FakeCtx): CanvasRenderingContext2D {
  return ctx as unknown as CanvasRenderingContext2D;
}

function pt(x: number, y: number): Point {
  return { x, y, px: x, py: y };
}

describe('lerpColor', () => {
  it('returns the start color at t=0 and the end color at t=1', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('interpolates each channel at the midpoint', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('clamps t outside [0,1]', () => {
    expect(lerpColor('#000000', '#ffffff', -5)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 5)).toBe('#ffffff');
  });

  it('pads channels so short hex values stay 6 digits', () => {
    // Interpolating toward near-black must not drop leading zeros
    expect(lerpColor('#000000', '#000010', 0.5)).toBe('#000008');
  });

  it('throws on a malformed hex color', () => {
    expect(() => lerpColor('red', '#ffffff', 0.5)).toThrow();
    expect(() => lerpColor('#fff', '#ffffff', 0.5)).toThrow();
  });
});

describe('computeBoundingBox', () => {
  it('returns a zero box for an empty point list', () => {
    expect(computeBoundingBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('encloses all points', () => {
    const box = computeBoundingBox([pt(10, 20), pt(50, 5), pt(30, 40)]);
    expect(box).toEqual({ x: 10, y: 5, w: 40, h: 35 });
  });

  it('handles a single point as a zero-area box', () => {
    expect(computeBoundingBox([pt(7, 9)])).toEqual({ x: 7, y: 9, w: 0, h: 0 });
  });
});

describe('whipSegmentBezier', () => {
  it('ends the curve at the next point', () => {
    const pts = [pt(0, 0), pt(10, 0), pt(20, 0), pt(30, 0)];
    const seg = whipSegmentBezier(pts, 1);
    expect(seg.x2).toBe(20);
    expect(seg.y2).toBe(0);
  });

  it('extrapolates control points at the ends without producing NaN', () => {
    const pts = [pt(0, 0), pt(10, 5)];
    const seg = whipSegmentBezier(pts, 0);
    for (const value of Object.values(seg)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('clearDirtyRegion', () => {
  it('clears only the bounding box plus the margin, not the whole canvas', () => {
    const ctx = fakeCtx();
    clearDirtyRegion(asCtx(ctx), [pt(100, 100), pt(200, 150)]);
    const m = DEFAULT_RENDER.dirtyMargin;
    expect(ctx.clearRect).toHaveBeenCalledWith(100 - m, 100 - m, 100 + m * 2, 50 + m * 2);
  });
});

describe('drawWhip', () => {
  it('draws nothing when there are fewer than 2 points', () => {
    const ctx = fakeCtx();
    drawWhip(asCtx(ctx), {
      pts: [pt(0, 0)],
      dropping: false,
      lastCrackTime: 0,
      spawnTime: 0,
      handleAngle: 0,
      handleAngVel: 0,
    });
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('strokes a full whip without throwing', () => {
    const ctx = fakeCtx();
    const state = createWhipState(500, 300, DEFAULT_PHYSICS);
    expect(() => drawWhip(asCtx(ctx), state)).not.toThrow();
    // 1 outline pass + 1 handle-halo pass + one stroke per link
    const links = state.pts.length - 1;
    expect(ctx.stroke).toHaveBeenCalledTimes(2 + links);
  });

  it('uses the skin outline color for the halo pass', () => {
    const ctx = fakeCtx();
    const skin: SkinConfig = { ...DEFAULT_SKIN, outlineColor: '#abcdef' };
    const state = createWhipState(400, 200, DEFAULT_PHYSICS);
    const seen: string[] = [];
    // Record strokeStyle at each stroke() call
    ctx.stroke = vi.fn(() => {
      seen.push(String(ctx.strokeStyle));
    });
    drawWhip(asCtx(ctx), state, skin);
    expect(seen[0]).toBe('#abcdef');
  });

  it('applies the handle color to the handle links and the gradient after', () => {
    const ctx = fakeCtx();
    const skin: SkinConfig = {
      ...DEFAULT_SKIN,
      handleColor: '#ff0000',
      bodyGradient: ['#000000', '#ffffff'],
    };
    const state = createWhipState(400, 200, DEFAULT_PHYSICS);
    const seen: string[] = [];
    ctx.stroke = vi.fn(() => {
      seen.push(String(ctx.strokeStyle));
    });
    drawWhip(asCtx(ctx), state, skin);
    // Body pass starts after the 2 halo passes
    const body = seen.slice(2);
    expect(body[0]).toBe('#ff0000');
    expect(body[DEFAULT_RENDER.handleThickSegments]).not.toBe('#ff0000');
  });

  it('sets and then resets the shadow when tipGlow is on', () => {
    const ctx = fakeCtx();
    const skin: SkinConfig = { ...DEFAULT_SKIN, tipGlow: true, bodyGradient: ['#000000', '#00ff00'] };
    const state = createWhipState(400, 200, DEFAULT_PHYSICS);
    // Capture the blur active during the body pass; asserting only the final
    // value would also pass if the glow had never been applied at all.
    const blurDuringDraw: number[] = [];
    ctx.stroke = vi.fn(() => {
      blurDuringDraw.push(ctx.shadowBlur);
    });
    drawWhip(asCtx(ctx), state, skin);
    expect(blurDuringDraw.some((b) => b > 0)).toBe(true);
    expect(ctx.shadowColor).toBe('#00ff00');
    // Reset after drawing so the glow does not leak into later frames
    expect(ctx.shadowBlur).toBe(0);
  });

  it('leaves the shadow untouched when tipGlow is off', () => {
    const ctx = fakeCtx();
    const state = createWhipState(400, 200, DEFAULT_PHYSICS);
    drawWhip(asCtx(ctx), state, { ...DEFAULT_SKIN, tipGlow: false });
    expect(ctx.shadowColor).toBe('');
  });
});

describe('drawBackdrop', () => {
  it('fills the canvas with the skin bgAlpha', () => {
    const ctx = fakeCtx();
    drawBackdrop(asCtx(ctx), 1920, 1080, { ...DEFAULT_SKIN, bgAlpha: 0.011 });
    expect(ctx.fillStyle).toBe('rgba(0,0,0,0.011)');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
  });
});
