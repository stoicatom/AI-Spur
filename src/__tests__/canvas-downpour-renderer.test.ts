import { describe, expect, it } from 'vitest';
import { drawCanvasDownpour, type CanvasDownpourContext } from '../overlay/canvas-downpour';

function context() {
  const lines: [number, number][] = [];
  const ellipses: [number, number][] = [];
  const ctx: CanvasDownpourContext = {
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: 'butt',
    save() {}, restore() {}, beginPath() {}, moveTo(x, y) { lines.push([x, y]); },
    lineTo(x, y) { lines.push([x, y]); }, stroke() {},
    ellipse(x, y) { ellipses.push([x, y]); }, fill() {},
  };
  return { ctx, lines, ellipses };
}

describe('Canvas full-screen downpour', () => {
  it('draws three screen-wide rain sheets plus ground splashes and mist', () => {
    const { ctx, lines, ellipses } = context();
    drawCanvasDownpour(ctx, 1440, 900, {
      dropDensity: 2.8, fallSpeed: 2.15, windSkew: .72, splashEnergy: 1.55,
      curtainWidth: 2.4, sheetDepth: .9,
    }, 640, 204);
    const xs = lines.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(144);
    expect(Math.max(...xs)).toBeGreaterThan(1296);
    expect(lines.length).toBeGreaterThan(360);
    expect(ellipses.some(([, y]) => y > 860)).toBe(true);
  });
});
