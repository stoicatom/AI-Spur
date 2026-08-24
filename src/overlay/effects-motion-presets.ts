import { P, type Particle } from './particles';
import { TAU, rand, num, ease, layer, velScale, burstDir, type EffectPreset } from './effects-core';

/** jet · 火箭喷射：蓄力下蹲 → 垂直冲天 + 尾焰 + 音爆环。 */
export const jet: EffectPreset = {
  id: 'jet',
  sprite: (t, vel, params) => {
    const thrust = num(params, 'thrust', 1);
    const climb = num(params, 'climb', 1);
    // 蓄力：0-15% 下蹲聚能（scale 收缩到 0.92）
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 8, scale: 1 - c * 0.08, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: -Math.sin(burstDir(vel)) * s * 60 * thrust,
      dy: -s * 140 * climb - Math.sin(t * Math.PI) * 18,
      scale: 1 + s * 0.55,
      rot: 0,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, vel, params) => {
    const thrust = num(params, 'thrust', 1);
    const vs = velScale(vel);
    return layer([
      P.burst(cx, cy, Math.round(16 * thrust), 2, 5, { hue: [0, 0], gravity: 0.12, shape: 1, decay: [0.02, 0.035] })
        .map((p) => ({ ...p, vy: p.vy + 4 })),
      P.pillar(cx, cy, Math.round(8 * thrust), 90, { hue: [0, 0], decay: [0.015, 0.025] }),
      P.ringWave(cx, cy, 10, 30, 4 * vs, { hue: [0, 0] }),
    ]);
  },
};

/** rise · 展翅上腾：双翼向两侧扩散 + 上升。 */
export const rise: EffectPreset = {
  id: 'rise',
  sprite: (t, _vel, params) => {
    const spread = num(params, 'spread', 1);
    const riseSpeed = num(params, 'riseSpeed', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 6, scale: 1 - c * 0.06, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.sin(t * Math.PI * 2) * 30 * spread,
      dy: -s * 150 * riseSpeed,
      scale: 1 + s * 0.4,
      rot: Math.sin(t * Math.PI * 2) * 0.25 * spread,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const spread = num(params, 'spread', 1);
    const vs = velScale(vel);
    return layer([
      P.arcSweep(cx, cy, 10, Math.PI * 0.6, Math.PI, 120 * spread, { hue: [0, 0], decay: [0.02, 0.03] }),
      P.arcSweep(cx, cy, 10, 0, Math.PI * 0.4, 120 * spread, { hue: [0, 0], decay: [0.02, 0.03] }),
      P.burst(cx, cy, 8, 2, 5 * vs, { hue: [0, 0], gravity: -0.02, shape: 0, decay: [0.015, 0.025] }),
    ]);
  },
};

/** wave · 波浪推进：横向正弦波 + 水花。 */
export const wave: EffectPreset = {
  id: 'wave',
  sprite: (t, vel, params) => {
    const amplitude = num(params, 'amplitude', 1);
    const undulation = num(params, 'undulation', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 5, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.cos(burstDir(vel)) * s * 120 * amplitude,
      dy: Math.sin(t * TAU * 2 * undulation) * 20 * amplitude,
      scale: 1 + Math.sin(t * TAU * 3 * undulation) * 0.15,
      rot: Math.sin(t * TAU * 2 * undulation) * 0.2,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const amplitude = num(params, 'amplitude', 1);
    const vs = velScale(vel);
    const dir = burstDir(vel);
    // 沿甩动方向的弧线波
    const out: Particle[] = [];
    for (let i = 0; i < 14; i++) {
      const f = i / 14;
      const ang = dir + Math.sin(f * TAU * 2) * 0.4;
      out.push({
        x: cx + Math.cos(dir) * f * 100 * amplitude,
        y: cy + Math.sin(dir) * f * 100 * amplitude,
        vx: Math.cos(ang) * 2 * vs, vy: Math.sin(ang) * 2 * vs,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
        hue: 0, gravity: 0.03, shape: 1, angle: ang,
      });
    }
    return layer([
      out,
      P.burst(cx, cy, 8, 2, 4 * vs, { hue: [0, 0], gravity: 0.05, decay: [0.02, 0.03] }),
    ]);
  },
};

/** orbit · 轨道环绕：粒子沿椭圆轨道旋转 + 中心闪光。 */
export const orbit: EffectPreset = {
  id: 'orbit',
  sprite: (t, _vel, params) => {
    const orbits = num(params, 'orbits', 1);
    const radius = num(params, 'radius', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    const ang = s * TAU * orbits;
    return {
      dx: Math.cos(ang) * 30 * radius,
      dy: Math.sin(ang) * 15 * radius,
      scale: 1 + s * 0.3,
      rot: s * TAU * orbits,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const orbits = num(params, 'orbits', 1);
    const radius = num(params, 'radius', 1);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < 18; i++) {
      const f = i / 18;
      const ang = f * TAU * orbits + burstDir(vel);
      const r = 20 + f * 70 * radius;
      out.push({
        x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.7,
        vx: -Math.sin(ang) * 2 * vs, vy: Math.cos(ang) * 2 * vs,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
        hue: 0, gravity: 0, shape: 1, angle: ang + Math.PI / 2,
      });
    }
    return layer([out, P.flare(cx, cy, 1, 20 * radius, { hue: [0, 0] })]);
  },
};

/** dash · 冲刺突进：水平高速位移 + 残影 + 尾迹。 */
export const dash: EffectPreset = {
  id: 'dash',
  sprite: (t, vel, params) => {
    const dashLength = num(params, 'dashLength', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.06, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.cos(burstDir(vel)) * s * 160 * dashLength,
      dy: Math.sin(burstDir(vel)) * s * 80 * dashLength,
      scale: 1 + s * 0.35,
      rot: 0,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, vel, params) => {
    const dashLength = num(params, 'dashLength', 1);
    const vs = velScale(vel);
    const dir = burstDir(vel);
    const out: Particle[] = [];
    // 残影：沿位移方向排列的 ghost
    for (let i = 0; i < 10; i++) {
      const f = i / 10;
      out.push({
        x: cx - Math.cos(dir) * f * 90 * dashLength,
        y: cy - Math.sin(dir) * f * 90 * dashLength,
        vx: 0, vy: 0,
        life: 1, decay: rand(0.03, 0.05), size: rand(3, 6),
        hue: 0, gravity: 0, shape: 0, angle: 0,
      });
    }
    return layer([
      out,
      P.burst(cx, cy, Math.round(10 * dashLength), 3, 8 * vs, { hue: [0, 0], shape: 1, decay: [0.02, 0.035] }),
      P.spark(cx, cy, 6, 4, 8 * vs, { hue: [0, 0] }),
    ]);
  },
};

