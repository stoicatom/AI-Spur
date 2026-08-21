import { P, type Particle } from './particles';
import { TAU, rand, num, ease, layer, velScale, burstDir, type EffectPreset } from './effects-core';

/** shatter · 粉碎炸裂：多面碎块 + 火花 + 尘烟。 */
export const shatter: EffectPreset = {
  id: 'shatter',
  sprite: (t, _vel, params) => {
    const sparkle = num(params, 'sparkle', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 5, scale: 1 - c * 0.1, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: (Math.random() - 0.5) * 40 * (1 - t),
      dy: -t * 80 * sparkle,
      scale: 1 - s * 0.3,
      rot: t * TAU * 1.5,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, vel, params) => {
    const shards = num(params, 'shards', 1);
    const vs = velScale(vel);
    return layer([
      P.shards(cx, cy, Math.round(18 * shards), 4, 11 * vs, { hue: [0, 0], decay: [0.025, 0.04], gravity: 0.12 }),
      P.spark(cx, cy, 8, 6, 12 * vs, { hue: [0, 0] }),
      P.burst(cx, cy, 6, 1, 3, { hue: [0, 0], gravity: 0.02, decay: [0.02, 0.03] }), // 尘烟
    ]);
  },
};

/** burst · 幽魂爆散：放射状飞散 + 飘浮 + 中心微光。 */
export const burst: EffectPreset = {
  id: 'burst',
  sprite: (t, _vel, params) => {
    const drift = num(params, 'drift', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.sin(t * TAU * 2) * 20 * drift,
      dy: -s * 60 * drift,
      scale: 1 + s * 0.5,
      rot: t * Math.PI * drift,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, vel, params) => {
    const count = Math.round(num(params, 'count', 1) * 16);
    const vs = velScale(vel);
    return layer([
      P.burst(cx, cy, count, 2, 7 * vs, { hue: [0, 0], gravity: -0.02, decay: [0.015, 0.025] }),
      P.flare(cx, cy, 1, 26, { hue: [0, 0] }),
    ]);
  },
};

/** shock-ring · 雷震环波：多环冲击波 + 中心雷闪。 */
export const shockRing: EffectPreset = {
  id: 'shock-ring',
  sprite: (t, _vel, params) => {
    const intensity = num(params, 'intensity', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: 0,
      dy: -s * 20 * intensity,
      scale: 1 + s * 0.8 * intensity,
      rot: 0,
      alpha: t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5,
    };
  },
  emit: (cx, cy, vel, params) => {
    const rings = Math.round(num(params, 'rings', 2));
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let r = 0; r < rings; r++) {
      out.push(...P.shockRing(cx, cy, 14, 40 + r * 40, 80 + r * 40, { hue: [0, 0], decay: [0.012, 0.02] }));
    }
    return layer([
      out,
      P.spark(cx, cy, 8, 4, 9 * vs, { hue: [0, 0] }),
      P.flare(cx, cy, 1, 30, { hue: [0, 0] }),
    ]);
  },
};

/** star-burst · 星形爆发：五角星状粒子 + 中心闪光。 */
export const starBurst: EffectPreset = {
  id: 'star-burst',
  sprite: (t, _vel, params) => {
    const twinkle = num(params, 'twinkle', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.06, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.sin(t * TAU * 3 * twinkle) * 10,
      dy: -s * 30,
      scale: 1 + Math.sin(t * TAU * 4 * twinkle) * 0.25,
      rot: t * Math.PI * 0.5,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const points = Math.round(num(params, 'points', 1) * 5);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < points; i++) {
      const ang = (i / points) * TAU - Math.PI / 2 + burstDir(vel) * 0.3;
      out.push(...P.burst(cx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40, 4, 3, 7 * vs, { hue: [0, 0], decay: [0.02, 0.03] }));
    }
    return layer([out, P.flare(cx, cy, 1, 22, { hue: [0, 0] })]);
  },
};

/** explode · 爆炸震荡：放射状碎片 + 冲击环 + 火球。 */
export const explode: EffectPreset = {
  id: 'explode',
  sprite: (t, _vel, params) => {
    const force = num(params, 'force', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 5, scale: 1 - c * 0.12, rot: 0, alpha: 1 };
    }
    const s = ease.outQuart((t - 0.15) / 0.85);
    return {
      dx: (Math.random() - 0.5) * 60 * (1 - t) * force,
      dy: -s * 40 * force,
      scale: 1 + s * 0.9 * force,
      rot: t * TAU * 1.2,
      alpha: t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5,
    };
  },
  emit: (cx, cy, vel, params) => {
    const force = num(params, 'force', 1);
    const vs = velScale(vel);
    return layer([
      P.shards(cx, cy, Math.round(18 * force), 6, 14 * vs, { hue: [0, 0], decay: [0.025, 0.04], gravity: 0.15 }),
      P.shockRing(cx, cy, 14, 30, 70, { hue: [0, 0], decay: [0.012, 0.02] }),
      P.flare(cx, cy, 2, 35, { hue: [0, 0] }),
      P.spark(cx, cy, 10, 5, 11 * vs, { hue: [0, 0] }),
    ]);
  },
};

/** impact · 冲击落地：蓄力 → 坠地 + 地裂 + 尘土。 */
export const impact: EffectPreset = {
  id: 'impact',
  sprite: (t, _vel, params) => {
    const force = num(params, 'force', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: -c * 40 * force, scale: 1 - c * 0.08, rot: 0, alpha: 1 };
    }
    const s = ease.inCubic((t - 0.15) / 0.35);
    if (t < 0.5) {
      return {
        dx: 0,
        dy: s * 130 * force,
        scale: 1 + s * 0.3,
        rot: 0,
        alpha: 1,
      };
    }
    const afterS = (t - 0.5) / 0.5;
    return {
      dx: 0,
      dy: 130 * force - afterS * 30,
      scale: 1.3 - afterS * 0.2,
      rot: 0,
      alpha: 1 - afterS,
    };
  },
  emit: (cx, cy, vel, params) => {
    const force = num(params, 'force', 1);
    const vs = velScale(vel);
    const ground = cy + 100;
    const cracks: Particle[] = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI - Math.PI / 2;
      for (let j = 0; j < 3; j++) {
        cracks.push({
          x: cx + Math.cos(ang) * j * 20 * force,
          y: ground + Math.sin(ang) * j * 20 * force,
          vx: Math.cos(ang) * 1.5, vy: Math.sin(ang) * 1.5,
          life: 1, decay: rand(0.02, 0.03), size: rand(2, 4),
          hue: 0, gravity: 0, shape: 2, angle: ang,
        });
      }
    }
    return layer([
      cracks,
      P.shockRing(cx, ground, 12, 30, 80, { hue: [0, 0], gravity: 0.05 }),
      P.burst(cx, ground, Math.round(16 * force), 3, 8 * vs, { hue: [0, 0], gravity: 0.1, decay: [0.025, 0.04] }),
    ]);
  },
};

