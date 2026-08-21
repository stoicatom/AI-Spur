import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_PIXEL_BUDGET,
  MAX_CANVAS_PIXEL_RATIO,
  pixelRatioFor,
  resizeCanvas2D,
} from '../overlay/canvas-pixel-budget';

describe('canvas pixel budget', () => {
  it('caps high-DPR and extreme-size backing stores', () => {
    for (const [width, height] of [[3840, 2160], [7680, 4320], [15360, 8640]]) {
      const ratio = pixelRatioFor(width, height, 4);
      expect(width * height * ratio * ratio).toBeLessThanOrEqual(CANVAS_PIXEL_BUDGET + 1);
      expect(ratio).toBeLessThanOrEqual(MAX_CANVAS_PIXEL_RATIO);
    }
  });

  it('keeps CSS dimensions while bounding the 2D backing store', () => {
    const canvas = document.createElement('canvas');
    const setTransform = vi.fn();
    const ratio = resizeCanvas2D(canvas, { setTransform }, 3840, 2160, 3);

    expect(canvas.style.width).toBe('3840px');
    expect(canvas.style.height).toBe('2160px');
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(CANVAS_PIXEL_BUDGET);
    expect(setTransform).toHaveBeenLastCalledWith(ratio, 0, 0, ratio, 0, 0);
  });

  it('recomputes the backing store and CSS viewport on resize', () => {
    const canvas = document.createElement('canvas');
    const setTransform = vi.fn();
    resizeCanvas2D(canvas, { setTransform }, 1200, 800, 2);
    const initial = { width: canvas.width, height: canvas.height };

    const ratio = resizeCanvas2D(canvas, { setTransform }, 2560, 1440, 4);

    expect(canvas.style.width).toBe('2560px');
    expect(canvas.style.height).toBe('1440px');
    expect({ width: canvas.width, height: canvas.height }).not.toEqual(initial);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(CANVAS_PIXEL_BUDGET);
    expect(setTransform).toHaveBeenLastCalledWith(ratio, 0, 0, ratio, 0, 0);
  });
});
