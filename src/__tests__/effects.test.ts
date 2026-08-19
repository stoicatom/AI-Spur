import { describe, it, expect } from 'vitest';
import { EFFECT_PRESETS, resolveEffect } from '../overlay/effects';
import { EffectPresetSchema } from '../shared/material-packs';
import { DEFAULT_VEL } from '../overlay/particles';

describe('特效预设库', () => {
  const vel = { ...DEFAULT_VEL, speed: 3, dir: -Math.PI / 2 };
  const params: Record<string, number> = {};

  it('恰好注册 30 个预设，与 schema 一致', () => {
    const ids = Object.keys(EFFECT_PRESETS).sort();
    const schemaIds = [...EffectPresetSchema.options].sort();
    expect(ids).toEqual(schemaIds);
    expect(ids).toHaveLength(30);
  });

  it('每个预设都能生成精灵帧（t 全程可运行）', () => {
    for (const id of EffectPresetSchema.options) {
      const preset = EFFECT_PRESETS[id];
      for (const t of [0, 0.1, 0.3, 0.5, 0.75, 0.95, 0.99]) {
        const frame = preset.sprite(t, vel, params);
        expect(Number.isFinite(frame.dx), `${id} dx@${t}`).toBe(true);
        expect(Number.isFinite(frame.dy), `${id} dy@${t}`).toBe(true);
        expect(Number.isFinite(frame.scale), `${id} scale@${t}`).toBe(true);
        expect(Number.isFinite(frame.rot), `${id} rot@${t}`).toBe(true);
        expect(frame.alpha).toBeGreaterThanOrEqual(0);
        expect(frame.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('每个预设都能发射粒子（数量合理、字段完整）', () => {
    for (const id of EffectPresetSchema.options) {
      const preset = EFFECT_PRESETS[id];
      const particles = preset.emit(100, 100, vel, params);
      expect(particles.length, `${id} particle count`).toBeGreaterThan(0);
      expect(particles.length, `${id} particle cap`).toBeLessThanOrEqual(120);
      for (const p of particles.slice(0, 5)) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.vy)).toBe(true);
        expect(p.life).toBeGreaterThan(0);
        expect(p.decay).toBeGreaterThan(0);
        expect(p.shape === 0 || p.shape === 1 || p.shape === 2).toBe(true);
      }
    }
  });

  it('未知预设回退 jet（永不崩溃）', () => {
    const preset = resolveEffect('not-a-real-preset');
    expect(preset.id).toBe('jet');
    const frame = preset.sprite(0.5, vel, params);
    expect(Number.isFinite(frame.dx)).toBe(true);
  });

  it('参数化能改变轨迹（不同参数 → 不同位移）', () => {
    const preset = EFFECT_PRESETS.jet;
    const weak = preset.sprite(0.5, vel, { climb: 0.5 });
    const strong = preset.sprite(0.5, vel, { climb: 2.0 });
    expect(Math.abs(strong.dy)).toBeGreaterThan(Math.abs(weak.dy));
  });

  it('特效签名两两不同（差异化保证）', () => {
    const seen = new Set<string>();
    for (const id of EffectPresetSchema.options) {
      // 采样精灵轨迹的 5 个点作为签名
      const sig = [0.1, 0.3, 0.5, 0.7, 0.9]
        .map((t) => {
          const f = EFFECT_PRESETS[id].sprite(t, vel, params);
          return `${Math.round(f.dx * 10)}:${Math.round(f.dy * 10)}:${Math.round(f.rot * 10)}`;
        })
        .join('|');
      seen.add(sig);
    }
    expect(seen.size).toBe(30);
  });
});
