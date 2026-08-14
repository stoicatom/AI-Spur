/**
 * Main flow integration test
 *
 * Tests the new click→effect→macro interaction model.
 */
import { describe, it, expect } from 'vitest';
import { wantsFullAnimation } from '../overlay/quick_whip';
import {
  createEffect,
  updateEffect,
  type EffectKind,
} from '../overlay/effects';

// ── wantsFullAnimation Decision Tests ──────────────────────────────────────

describe('wantsFullAnimation decision logic', () => {
  it('returns true for standard mode', () => {
    expect(wantsFullAnimation('standard', 0, 20, false)).toBe(true);
  });

  it('returns false for fast mode', () => {
    expect(wantsFullAnimation('fast', 0, 20, false)).toBe(false);
  });

  it('returns true for auto mode below threshold', () => {
    expect(wantsFullAnimation('auto', 5, 20, false)).toBe(true);
  });

  it('returns false for auto mode above threshold', () => {
    expect(wantsFullAnimation('auto', 25, 20, false)).toBe(false);
  });

  it('forceFull overrides fast mode', () => {
    expect(wantsFullAnimation('fast', 0, 20, true)).toBe(true);
  });

  it('forceFull overrides auto mode above threshold', () => {
    expect(wantsFullAnimation('auto', 50, 20, true)).toBe(true);
  });
});

// ── Effect System Tests ───────────────────────────────────────────────────

describe('Effects system', () => {
  const EFFECT_KINDS: EffectKind[] = ['rocket', 'explosion', 'sparkle', 'starburst', 'firework'];

  describe('createEffect', () => {
    it.each(EFFECT_KINDS)('creates %s effect at click point', (kind) => {
      const e = createEffect(kind, 400, 300);
      expect(e.kind).toBe(kind);
      expect(e.cx).toBe(400);
      expect(e.cy).toBe(300);
      expect(e.alive).toBe(true);
      expect(e.particles).toHaveLength(0);
    });
  });

  describe('updateEffect lifecycle', () => {
    it.each(EFFECT_KINDS)('%s spawns particles on first update', (kind) => {
      const e = createEffect(kind, 400, 300);
      updateEffect(e, e.t0 + 16);
      expect(e.particles.length).toBeGreaterThan(0);
    });

    it.each(EFFECT_KINDS)('%s effect auto-expires after 2 seconds', (kind) => {
      const e = createEffect(kind, 400, 300);
      updateEffect(e, e.t0 + 2100);
      expect(e.alive).toBe(false);
    });
  });

  describe('explosion effect', () => {
    it('particles move outward from center', () => {
      const e = createEffect('explosion', 500, 500);
      updateEffect(e, e.t0 + 16);

      const avgDist = e.particles.reduce(
        (sum, p) => sum + Math.hypot(p.x - 500, p.y - 500),
        0,
      ) / e.particles.length;

      expect(avgDist).toBeGreaterThan(0);
    });
  });

  describe('firework effect', () => {
    it('spawns ~60 particles at click point', () => {
      const e = createEffect('firework', 400, 300);
      updateEffect(e, e.t0 + 16);
      expect(e.particles.length).toBe(60);
    });
  });

  describe('starburst effect', () => {
    it('creates particles in 8-arm pattern (64 particles)', () => {
      const e = createEffect('starburst', 400, 300);
      updateEffect(e, e.t0 + 16);
      expect(e.particles.length).toBe(64);
    });
  });

  describe('particle physics', () => {
    it('particles lose life over time', () => {
      const e = createEffect('explosion', 500, 500);
      updateEffect(e, e.t0 + 16);
      const initialCount = e.particles.length;

      for (let i = 0; i < 50; i++) {
        updateEffect(e, e.t0 + 16 + i * 16);
      }

      expect(e.particles.length).toBeLessThanOrEqual(initialCount);
    });

    it('gravity pulls particles down', () => {
      const e = createEffect('explosion', 500, 300);
      updateEffect(e, e.t0 + 16);

      // Track a single particle's y position
      const initialY = e.particles[0].y;

      for (let i = 0; i < 30; i++) {
        updateEffect(e, e.t0 + 16 + i * 16);
        if (e.particles.length === 0) break;
      }

      // At least some particles should have fallen below initial position
      const hasFallen = e.particles.some((p) => p.y > initialY);
      expect(hasFallen).toBe(true);
    });
  });
});

// ── Interaction Model Tests ───────────────────────────────────────────────

describe('Click-based interaction model', () => {
  it('effect is created at click coordinates', () => {
    const e = createEffect('explosion', 1920 / 2, 1080 / 2);
    expect(e.cx).toBe(960);
    expect(e.cy).toBe(540);
  });

  it('each effect kind can be created', () => {
    const kinds: EffectKind[] = ['rocket', 'explosion', 'sparkle', 'starburst', 'firework'];
    for (const kind of kinds) {
      const e = createEffect(kind, 100, 100);
      expect(e.kind).toBe(kind);
    }
  });
});
