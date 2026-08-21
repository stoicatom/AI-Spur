import { P, type Particle } from './particles';
import { TAU, rand, num, ease, layer, velScale, type EffectPreset } from './effects-core';

/** petal · 花瓣飘散：旋转下落。 */
export const petal: EffectPreset = {
  id: 'petal',
  sprite: (t, _vel, params) => {
    const petals = num(params, 'petals', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.sin(t * TAU * 2) * 35 * petals,
      dy: s * 110,
      scale: 1 + Math.sin(t * Math.PI) * 0.2,
      rot: s * TAU * petals,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const count = Math.round(num(params, 'count', 1) * 12);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU;
      out.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * 3 * vs, vy: Math.sin(ang) * 3 * vs + 2,
        life: 1, decay: rand(0.02, 0.03), size: rand(3, 6),
        hue: 0, gravity: 0.06, shape: 2, angle: ang,
      });
    }
    return layer([out]);
  },
};

/** spiral · 螺旋上升：粒子螺旋。 */
export const spiral: EffectPreset = {
  id: 'spiral',
  sprite: (t, _vel, params) => {
    const turns = num(params, 'turns', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    const ang = s * TAU * turns;
    return {
      dx: Math.cos(ang) * 50 * s,
      dy: -s * 130,
      scale: 1 + s * 0.35,
      rot: ang,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const turns = num(params, 'turns', 1);
    const vs = velScale(vel);
    return layer([
      P.spiral(cx, cy, 20, turns, 110, { hue: [0, 0], decay: [0.018, 0.03] }),
      P.burst(cx, cy, 6, 1, 3 * vs, { hue: [0, 0], gravity: -0.01, decay: [0.02, 0.03] }),
    ]);
  },
};

/** glow · 辉光膨胀：光晕扩散。 */
export const glow: EffectPreset = {
  id: 'glow',
  sprite: (t, _vel, params) => {
    const intensity = num(params, 'intensity', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 2, scale: 1 - c * 0.03, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: 0,
      dy: -s * 20,
      scale: 1 + s * 0.7 * intensity,
      rot: 0,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, vel, params) => {
    const intensity = num(params, 'intensity', 1);
    const vs = velScale(vel);
    return layer([
      P.flare(cx, cy, Math.round(3 * intensity), 30 * intensity, { hue: [0, 0] }),
      P.burst(cx, cy, 8, 1, 3 * vs, { hue: [0, 0], gravity: 0, decay: [0.02, 0.035] }),
    ]);
  },
};

/** twinkle · 星光闪烁：多点闪亮。 */
export const twinkle: EffectPreset = {
  id: 'twinkle',
  sprite: (t, _vel, params) => {
    const blinks = num(params, 'blinks', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = (t - 0.15) / 0.85;
    return {
      dx: Math.sin(t * TAU * blinks * 3) * 15,
      dy: -s * 40,
      scale: 1 + Math.abs(Math.sin(t * TAU * blinks * 4)) * 0.25,
      rot: 0,
      alpha: Math.abs(Math.sin(t * TAU * blinks * 2)),
    };
  },
  emit: (cx, cy, vel, params) => {
    const stars = Math.round(num(params, 'stars', 1) * 10);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < stars; i++) {
      const ang = rand(0, TAU);
      const r = rand(10, 50);
      out.push({
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        vx: 0, vy: 0,
        life: 1, decay: rand(0.025, 0.04), size: rand(2, 5),
        hue: 0, gravity: 0, shape: 0, angle: 0,
      });
    }
    return layer([out, P.spark(cx, cy, 6, 3, 6 * vs, { hue: [0, 0] })]);
  },
};

