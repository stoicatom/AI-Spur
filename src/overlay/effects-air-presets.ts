import { P, type Particle } from './particles';
import { TAU, rand, num, ease, layer, velScale, burstDir, type EffectPreset } from './effects-core';

/** whirl · 旋风回旋：螺旋上升 + 吸入感。 */
export const whirl: EffectPreset = {
  id: 'whirl',
  sprite: (t, _vel, params) => {
    const spirals = num(params, 'spirals', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    const ang = s * TAU * 2 * spirals;
    return {
      dx: Math.cos(ang) * 60 * s,
      dy: -s * 140 * spirals,
      scale: 1 + Math.sin(t * TAU * 3) * 0.2,
      rot: s * TAU * spirals,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const spirals = num(params, 'spirals', 1);
    const vs = velScale(vel);
    return layer([
      P.spiral(cx, cy, 24, spirals, 130, { hue: [0, 0], decay: [0.018, 0.03] }),
      P.burst(cx, cy, 8, 1, 4 * vs, { hue: [0, 0], gravity: -0.01, decay: [0.02, 0.03] }),
      P.flare(cx, cy, 1, 18, { hue: [0, 0] }),
    ]);
  },
};

/** vortex · 漩涡聚拢：向心旋转。 */
export const vortex: EffectPreset = {
  id: 'vortex',
  sprite: (t, _vel, params) => {
    const intensity = num(params, 'intensity', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.inCubic((t - 0.15) / 0.85);
    const ang = -s * TAU * 2 * intensity;
    return {
      dx: Math.cos(ang) * 60 * (1 - s),
      dy: Math.sin(ang) * 60 * (1 - s),
      scale: 1 - s * 0.6,
      rot: ang,
      alpha: 1 - s * 0.3,
    };
  },
  emit: (cx, cy, vel, params) => {
    const intensity = num(params, 'intensity', 1);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < 24; i++) {
      const f = i / 24;
      const ang = -f * TAU * 2 * intensity + burstDir(vel);
      const r = 80 * (1 - f);
      out.push({
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        vx: -Math.cos(ang) * 3 * vs * (1 - f),
        vy: -Math.sin(ang) * 3 * vs * (1 - f),
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
        hue: 0, gravity: 0, shape: 1, angle: ang - Math.PI / 2,
      });
    }
    return layer([out, P.flare(cx, cy, 1, 20, { hue: [0, 0] })]);
  },
};

/** rain · 雨丝斜落：斜线粒子。 */
export const rain: EffectPreset = {
  id: 'rain',
  sprite: (t, _vel, params) => {
    const density = num(params, 'density', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: s * 50,
      dy: s * 120 * density,
      scale: 1 + s * 0.2,
      rot: Math.PI / 4,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const density = num(params, 'density', 1);
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let i = 0; i < 18 * density; i++) {
      const ang = Math.PI / 4 + rand(-0.1, 0.1);
      out.push({
        x: cx + rand(-40, 40),
        y: cy + rand(-20, 20),
        vx: Math.cos(ang) * rand(3, 6) * vs,
        vy: Math.sin(ang) * rand(4, 8) * vs,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
        hue: 0, gravity: 0.08, shape: 1, angle: ang,
      });
    }
    return layer([out]);
  },
};

