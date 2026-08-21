import { afterEach, describe, expect, it, vi } from 'vitest';
import { EFFECT_PRESETS } from '../overlay/effects';

const params = { dropDensity: 2.8, fallSpeed: 2.15, windSkew: 0.72, splashEnergy: 1.55, curtainWidth: 2.4, sheetDepth: 0.9 };

describe('Canvas downpour fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('covers the viewport, falls down and ignores whip direction', () => {
    vi.stubGlobal('innerWidth', 1440);
    vi.stubGlobal('innerHeight', 900);
    const left = EFFECT_PRESETS.downpour.emit(120, 120, { vx: -1, vy: 0, speed: 8, dir: Math.PI }, params);
    const right = EFFECT_PRESETS.downpour.emit(120, 120, { vx: 1, vy: 0, speed: 1, dir: 0 }, params);
    expect(left).toEqual(right);
    expect(left.length).toBeLessThanOrEqual(115);
    const rain = left.filter((particle) => particle.shape === 4);
    expect(Math.min(...rain.map((particle) => particle.x))).toBeLessThan(144);
    expect(Math.max(...rain.map((particle) => particle.x))).toBeGreaterThan(1296);
    expect(rain.every((particle) => particle.vy > 0 && Math.abs(particle.vx) < particle.vy * 0.22)).toBe(true);
    expect(left.some((particle) => particle.shape === 3 && particle.y > 890)).toBe(true);
    expect(left.some((particle) => particle.shape === 6 && particle.y > 880)).toBe(true);
  });
});
