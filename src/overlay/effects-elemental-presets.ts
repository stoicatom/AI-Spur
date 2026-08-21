import { P, type Particle } from './particles';
import { TAU, rand, num, ease, layer, velScale, type EffectPreset } from './effects-core';

/** bolt · 雷电劈落：闪电链 + 抖动 + 余闪。 */
export const bolt: EffectPreset = {
  id: 'bolt',
  sprite: (t, _vel, params) => {
    const flicker = num(params, 'flicker', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1, rot: 0, alpha: 0.6 + c * 0.4 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.sin(t * 30 * flicker) * 4 * (1 - t),
      dy: s * 220,
      scale: 1 + Math.sin(t * 40 * flicker) * 0.15,
      rot: 0,
      alpha: t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5,
    };
  },
  emit: (cx, cy, vel, params) => {
    const branches = Math.round(num(params, 'branches', 1) * 3);
    const vs = velScale(vel);
    const out: Particle[] = [];
    // 闪电主干：竖直方向高频抖动 streak
    for (let i = 0; i < 12; i++) {
      out.push({
        x: cx + rand(-14, 14) * (1 - i / 14),
        y: cy + i * 14,
        vx: rand(-2, 2), vy: rand(1, 4) * vs,
        life: 1, decay: rand(0.02, 0.045), size: rand(2, 4),
        hue: 0, gravity: 0, shape: 1, angle: Math.PI / 2,
      });
    }
    // 分支：左右随机折线
    for (let b = 0; b < branches; b++) {
      for (let i = 0; i < 4; i++) {
        const dirX = Math.random() < 0.5 ? -1 : 1;
        out.push({
          x: cx + dirX * rand(10, 30) * (i / 4),
          y: cy + rand(30, 90),
          vx: dirX * rand(1, 3), vy: rand(1, 3) * vs,
          life: 1, decay: rand(0.03, 0.05), size: rand(1.5, 3),
          hue: 0, gravity: 0, shape: 1, angle: Math.PI / 2,
        });
      }
    }
    return layer([out, P.spark(cx, cy, 8, 4, 9 * vs, { hue: [0, 0] })]);
  },
};

/** flame-rise · 火焰升腾：蓄力 → 爆发上冲 + 火星 + 浓烟。 */
export const flameRise: EffectPreset = {
  id: 'flame-rise',
  sprite: (t, _vel, params) => {
    const turbulence = num(params, 'turbulence', 1);
    const riseSpeed = num(params, 'riseSpeed', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: Math.sin(c * 8) * 3, dy: c * 6, scale: 1 - c * 0.08, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.sin(t * 16 * turbulence) * 12 * (1 - t),
      dy: -s * 160 * riseSpeed,
      scale: 1 + s * 0.6,
      rot: Math.sin(t * 12) * 0.1,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, vel, params) => {
    const turbulence = num(params, 'turbulence', 1);
    const vs = velScale(vel);
    const out: Particle[] = [];
    // 火焰主体：上升的抖动 dot
    for (let i = 0; i < Math.round(20 * turbulence); i++) {
      out.push({
        x: cx + rand(-20, 20) * (1 - i / 30),
        y: cy + rand(0, 10),
        vx: rand(-1.5, 1.5),
        vy: rand(-5, -2) * vs,
        life: 1, decay: rand(0.02, 0.04), size: rand(3, 7),
        hue: 0, gravity: -0.03, shape: 0, angle: 0,
      });
    }
    // 火星：快速飞溅的 spark
    const sparks = P.spark(cx, cy, 6, 4, 9 * vs, { hue: [0, 0] });
    // 浓烟：灰色上浮 shard
    const smoke = P.burst(cx, cy, 6, 1, 3, { hue: [0, 0], gravity: -0.04, decay: [0.025, 0.04] });
    return layer([out, sparks, smoke]);
  },
};

/** shatter-ice · 冰晶爆碎：尖棱飞溅 + 寒气 + 冰尘。 */
export const shatterIce: EffectPreset = {
  id: 'shatter-ice',
  sprite: (t, _vel, params) => {
    const chill = num(params, 'chill', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.08, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: (Math.random() - 0.5) * 50 * (1 - t),
      dy: -s * 100 * chill,
      scale: 1 - s * 0.4,
      rot: t * TAU * 2,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, vel, params) => {
    const shards = num(params, 'shards', 1);
    const vs = velScale(vel);
    return layer([
      P.shards(cx, cy, Math.round(22 * shards), 5, 13 * vs, { hue: [0, 0], decay: [0.02, 0.035], gravity: 0.1 }),
      P.burst(cx, cy, 10, 5, 12 * vs, { hue: [0, 0], shape: 1, gravity: 0.08, decay: [0.02, 0.03] }),
      P.burst(cx, cy, 6, 1, 2, { hue: [0, 0], gravity: 0.02, decay: [0.03, 0.05] }), // 冰尘
    ]);
  },
};

/** water-splash · 水花四溅：抛物线水滴 + 涟漪 + 水汽。 */
export const waterSplash: EffectPreset = {
  id: 'water-splash',
  sprite: (t, _vel, params) => {
    const splashHeight = num(params, 'splashHeight', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    return {
      dx: Math.sin(t * TAU * 2) * 15,
      dy: -Math.sin(t * Math.PI) * 120 * splashHeight,
      scale: 1 + Math.sin(t * Math.PI) * 0.3,
      rot: Math.sin(t * TAU) * 0.3,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, vel, params) => {
    const droplets = num(params, 'droplets', 1);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < 16 * droplets; i++) {
      const ang = rand(-Math.PI * 0.8, -Math.PI * 0.2);
      const sp = rand(4, 9) * vs;
      out.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
        hue: 0, gravity: 0.18, shape: 0, angle: 0,
      });
    }
    return layer([
      out,
      P.ringWave(cx, cy, 8, 16, 3, { hue: [0, 0] }), // 涟漪
      P.burst(cx, cy, 6, 1, 3, { hue: [0, 0], gravity: 0.05, decay: [0.03, 0.045] }), // 水汽
    ]);
  },
};

