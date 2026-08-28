import { P, type Particle } from './particles';
import { TAU, rand, num, ease, layer, velScale, burstDir, type EffectPreset } from './effects-core';

/** comet · 坠击爆燃：拖尾 + 爆裂。 */
export const comet: EffectPreset = {
  id: 'comet',
  sprite: (t, vel, params) => {
    const fallSpeed = num(params, 'fallSpeed', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: -c * 30, scale: 1 - c * 0.06, rot: 0, alpha: 1 };
    }
    const s = ease.inCubic((t - 0.15) / 0.4);
    if (t < 0.55) {
      return {
        dx: Math.cos(burstDir(vel)) * s * 90,
        dy: Math.sin(burstDir(vel)) * s * 90 + s * 100 * fallSpeed,
        scale: 1 + s * 0.4,
        rot: burstDir(vel) + Math.PI / 4,
        alpha: 1,
      };
    }
    const afterS = (t - 0.55) / 0.45;
    return {
      dx: Math.cos(burstDir(vel)) * 90,
      dy: Math.sin(burstDir(vel)) * 90 + 100 * fallSpeed,
      scale: 1.4 - afterS * 0.3,
      rot: burstDir(vel) + Math.PI / 4,
      alpha: 1 - afterS,
    };
  },
  emit: (cx, cy, vel, params) => {
    const fallSpeed = num(params, 'fallSpeed', 1);
    const vs = velScale(vel);
    const dir = burstDir(vel);
    const out: Particle[] = [];
    // 拖尾
    for (let i = 0; i < 12; i++) {
      const f = i / 12;
      out.push({
        x: cx - Math.cos(dir) * f * 70,
        y: cy - Math.sin(dir) * f * 70 - f * 50 * fallSpeed,
        vx: 0, vy: 0,
        life: 1, decay: rand(0.03, 0.05), size: rand(3, 6),
        hue: 0, gravity: 0, shape: 0, angle: 0,
      });
    }
    return layer([
      out,
      P.burst(cx, cy, 16, 4, 10 * vs, { hue: [0, 0], gravity: 0.12, decay: [0.025, 0.04] }),
      P.flare(cx, cy, 1, 28, { hue: [0, 0] }),
    ]);
  },
};

/** trail-burst · 拖尾爆裂：长尾 + 端点爆。 */
export const trailBurst: EffectPreset = {
  id: 'trail-burst',
  sprite: (t, vel, params) => {
    const trailLength = num(params, 'trailLength', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: Math.cos(burstDir(vel)) * s * 130 * trailLength,
      dy: Math.sin(burstDir(vel)) * s * 70 * trailLength,
      scale: 1 + s * 0.4,
      rot: 0,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, vel, params) => {
    const trailLength = num(params, 'trailLength', 1);
    const vs = velScale(vel);
    const dir = burstDir(vel);
    const out: Particle[] = [];
    for (let i = 0; i < 14; i++) {
      const f = i / 14;
      out.push({
        x: cx + Math.cos(dir) * f * 100 * trailLength,
        y: cy + Math.sin(dir) * f * 100 * trailLength,
        vx: 0, vy: 0,
        life: 1, decay: rand(0.025, 0.04), size: rand(2, 5),
        hue: 0, gravity: 0, shape: 1, angle: dir,
      });
    }
    const endX = cx + Math.cos(dir) * 100 * trailLength;
    const endY = cy + Math.sin(dir) * 100 * trailLength;
    return layer([
      out,
      P.burst(endX, endY, 12, 3, 8 * vs, { hue: [0, 0], gravity: 0.08, decay: [0.02, 0.035] }),
      P.spark(endX, endY, 6, 4, 9 * vs, { hue: [0, 0] }),
    ]);
  },
};

/** arc · 弧光斩击：弧形轨迹。 */
export const arc: EffectPreset = {
  id: 'arc',
  sprite: (t, vel, params) => {
    const arcSpan = num(params, 'arcSpan', 1);
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    const ang = burstDir(vel) + s * Math.PI * arcSpan;
    return {
      dx: Math.cos(ang) * s * 100,
      dy: Math.sin(ang) * s * 100,
      scale: 1 + s * 0.35,
      rot: ang,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, vel, params) => {
    const arcSpan = num(params, 'arcSpan', 1);
    const vs = velScale(vel);
    const dir = burstDir(vel);
    return layer([
      P.arcSweep(cx, cy, 16, dir, dir + Math.PI * arcSpan, 90, { hue: [0, 0], decay: [0.02, 0.03] }),
      P.burst(cx, cy, 6, 2, 5 * vs, { hue: [0, 0], gravity: 0.05, decay: [0.02, 0.03] }),
    ]);
  },
};

/** split · 分身四散：复制扩散。 */
export const split: EffectPreset = {
  id: 'split',
  sprite: (t, _vel, params) => {
    const copies = Math.round(num(params, 'copies', 3));
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.06, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    const ang = (Math.floor(s * copies) / copies) * TAU;
    return {
      dx: Math.cos(ang) * s * 60,
      dy: Math.sin(ang) * s * 60,
      scale: 1 + Math.sin(s * Math.PI * copies) * 0.2,
      rot: 0,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, vel, params) => {
    const copies = Math.round(num(params, 'copies', 3));
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let c = 0; c < copies; c++) {
      const ang = (c / copies) * TAU + burstDir(vel);
      out.push(...P.burst(cx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40, 4, 2, 5 * vs, { hue: [0, 0], decay: [0.02, 0.03] }));
    }
    return layer([out, P.flare(cx, cy, 1, 18, { hue: [0, 0] })]);
  },
};

/** chain · 锁链波动：连串涟漪。 */
export const chain: EffectPreset = {
  id: 'chain',
  sprite: (t, vel, params) => {
    const links = Math.round(num(params, 'links', 3));
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 4, scale: 1 - c * 0.05, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    const phase = s * links;
    const frac = phase - Math.floor(phase);
    return {
      dx: Math.cos(burstDir(vel)) * frac * 70,
      dy: Math.sin(burstDir(vel)) * frac * 70,
      scale: 1 + Math.sin(frac * Math.PI) * 0.2,
      rot: 0,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const links = Math.round(num(params, 'links', 3));
    const vs = velScale(vel);
    const dir = burstDir(vel);
    const out: Particle[] = [];
    for (let L = 0; L < links; L++) {
      const lx = cx + Math.cos(dir) * L * 35;
      const ly = cy + Math.sin(dir) * L * 35;
      out.push(...P.ringWave(lx, ly, 8, 16, 2.5 * vs, { hue: [0, 0] }));
    }
    return layer([out]);
  },
};

