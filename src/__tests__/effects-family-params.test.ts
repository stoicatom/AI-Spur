import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EFFECT_PRESETS } from '../overlay/effects';
import { DEFAULT_VEL } from '../overlay/particles';
import type { EffectPresetId } from '../shared/material-packs';

const FAMILY_PACK_IDS = [
  'tornado', 'wildfire', 'revolver', 'glass-shot', 'boxing-glove', 'bullwhip',
  'piano', 'saxophone', 'vinyl', 'fireworks', 'black-hole',
] as const;

type DiskPack = {
  effect: { preset: EffectPresetId; params: Record<string, number> };
};

function diskPack(id: (typeof FAMILY_PACK_IDS)[number]): DiskPack {
  const path = resolve(__dirname, `../../src-tauri/packs/${id}/pack.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as DiskPack;
}

/**
 * Deliberately excludes `sprite()`: dedicated material packs do not draw their source
 * image in Canvas fallback, so only emitted particle state proves a parameter is visible.
 */
function emitSignature(preset: EffectPresetId, params: Record<string, number>): string {
  const effect = EFFECT_PRESETS[preset];
  const velocity = { ...DEFAULT_VEL, vx: 4, vy: -3, speed: 6, dir: -0.64 };
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.371);
  try {
    const particles = effect.emit(320, 180, velocity, params);
    return JSON.stringify([
      particles.length,
      particles.slice(0, 100).map((particle) => [
        particle.shape,
        Math.round(particle.x * 100),
        Math.round(particle.y * 100),
        Math.round(particle.vx * 100),
        Math.round(particle.vy * 100),
        Math.round(particle.life * 1000),
        Math.round(particle.decay * 10000),
        Math.round(particle.size * 100),
        Math.round(particle.hue * 100),
        Math.round(particle.gravity * 1000),
        Math.round(particle.angle * 1000),
        Math.round((particle.delay ?? 0) * 1000),
        particle.data ?? null,
      ]),
    ]);
  } finally {
    random.mockRestore();
  }
}

function adjusted(value: number): number {
  return value >= 0 ? value * 1.61 + 0.17 : value - 0.37;
}

describe('Canvas family preset parameters', () => {
  it.each(FAMILY_PACK_IDS)('%s 的 Canvas 回退粒子数受预算限制', (id) => {
    const pack = diskPack(id);
    const particles = EFFECT_PRESETS[pack.effect.preset].emit(320, 180, DEFAULT_VEL, pack.effect.params);
    expect(particles.length).toBeGreaterThan(0);
    expect(particles.length).toBeLessThanOrEqual(115);
  });

  it.each(FAMILY_PACK_IDS)('%s 的每个 manifest 参数都会改变 Canvas 粒子物理', (id) => {
    const pack = diskPack(id);
    const baseline = emitSignature(pack.effect.preset, pack.effect.params);

    for (const [key, value] of Object.entries(pack.effect.params)) {
      const changed = { ...pack.effect.params, [key]: adjusted(value) };
      expect(emitSignature(pack.effect.preset, changed), `${id}.${key}`).not.toBe(baseline);
    }
  });
});
