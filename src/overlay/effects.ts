/**
 * 素材包运动轨迹特效库 —— 30 个可参数化预设。
 *
 * 每个预设是一套「精灵运动轨迹 + 粒子发射」程序，通过 `params` 定制出
 * 每素材的独家动画（内置素材的 params 来自 pack.json 的 effect.params）。
 * 自定义素材从这 30 个预设中选一个（params 用默认值）。
 *
 * 所有函数纯计算、无副作用（不碰 DOM / IPC），便于单元测试（R-ARCH-005）。
 */

import type { Particle, WhipVel } from './particles';
import { P } from './particles';
import type { EffectPresetId } from '../shared/material-packs';

const TAU = Math.PI * 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** 每帧精灵的位移/缩放/旋转/透明度。dx/dy 相对爆裂中心（px）。 */
export interface SpriteFrame {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  alpha: number;
}

/** 特效预设实现：t ∈ [0,1) 是爆裂进度，vel 是触发时的甩动速度向量。 */
export interface EffectPreset {
  id: EffectPresetId;
  /** 精灵运动轨迹（归一化时间 → 帧）。 */
  sprite: (t: number, vel: WhipVel, params: Record<string, number>) => SpriteFrame;
  /** 粒子发射（爆裂中心、速度、参数 → 粒子数组）。 */
  emit: (cx: number, cy: number, vel: WhipVel, params: Record<string, number>) => Particle[];
}

/** 从 params 取数值参数，缺省回退默认值。 */
function num(params: Record<string, number>, key: string, def: number): number {
  const v = params[key];
  return v === undefined || Number.isNaN(v) ? def : v;
}

/** 简单的缓动函数库。 */
const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// ── 预设实现 ────────────────────────────────────────────────────────────────

/** jet · 喷射升空：尾焰 + 向上加速，拖尾粒子向下喷。 */
const jet: EffectPreset = {
  id: 'jet',
  sprite: (t, _vel, _params) => {
    const thrust = num(_params, 'thrust', 1);
    const climb = num(_params, 'climb', 1);
    const s = ease.outCubic(t);
    return {
      dx: -Math.sin(_vel.dir) * s * 60 * thrust,
      dy: -Math.cos(_vel.dir) * s * 140 * climb - Math.sin(t * Math.PI) * 18,
      scale: 1 + s * 0.55,
      rot: 0,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const thrust = num(_params, 'thrust', 1);
    const n = Math.round(14 * thrust);
    const back = P.burst(cx, cy - 20, n, 2, 5, { hue: [0, 0], gravity: 0.12, shape: 1, decay: [0.02, 0.035] });
    return back.map((p) => ({ ...p, vy: p.vy + 4 }));
  },
};

/** rise · 展翅上腾：双翼向两侧扩散 + 上升。 */
const rise: EffectPreset = {
  id: 'rise',
  sprite: (t, _vel, _params) => {
    const spread = num(_params, 'spread', 1);
    const riseSpeed = num(_params, 'riseSpeed', 1);
    const s = ease.outCubic(t);
    return {
      dx: Math.sin(t * Math.PI * 2) * 30 * spread,
      dy: -s * 150 * riseSpeed,
      scale: 1 + s * 0.4,
      rot: Math.sin(t * Math.PI * 2) * 0.25 * spread,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const spread = num(_params, 'spread', 1);
    const wingL = P.arcSweep(cx, cy, 10, Math.PI * 0.6, Math.PI, 120 * spread, { hue: [0, 0], decay: [0.02, 0.03] });
    const wingR = P.arcSweep(cx, cy, 10, 0, Math.PI * 0.4, 120 * spread, { hue: [0, 0], decay: [0.02, 0.03] });
    return [...wingL, ...wingR];
  },
};

/** bolt · 闪电劈裂：之字形分支残影。 */
const bolt: EffectPreset = {
  id: 'bolt',
  sprite: (t, _vel, _params) => {
    const jag = num(_params, 'jaggedness', 1);
    const flicker = num(_params, 'flicker', 1);
    const s = ease.outQuart(t);
    // 之字形偏移
    const zig = Math.sin(t * 14 * jag) * 40 * (1 - t);
    return {
      dx: zig,
      dy: s * 220 * flicker,
      scale: 1 + s * 0.3,
      rot: Math.sin(t * 20) * 0.12,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const branches = Math.round(num(_params, 'branches', 2));
    const out: Particle[] = [];
    for (let b = 0; b < branches; b++) {
      const ang = -Math.PI / 2 + (b - (branches - 1) / 2) * 0.5;
      out.push(...P.burst(cx, cy, 6, 4, 9, { hue: [0, 0], shape: 1, gravity: 0, decay: [0.015, 0.025] }).map((p) => ({
        ...p,
        vx: Math.cos(ang) * 8 + p.vx * 0.4,
        vy: Math.sin(ang) * 8 + Math.abs(p.vy) * 0.6,
      })));
    }
    return out;
  },
};

/** wave · 龙腾蜿蜒：正弦波轨迹 + 横向波动。 */
const wave: EffectPreset = {
  id: 'wave',
  sprite: (t, _vel, _params) => {
    const amp = num(_params, 'amplitude', 1);
    const wl = num(_params, 'wavelength', 1);
    const und = num(_params, 'undulation', 1);
    return {
      dx: Math.sin(t * TAU * 3 * wl) * 70 * amp,
      dy: -t * 200 * und + Math.cos(t * TAU * 2) * 20,
      scale: 1 + Math.sin(t * TAU * 4) * 0.15 * amp,
      rot: Math.cos(t * TAU * 3 * wl) * 0.4 * amp,
      alpha: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const amp = num(_params, 'amplitude', 1);
    return P.arcSweep(cx, cy, 24, -Math.PI / 2, Math.PI / 2, 160 * amp, { hue: [0, 0], decay: [0.02, 0.03] });
  },
};

/** orbit · 飞旋环绕：圆周离心飞出。 */
const orbit: EffectPreset = {
  id: 'orbit',
  sprite: (t, _vel, _params) => {
    const orbits = num(_params, 'orbits', 1.5);
    const radius = num(_params, 'radius', 1);
    const spin = num(_params, 'spin', 1);
    const ang = t * TAU * orbits;
    const r = t * 140 * radius;
    return {
      dx: Math.cos(ang) * r,
      dy: Math.sin(ang) * r,
      scale: 1 + Math.sin(t * TAU * 3) * 0.2,
      rot: t * TAU * 2 * spin,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const orbits = num(_params, 'orbits', 1.5);
    return P.spiral(cx, cy, 20, orbits, 150, { hue: [0, 0], decay: [0.02, 0.03] });
  },
};

/** dash · 拔刀一斩：直线疾驰 + 残影。 */
const dash: EffectPreset = {
  id: 'dash',
  sprite: (t, _vel, _params) => {
    const dashLength = num(_params, 'dashLength', 1);
    const shear = num(_params, 'shear', 1);
    const s = ease.outQuart(t);
    const dir = _vel.dir;
    return {
      dx: Math.cos(dir) * s * 260 * dashLength,
      dy: Math.sin(dir) * s * 260 * dashLength,
      scale: 1 + s * 0.5,
      rot: -dir * shear,
      alpha: t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const dashLength = num(_params, 'dashLength', 1);
    const dir = _vel.dir;
    // 沿挥斩方向排成一线
    const out: Particle[] = [];
    for (let i = 0; i < 18; i++) {
      const f = i / 18;
      out.push({
        x: cx + Math.cos(dir) * f * 200 * dashLength,
        y: cy + Math.sin(dir) * f * 200 * dashLength,
        vx: Math.cos(dir) * 3,
        vy: Math.sin(dir) * 3,
        life: 1, decay: rand(0.02, 0.035), size: rand(3, 6),
        hue: 0, gravity: 0, shape: 1, angle: dir,
      });
    }
    return out;
  },
};

/** shatter · 晶体碎裂：多面崩解。 */
const shatter: EffectPreset = {
  id: 'shatter',
  sprite: (t, _vel, _params) => {
    const sparkle = num(_params, 'sparkle', 1);
    return {
      dx: (Math.random() - 0.5) * 40,
      dy: -t * 80 * sparkle,
      scale: 1 - t * 0.3,
      rot: t * TAU * 1.5,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const shards = num(_params, 'shards', 1);
    return P.shards(cx, cy, Math.round(18 * shards), 4, 11, { hue: [0, 0], decay: [0.025, 0.04], gravity: 0.12 });
  },
};

/** burst · 幽魂爆散：放射状飞散 + 飘浮。 */
const burst: EffectPreset = {
  id: 'burst',
  sprite: (t, _vel, _params) => {
    const drift = num(_params, 'drift', 1);
    return {
      dx: Math.sin(t * TAU * 2) * 20 * drift,
      dy: -t * 60 * drift,
      scale: 1 + t * 0.5,
      rot: t * Math.PI * drift,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const count = Math.round(num(_params, 'count', 1) * 16);
    return P.burst(cx, cy, count, 2, 7, { hue: [0, 0], gravity: -0.02, decay: [0.015, 0.025] });
  },
};

/** flame-rise · 火焰升腾：粒子上升 + 抖动。 */
const flameRise: EffectPreset = {
  id: 'flame-rise',
  sprite: (t, _vel, _params) => {
    const turbulence = num(_params, 'turbulence', 1);
    const riseSpeed = num(_params, 'riseSpeed', 1);
    const s = ease.outCubic(t);
    return {
      dx: Math.sin(t * 16 * turbulence) * 12 * (1 - t),
      dy: -s * 160 * riseSpeed,
      scale: 1 + s * 0.6,
      rot: Math.sin(t * 12) * 0.1,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const turbulence = num(_params, 'turbulence', 1);
    const out: Particle[] = [];
    for (let i = 0; i < 20 * turbulence; i++) {
      out.push({
        x: cx + rand(-20, 20) * (1 - i / 30),
        y: cy + rand(0, 10),
        vx: rand(-1.5, 1.5),
        vy: rand(-5, -2),
        life: 1, decay: rand(0.02, 0.04), size: rand(3, 7),
        hue: 0, gravity: -0.03, shape: 0, angle: 0,
      });
    }
    return out;
  },
};

/** shatter-ice · 冰晶爆碎：尖棱飞溅。 */
const shatterIce: EffectPreset = {
  id: 'shatter-ice',
  sprite: (t, _vel, _params) => {
    const chill = num(_params, 'chill', 1);
    return {
      dx: (Math.random() - 0.5) * 50,
      dy: -t * 100 * chill,
      scale: 1 - t * 0.4,
      rot: t * TAU * 2,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const shards = num(_params, 'shards', 1);
    const out = P.shards(cx, cy, Math.round(22 * shards), 5, 13, { hue: [0, 0], decay: [0.02, 0.035], gravity: 0.1 });
    // 尖棱：混合 streak 强调方向感
    out.push(...P.burst(cx, cy, 10, 5, 12, { hue: [0, 0], shape: 1, gravity: 0.08, decay: [0.02, 0.03] }));
    return out;
  },
};

/** shock-ring · 雷震环波：多环冲击波。 */
const shockRing: EffectPreset = {
  id: 'shock-ring',
  sprite: (t, _vel, _params) => {
    const intensity = num(_params, 'intensity', 1);
    return {
      dx: 0,
      dy: -t * 20 * intensity,
      scale: 1 + t * 0.8 * intensity,
      rot: 0,
      alpha: t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const rings = Math.round(num(_params, 'rings', 2));
    const out: Particle[] = [];
    for (let r = 0; r < rings; r++) {
      out.push(...P.shockRing(cx, cy, 14, 40 + r * 40, 80 + r * 40, { hue: [0, 0], decay: [0.012, 0.02] }));
    }
    return out;
  },
};

/** water-splash · 水花四溅：抛物线水滴。 */
const waterSplash: EffectPreset = {
  id: 'water-splash',
  sprite: (t, _vel, _params) => {
    const splashHeight = num(_params, 'splashHeight', 1);
    return {
      dx: Math.sin(t * TAU * 2) * 15,
      dy: -Math.sin(t * Math.PI) * 120 * splashHeight,
      scale: 1 + Math.sin(t * Math.PI) * 0.3,
      rot: Math.sin(t * TAU) * 0.3,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const droplets = num(_params, 'droplets', 1);
    const out: Particle[] = [];
    for (let i = 0; i < 16 * droplets; i++) {
      const ang = rand(-Math.PI * 0.8, -Math.PI * 0.2);
      const sp = rand(4, 9);
      out.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
        hue: 0, gravity: 0.18, shape: 0, angle: 0,
      });
    }
    return out;
  },
};

/** whirl · 旋风回旋：螺旋上升。 */
const whirl: EffectPreset = {
  id: 'whirl',
  sprite: (t, _vel, _params) => {
    const spirals = num(_params, 'spirals', 1);
    const ang = t * TAU * 2 * spirals;
    return {
      dx: Math.cos(ang) * 60 * t,
      dy: -t * 140 * spirals,
      scale: 1 + Math.sin(t * TAU * 3) * 0.2,
      rot: t * TAU * spirals,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const spirals = num(_params, 'spirals', 1);
    return P.spiral(cx, cy, 24, spirals, 130, { hue: [0, 0], decay: [0.018, 0.03] });
  },
};

/** star-burst · 星形爆发：五角星状粒子。 */
const starBurst: EffectPreset = {
  id: 'star-burst',
  sprite: (t, _vel, _params) => {
    const twinkle = num(_params, 'twinkle', 1);
    return {
      dx: Math.sin(t * TAU * 3 * twinkle) * 10,
      dy: -t * 30,
      scale: 1 + Math.sin(t * TAU * 4 * twinkle) * 0.25,
      rot: t * Math.PI * 0.5,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const points = Math.round(num(_params, 'points', 1) * 5);
    const out: Particle[] = [];
    for (let i = 0; i < points; i++) {
      const ang = (i / points) * TAU - Math.PI / 2;
      out.push(...P.burst(cx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40, 4, 3, 7, { hue: [0, 0], decay: [0.02, 0.03] }));
    }
    return out;
  },
};

/** impact · 重击冲击：中心放射 + 碎屑。 */
const impact: EffectPreset = {
  id: 'impact',
  sprite: (t, _vel, _params) => {
    const weight = num(_params, 'weight', 1);
    const s = ease.outBack(t);
    return {
      dx: 0,
      dy: -s * 30 * weight,
      scale: 1 + s * 0.7 * weight,
      rot: 0,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const weight = num(_params, 'weight', 1);
    return [
      ...P.burst(cx, cy, Math.round(14 * weight), 4, 10, { hue: [0, 0], gravity: 0.1, decay: [0.02, 0.035] }),
      ...P.shards(cx, cy, Math.round(8 * weight), 3, 8, { hue: [0, 0], gravity: 0.15, decay: [0.025, 0.04] }),
      ...P.shockRing(cx, cy, 12, 50, 90, { hue: [0, 0], decay: [0.015, 0.025] }),
    ];
  },
};

/** comet · 坠击爆燃：拖尾 + 爆裂。 */
const comet: EffectPreset = {
  id: 'comet',
  sprite: (t, _vel, _params) => {
    const impactP = num(_params, 'impact', 1);
    // 先坠落后爆燃
    if (t < 0.4) {
      const s = t / 0.4;
      return { dx: 0, dy: s * 180 * impactP, scale: 1, rot: 0, alpha: 1 };
    }
    const s = (t - 0.4) / 0.6;
    return {
      dx: 0, dy: 180 * impactP - s * 40,
      scale: 1 + s * 0.8 * impactP,
      rot: s * Math.PI,
      alpha: 1 - s * 0.4,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const debris = num(_params, 'debris', 1);
    return [
      ...P.burst(cx, cy, Math.round(16 * debris), 4, 12, { hue: [0, 0], gravity: 0.15, decay: [0.02, 0.035] }),
      ...P.shockRing(cx, cy, 14, 40, 90, { hue: [0, 0], decay: [0.015, 0.025] }),
    ];
  },
};

/** trail-burst · 拖尾爆裂：长尾 + 端点爆。 */
const trailBurst: EffectPreset = {
  id: 'trail-burst',
  sprite: (t, _vel, _params) => {
    const glide = num(_params, 'glide', 1);
    const dir = _vel.dir;
    const s = ease.outQuart(t);
    return {
      dx: Math.cos(dir) * s * 180 * glide,
      dy: Math.sin(dir) * s * 180 * glide,
      scale: 1 + s * 0.4,
      rot: 0,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const spread = num(_params, 'burstSpread', 1);
    return [
      ...P.burst(cx, cy, Math.round(18 * spread), 4, 11, { hue: [0, 0], gravity: 0.05, decay: [0.02, 0.03] }),
      ...P.burst(cx, cy, 8, 2, 5, { hue: [0, 0], shape: 1, gravity: 0.02, decay: [0.03, 0.045] }),
    ];
  },
};

/** pulse · 弦振脉冲：同心圆扩散。 */
const pulse: EffectPreset = {
  id: 'pulse',
  sprite: (t, _vel, _params) => {
    const resonance = num(_params, 'resonance', 1);
    return {
      dx: Math.sin(t * TAU * 2) * 8 * resonance,
      dy: 0,
      scale: 1 + t * 0.5 * resonance,
      rot: Math.sin(t * TAU) * 0.15,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const punch = num(_params, 'punch', 1);
    const rings: Particle[] = [];
    for (let r = 0; r < 3; r++) {
      rings.push(...P.shockRing(cx, cy, 10, 30 + r * 35, 60 + r * 35, { hue: [0, 0], decay: [0.012, 0.02] }));
    }
    return [...rings, ...P.burst(cx, cy, Math.round(10 * punch), 3, 8, { hue: [0, 0], gravity: 0.08, decay: [0.02, 0.03] })];
  },
};

/** ring · 声波回荡：多环扩散。 */
const ring: EffectPreset = {
  id: 'ring',
  sprite: (t, _vel, _params) => {
    const projection = num(_params, 'projection', 1);
    return {
      dx: 0,
      dy: -t * 30 * projection,
      scale: 1 + t * 0.6,
      rot: 0,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const fanfare = num(_params, 'fanfare', 1);
    const out: Particle[] = [];
    for (let r = 0; r < 4 * fanfare; r++) {
      out.push(...P.shockRing(cx, cy, 8, 30 + r * 30, 60 + r * 30, { hue: [0, 0], decay: [0.015, 0.025] }));
    }
    return out;
  },
};

/** petal · 花瓣飘散：旋转下落。 */
const petal: EffectPreset = {
  id: 'petal',
  sprite: (t, _vel, _params) => {
    const scatter = num(_params, 'scatter', 1);
    return {
      dx: Math.sin(t * TAU * 2) * 60 * scatter,
      dy: t * 120 * scatter - 40,
      scale: 1 + Math.sin(t * TAU * 3) * 0.2,
      rot: t * TAU * 1.5,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const grace = num(_params, 'grace', 1);
    const out: Particle[] = [];
    for (let i = 0; i < 18 * grace; i++) {
      const ang = rand(0, TAU);
      out.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * rand(1, 4),
        vy: rand(1, 4),
        life: 1, decay: rand(0.018, 0.03), size: rand(3, 6),
        hue: 0, gravity: 0.06, shape: 2, angle: rand(0, TAU),
      });
    }
    return out;
  },
};

/** echo · 余韵回荡：渐弱回环。 */
const echo: EffectPreset = {
  id: 'echo',
  sprite: (t, _vel, _params) => {
    const ring = num(_params, 'ring', 1);
    return {
      dx: Math.sin(t * TAU * 3) * 12 * ring,
      dy: 0,
      scale: 1 + Math.sin(t * TAU * 2) * 0.15,
      rot: 0,
      alpha: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const echoes = Math.round(num(_params, 'echoes', 2));
    const out: Particle[] = [];
    for (let e = 0; e < echoes; e++) {
      out.push(...P.shockRing(cx, cy, 8, 40 + e * 45, 70 + e * 45, { hue: [0, 0], decay: [0.01, 0.02] }));
    }
    return out;
  },
};

/** arc · 弧光斩击：弧形轨迹。 */
const arc: EffectPreset = {
  id: 'arc',
  sprite: (t, _vel, _params) => {
    const arcLength = num(_params, 'arcLength', 1);
    const glowTrail = num(_params, 'glowTrail', 1);
    const ang = Math.PI * 0.7 * arcLength * t + _vel.dir;
    const r = 180 * t * glowTrail;
    return {
      dx: Math.cos(ang) * r,
      dy: Math.sin(ang) * r,
      scale: 1 + t * 0.4,
      rot: ang,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const elegance = num(_params, 'elegance', 1);
    return P.arcSweep(cx, cy, 20, _vel.dir, _vel.dir + Math.PI * 0.7 * elegance, 180, { hue: [0, 0], decay: [0.02, 0.03] });
  },
};

/** spiral · 螺旋上升：粒子螺旋。 */
const spiral: EffectPreset = {
  id: 'spiral',
  sprite: (t, _vel, _params) => {
    return {
      dx: Math.cos(t * TAU * 3) * 50 * t,
      dy: -t * 140,
      scale: 1 + t * 0.3,
      rot: t * TAU,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    return P.spiral(cx, cy, 26, 3, 140, { hue: [0, 0], decay: [0.02, 0.03] });
  },
};

/** split · 分身四散：复制扩散。 */
const split: EffectPreset = {
  id: 'split',
  sprite: (t, _vel, _params) => {
    return {
      dx: (Math.random() - 0.5) * 80,
      dy: (Math.random() - 0.5) * 60 - t * 40,
      scale: 1 - t * 0.3,
      rot: t * Math.PI,
      alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    return P.burst(cx, cy, 20, 3, 8, { hue: [0, 0], gravity: 0.05, decay: [0.02, 0.03] });
  },
};

/** chain · 锁链波动：连串涟漪。 */
const chain: EffectPreset = {
  id: 'chain',
  sprite: (t, _vel, _params) => {
    return {
      dx: Math.sin(t * TAU * 4) * 40,
      dy: Math.cos(t * TAU * 4) * 20 - t * 60,
      scale: 1 + Math.sin(t * TAU * 5) * 0.2,
      rot: Math.sin(t * TAU * 4) * 0.3,
      alpha: t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const out: Particle[] = [];
    for (let i = 0; i < 5; i++) {
      out.push(...P.shockRing(cx, cy + i * 20, 6, 15, 35, { hue: [0, 0], decay: [0.015, 0.025] }));
    }
    return out;
  },
};

/** glow · 辉光膨胀：光晕扩散。 */
const glow: EffectPreset = {
  id: 'glow',
  sprite: (t, _vel, _params) => {
    const radiance = num(_params, 'radiance', 1);
    return {
      dx: 0,
      dy: 0,
      scale: 1 + t * 1.2 * radiance,
      rot: 0,
      alpha: t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const heat = num(_params, 'heatWaves', 1);
    return [
      ...P.shockRing(cx, cy, 16, 60, 110, { hue: [0, 0], decay: [0.01, 0.02] }),
      ...P.burst(cx, cy, Math.round(12 * heat), 2, 6, { hue: [0, 0], gravity: 0.03, decay: [0.015, 0.025] }),
    ];
  },
};

/** twinkle · 星光闪烁：多点闪亮。 */
const twinkle: EffectPreset = {
  id: 'twinkle',
  sprite: (t, _vel, _params) => {
    return {
      dx: Math.sin(t * TAU * 3) * 8,
      dy: -t * 20,
      scale: 1 + Math.sin(t * TAU * 5) * 0.3,
      rot: t * Math.PI * 0.5,
      alpha: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const sparkle = num(_params, 'sparkle', 1);
    const out: Particle[] = [];
    for (let i = 0; i < 12 * sparkle; i++) {
      const ang = rand(0, TAU);
      const r = rand(30, 90);
      out.push({
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        vx: rand(-1, 1), vy: rand(-2, 0),
        life: 1, decay: rand(0.015, 0.03), size: rand(2, 5),
        hue: 0, gravity: 0, shape: 0, angle: 0,
      });
    }
    return out;
  },
};

/** vortex · 漩涡聚拢：向心旋转。 */
const vortex: EffectPreset = {
  id: 'vortex',
  sprite: (t, _vel, _params) => {
    return {
      dx: Math.cos(t * TAU * 2) * 80 * (1 - t),
      dy: Math.sin(t * TAU * 2) * 80 * (1 - t),
      scale: 1 + t * 0.4,
      rot: t * TAU * 2,
      alpha: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    // 向心螺旋（速度指向中心）
    const out: Particle[] = [];
    for (let i = 0; i < 22; i++) {
      const f = i / 22;
      const ang = f * TAU * 2;
      const r = 140 * (1 - f);
      const inward = Math.atan2(-Math.sin(ang), -Math.cos(ang));
      out.push({
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        vx: Math.cos(inward) * 3, vy: Math.sin(inward) * 3,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
        hue: 0, gravity: 0, shape: 0, angle: 0,
      });
    }
    return out;
  },
};

/** rain · 雨丝斜落：斜线粒子。 */
const rain: EffectPreset = {
  id: 'rain',
  sprite: (t, _vel, _params) => {
    return {
      dx: t * 60,
      dy: t * 140,
      scale: 1,
      rot: 0.4,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const out: Particle[] = [];
    for (let i = 0; i < 20; i++) {
      const spread = rand(-60, 60);
      out.push({
        x: cx + spread, y: cy,
        vx: rand(2, 5), vy: rand(5, 9),
        life: 1, decay: rand(0.025, 0.04), size: rand(2, 4),
        hue: 0, gravity: 0.05, shape: 1, angle: 0.4,
      });
    }
    return out;
  },
};

/** explode · 猛烈爆炸：大面积火光。 */
const explode: EffectPreset = {
  id: 'explode',
  sprite: (t, _vel, _params) => {
    const blast = num(_params, 'blast', 1);
    return {
      dx: (Math.random() - 0.5) * 30,
      dy: -t * 50 * blast,
      scale: 1 + t * 1.4 * blast,
      rot: t * Math.PI * 0.5,
      alpha: t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55,
    };
  },
  emit: (cx, cy, _vel, _params) => {
    const blast = num(_params, 'blast', 1);
    const debris = num(_params, 'debris', 1);
    return [
      ...P.burst(cx, cy, Math.round(26 * blast), 5, 14, { hue: [0, 0], gravity: 0.08, decay: [0.02, 0.035] }),
      ...P.shards(cx, cy, Math.round(12 * debris), 4, 12, { hue: [0, 0], gravity: 0.14, decay: [0.025, 0.04] }),
      ...P.shockRing(cx, cy, 18, 50, 120, { hue: [0, 0], decay: [0.012, 0.02] }),
    ];
  },
};

// ── 预设注册表 ──────────────────────────────────────────────────────────────

export const EFFECT_PRESETS: Record<EffectPresetId, EffectPreset> = {
  jet,
  rise,
  bolt,
  wave,
  orbit,
  dash,
  shatter,
  burst,
  'flame-rise': flameRise,
  'shatter-ice': shatterIce,
  'shock-ring': shockRing,
  'water-splash': waterSplash,
  whirl,
  'star-burst': starBurst,
  impact,
  comet,
  'trail-burst': trailBurst,
  pulse,
  ring,
  petal,
  echo,
  arc,
  spiral,
  split,
  chain,
  glow,
  twinkle,
  vortex,
  rain,
  explode,
};

/** 从素材包解析特效预设（未知预设回退 jet，保证运行时永不崩溃）。 */
export function resolveEffect(presetId: string): EffectPreset {
  return EFFECT_PRESETS[presetId as EffectPresetId] ?? EFFECT_PRESETS.jet;
}

/** 从 params 中读取一个带默认值的特效强度（供 UI 试听/预览用）。 */
export function effectParamNames(presetId: string): string[] {
  // 静态已知参数名；新预设添加时在此登记（用于自定义素材的参数面板）。
  switch (presetId) {
    case 'jet': return ['thrust', 'climb', 'tailLength'];
    case 'rise': return ['spread', 'riseSpeed', 'wingFlap'];
    case 'bolt': return ['branches', 'jaggedness', 'flicker'];
    case 'wave': return ['amplitude', 'wavelength', 'undulation'];
    case 'orbit': return ['orbits', 'radius', 'spin'];
    case 'dash': return ['dashLength', 'afterimage', 'shear'];
    case 'shatter': return ['shards', 'sparkle', 'shardSpeed'];
    case 'burst': return ['count', 'ghostly', 'drift'];
    case 'flame-rise': return ['turbulence', 'riseSpeed', 'heat'];
    case 'shatter-ice': return ['shards', 'chill', 'shardSpeed'];
    case 'shock-ring': return ['rings', 'intensity', 'expansion'];
    case 'water-splash': return ['droplets', 'splashHeight', 'ripple'];
    case 'whirl': return ['spirals', 'suction', 'gust'];
    case 'star-burst': return ['points', 'twinkle', 'sparkle'];
    case 'impact': return ['block', 'resonance', 'weight'];
    case 'comet': return ['trail', 'impact', 'debris'];
    case 'trail-burst': return ['trailLength', 'burstSpread', 'glide'];
    case 'pulse': return ['strum', 'resonance', 'punch'];
    case 'ring': return ['fanfare', 'brass', 'projection'];
    case 'petal': return ['bloom', 'serenity', 'scatter'];
    case 'echo': return ['echoes', 'ring', 'decay'];
    case 'arc': return ['arcLength', 'glowTrail', 'elegance'];
    case 'spiral': return ['turns', 'radius', 'speed'];
    case 'split': return ['count', 'spread', 'drift'];
    case 'chain': return ['links', 'waveSpeed', 'amplitude'];
    case 'glow': return ['radiance', 'heatWaves', 'bloom'];
    case 'twinkle': return ['count', 'twinkle', 'sparkle'];
    case 'vortex': return ['turns', 'radius', 'suction'];
    case 'rain': return ['count', 'angle', 'speed'];
    case 'explode': return ['blast', 'shockwave', 'debris'];
    default: return [];
  }
}
