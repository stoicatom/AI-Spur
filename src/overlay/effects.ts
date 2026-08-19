/**
 * 素材包运动轨迹特效库 —— 30 个可参数化预设。
 *
 * 每个预设是一套「精灵运动轨迹 + 粒子发射」程序，通过 `params` 定制出
 * 每素材的独家动画（内置素材的 params 来自 pack.json 的 effect.params）。
 * 自定义素材从这 30 个预设中选一个（params 用默认值）。
 *
 * 所有函数纯计算、无副作用（不碰 DOM / IPC），便于单元测试（R-ARCH-005）。
 *
 * ── 三阶段叙事结构 ──────────────────────────────────────────────────────
 * t ∈ [0, 0.15)   蓄力：精灵收缩/抖动聚能，粒子预涌
 * t ∈ [0.15, 0.6) 爆发：主粒子喷发，方向性爆裂（速度耦合）
 * t ∈ [0.6, 1)    余韵：残影坠落，缓慢消散
 *
 * 粒子预算：单预设 emit ≤ 115（测试上限 120），大场景用少而大的粒子。
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
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/** 粒子预算：合并多层发射并截断到上限，保证 60fps 与测试 120 上限。 */
function layer(parts: Particle[][], cap = 115): Particle[] {
  return parts.flat().slice(0, cap);
}

/** 速度耦合：甩动越快，粒子飞得越远（速度区间 × 缩放因子）。 */
function velScale(vel: WhipVel): number {
  return 0.8 + Math.min(vel.speed, 6) * 0.12;
}

/** 沿甩动方向的主爆裂角（水平向右为 0）。 */
const burstDir = (vel: WhipVel) => vel.dir;

// ── 预设实现 ────────────────────────────────────────────────────────────────

/** jet · 火箭喷射：蓄力下蹲 → 垂直冲天 + 尾焰 + 音爆环。 */
const jet: EffectPreset = {
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
const rise: EffectPreset = {
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

/** bolt · 雷电劈落：闪电链 + 抖动 + 余闪。 */
const bolt: EffectPreset = {
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

/** wave · 波浪推进：横向正弦波 + 水花。 */
const wave: EffectPreset = {
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
const orbit: EffectPreset = {
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
const dash: EffectPreset = {
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

/** shatter · 粉碎炸裂：多面碎块 + 火花 + 尘烟。 */
const shatter: EffectPreset = {
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
const burst: EffectPreset = {
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

/** flame-rise · 火焰升腾：蓄力 → 爆发上冲 + 火星 + 浓烟。 */
const flameRise: EffectPreset = {
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
const shatterIce: EffectPreset = {
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

/** shock-ring · 雷震环波：多环冲击波 + 中心雷闪。 */
const shockRing: EffectPreset = {
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

/** water-splash · 水花四溅：抛物线水滴 + 涟漪 + 水汽。 */
const waterSplash: EffectPreset = {
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

/** whirl · 旋风回旋：螺旋上升 + 吸入感。 */
const whirl: EffectPreset = {
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

/** star-burst · 星形爆发：五角星状粒子 + 中心闪光。 */
const starBurst: EffectPreset = {
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
const explode: EffectPreset = {
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
const impact: EffectPreset = {
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








// ── 注册表 ──────────────────────────────────────────────────────────────────


/** comet · 坠击爆燃：拖尾 + 爆裂。 */
const comet: EffectPreset = {
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
const trailBurst: EffectPreset = {
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

/** pulse · 弦振脉冲：同心圆扩散。 */
const pulse: EffectPreset = {
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
const ring: EffectPreset = {
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

/** petal · 花瓣飘散：旋转下落。 */
const petal: EffectPreset = {
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

/** echo · 余韵回荡：渐弱回环。 */
const echo: EffectPreset = {
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

/** arc · 弧光斩击：弧形轨迹。 */
const arc: EffectPreset = {
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

/** spiral · 螺旋上升：粒子螺旋。 */
const spiral: EffectPreset = {
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

/** split · 分身四散：复制扩散。 */
const split: EffectPreset = {
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
const chain: EffectPreset = {
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

/** glow · 辉光膨胀：光晕扩散。 */
const glow: EffectPreset = {
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
const twinkle: EffectPreset = {
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

/** vortex · 漩涡聚拢：向心旋转。 */
const vortex: EffectPreset = {
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
const rain: EffectPreset = {
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

// ── 注册表 ──────────────────────────────────────────────────────────────────

const PRESETS: EffectPreset[] = [
  jet, rise, bolt, wave, orbit, dash, shatter, burst, flameRise, shatterIce,
  shockRing, waterSplash, whirl, starBurst, impact, comet, trailBurst, pulse,
  ring, petal, echo, arc, spiral, split, chain, glow, twinkle, vortex, rain,
  explode,
];

const PRESET_MAP = new Map<EffectPresetId, EffectPreset>(PRESETS.map((p) => [p.id, p]));

/** 从包配置 effect.preset 拿到运行时预设（params 来自 pack.json）。 */
export function resolveEffect(presetId: string): EffectPreset {
  return PRESET_MAP.get(presetId as EffectPresetId) ?? PRESET_MAP.get('jet')!;
}

/** 全部预设的 ID → 实现映射（供运行时遍历与测试）。 */
export const EFFECT_PRESETS: Record<EffectPresetId, EffectPreset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
) as Record<EffectPresetId, EffectPreset>;

/** 每预设的展示元数据（用于向导卡片）。 */
export const PRESET_META: Record<EffectPresetId, { glyph: string; label: string }> = {
  jet: { glyph: '🚀', label: '喷射升空' },
  rise: { glyph: '🕊️', label: '展翅上腾' },
  bolt: { glyph: '⚡', label: '闪电劈裂' },
  wave: { glyph: '🌊', label: '龙腾蜿蜒' },
  orbit: { glyph: '🌀', label: '飞旋环绕' },
  dash: { glyph: '💨', label: '拔刀一斩' },
  shatter: { glyph: '💥', label: '晶体碎裂' },
  burst: { glyph: '✨', label: '幽魂爆散' },
  'flame-rise': { glyph: '🔥', label: '火焰升腾' },
  'shatter-ice': { glyph: '❄️', label: '冰晶爆碎' },
  'shock-ring': { glyph: '⚡', label: '雷震环波' },
  'water-splash': { glyph: '💧', label: '水花四溅' },
  whirl: { glyph: '🌪️', label: '旋风回旋' },
  'star-burst': { glyph: '⭐', label: '星形爆发' },
  impact: { glyph: '🛠️', label: '重击冲击' },
  comet: { glyph: '☄️', label: '坠击爆燃' },
  'trail-burst': { glyph: '💥', label: '拖尾爆裂' },
  pulse: { glyph: '💓', label: '弦振脉冲' },
  ring: { glyph: '🔊', label: '声波回荡' },
  petal: { glyph: '🌸', label: '花瓣飘散' },
  echo: { glyph: '🔔', label: '余韵回荡' },
  arc: { glyph: '🗡️', label: '弧光斩击' },
  spiral: { glyph: '🌀', label: '螺旋上升' },
  split: { glyph: '✨', label: '分身四散' },
  chain: { glyph: '⛓️', label: '锁链波动' },
  glow: { glyph: '💫', label: '辉光膨胀' },
  twinkle: { glyph: '✨', label: '星光闪烁' },
  vortex: { glyph: '🌀', label: '漩涡聚拢' },
  rain: { glyph: '🌧️', label: '雨丝斜落' },
  explode: { glyph: '💣', label: '猛烈爆炸' },
};
