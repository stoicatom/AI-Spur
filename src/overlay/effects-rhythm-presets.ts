import { P, type Particle } from './particles';
import { num, ease, layer, velScale, type EffectPreset } from './effects-core';

/** pulse · 弦振脉冲：同心圆扩散。 */
export const pulse: EffectPreset = {
  id: 'pulse',
  sprite: (t, _vel, params) => {
    const pulses = Math.round(num(params, 'pulses', 2));
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = (t - 0.15) / 0.85;
    const phase = s * pulses;
    const frac = phase - Math.floor(phase);
    return {
      dx: 0,
      dy: -s * 20,
      scale: 1 + Math.sin(frac * Math.PI) * 0.4,
      rot: 0,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const pulses = Math.round(num(params, 'pulses', 2));
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let p = 0; p < pulses; p++) {
      out.push(...P.ringWave(cx, cy, 10, 20 + p * 25, 3 * vs, { hue: [0, 0] }));
    }
    return layer([out, P.flare(cx, cy, 1, 24, { hue: [0, 0] })]);
  },
};

/** ring · 声波回荡：多环扩散。 */
export const ring: EffectPreset = {
  id: 'ring',
  sprite: (t, _vel, _params) => {
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = ease.outCubic((t - 0.15) / 0.85);
    return {
      dx: 0,
      dy: -s * 15,
      scale: 1 + s * 0.6,
      rot: 0,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, vel, params) => {
    const rings = Math.round(num(params, 'rings', 3));
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let r = 0; r < rings; r++) {
      out.push(...P.ringWave(cx, cy, 12, 18 + r * 22, 2.5 * vs, { hue: [0, 0] }));
    }
    return layer([out, P.flare(cx, cy, 1, 20, { hue: [0, 0] })]);
  },
};

/** echo · 余韵回荡：渐弱回环。 */
export const echo: EffectPreset = {
  id: 'echo',
  sprite: (t, _vel, params) => {
    const echoes = Math.round(num(params, 'echoes', 3));
    if (t < 0.15) {
      const c = t / 0.15;
      return { dx: 0, dy: c * 3, scale: 1 - c * 0.04, rot: 0, alpha: 1 };
    }
    const s = (t - 0.15) / 0.85;
    const phase = s * echoes;
    const frac = phase - Math.floor(phase);
    const decay = Math.pow(0.75, Math.floor(phase));
    return {
      dx: Math.sin(frac * Math.PI) * 30 * decay,
      dy: -s * 50,
      scale: 1 + Math.sin(frac * Math.PI) * 0.25 * decay,
      rot: 0,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, vel, params) => {
    const echoes = Math.round(num(params, 'echoes', 3));
    const vs = velScale(vel);
    const out: Particle[] = [];
    for (let e = 0; e < echoes; e++) {
      const decay = Math.pow(0.75, e);
      out.push(...P.burst(cx, cy - e * 30, Math.round(8 * decay), 2, 5 * vs * decay, { hue: [0, 0], gravity: 0.04, decay: [0.02, 0.03] }));
    }
    return layer([out]);
  },
};

