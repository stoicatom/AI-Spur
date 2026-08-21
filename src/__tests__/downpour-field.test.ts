import { describe, expect, it } from 'vitest';
import {
  downpourCoverage,
  downpourDropAt,
  downpourLayerCount,
  downpourSplashAt,
  resolveDownpourField,
} from '../overlay/downpour-field';

const params = {
  dropDensity: 2.8,
  fallSpeed: 2.15,
  windSkew: 0.72,
  splashEnergy: 1.55,
  curtainWidth: 2.4,
  sheetDepth: 0.9,
};

describe('downpour full-viewport field', () => {
  const config = resolveDownpourField(params);

  it('scales the three depth layers with viewport area', () => {
    for (const layer of ['background', 'middle', 'foreground'] as const) {
      expect(downpourLayerCount(1920, 1080, config, layer))
        .toBeGreaterThan(downpourLayerCount(960, 540, config, layer));
    }
  });

  it('covers most of the screen while every drop falls downward', () => {
    for (const layer of ['background', 'middle', 'foreground'] as const) {
      const count = downpourLayerCount(1440, 900, config, layer);
      const drops = Array.from({ length: count }, (_, index) =>
        downpourDropAt(index, count, 1440, 900, config, layer, 630));
      expect(Math.min(...drops.map((drop) => drop.x))).toBeLessThan(144);
      expect(Math.max(...drops.map((drop) => drop.x))).toBeGreaterThan(1296);
      expect(drops.every((drop) => drop.vy > 0)).toBe(true);
      expect(drops.every((drop) => Math.abs(drop.vx) < drop.vy * 0.22)).toBe(true);
    }
    expect(downpourCoverage(1440, config).maxX - downpourCoverage(1440, config).minX)
      .toBeGreaterThan(1296);
  });

  it('distributes ground splashes across the full bottom edge', () => {
    const splashes = Array.from({ length: 24 }, (_, index) =>
      downpourSplashAt(index, 24, 1440, 900, config, 520));
    expect(Math.min(...splashes.map((splash) => splash.x))).toBeLessThan(100);
    expect(Math.max(...splashes.map((splash) => splash.x))).toBeGreaterThan(1340);
    expect(splashes.every((splash) => splash.y >= 893 && splash.y <= 898)).toBe(true);
  });
});
