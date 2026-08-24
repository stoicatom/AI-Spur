/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** chain · 链条：spiral 缠绕 + shards 链节 */
function chain(): CrackStyle {
  const H = MATERIAL_HUE.chain; // 220
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 160,
      dy: Math.sin(t * Math.PI * 2) * 40,
      scale: 1 + t * 2.2,
      rot: t * Math.PI * 3,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 18, 2, 140, { hue: [H - 15, H + 15] }),
      ...P.shards(cx, cy, 12, 4, 10, { hue: [H - 10, H + 10] }),
    ],
  };
}
/** tessen · 铁扇：扇形展开 + 斜切弧 */
function tessen(): CrackStyle {
  const H = MATERIAL_HUE.tessen; // 30
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 200,
      dy: -t * 60,
      scale: 1 + t * 2.8,
      rot: t * Math.PI * 0.8,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 20, vel.dir - Math.PI / 3, vel.dir + Math.PI / 3, 180, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.burst(cx, cy, 10, 4, 9, { hue: [H - 5, H + 5], shape: 0 }),
    ],
  };
}
/** trident · 三海浪：P.parabola 3 组 */
function trident(): CrackStyle {
  const H = MATERIAL_HUE.trident; // 205
  return {
    hue: H,
    sprite: (t, _vel) => {
      const scale = 1 + t * 2.8;
      const dy = -Math.sin(t * Math.PI) * 60;
      return { dx: t * 180, dy, scale, rot: Math.sin(t * Math.PI * 3) * 0.4, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => [
      ...P.parabola(cx, cy - 20, 12, 280, 80, { hue: [H - 15, H + 15] }),
      ...P.parabola(cx, cy, 12, 260, 100, { hue: [H - 10, H + 10] }),
      ...P.parabola(cx, cy + 20, 12, 240, 90, { hue: [H - 5, H + 5] }),
    ],
  };
}
/** shield · 盾：冲击波+光晕 */
function shield(): CrackStyle {
  const H = MATERIAL_HUE.shield; // 215
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 60, dy: 0, scale: 1 + t * 2.5, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 18, 50, 100, { hue: [H - 15, H + 15], gravity: 0 }),
      ...P.shockRing(cx, cy, 12, 80, 150, { hue: [H - 10, H + 10], gravity: 0 }),
    ],
  };
}
/** hammer · 战锤：砸地裂纹 */
function hammer(): CrackStyle {
  const H = MATERIAL_HUE.hammer; // 220
  return {
    hue: H,
    sprite: (t, _vel) => {
      const dy = t < 0.4 ? -t * 80 : (t - 0.4) * 300 - 32;
      const scale = 1 + t * 2;
      return { dx: 0, dy, scale, rot: t < 0.4 ? -t * 0.5 : -0.2, alpha: 1 - t * 0.8 };
    },
    emit: (cx, cy, _vel) => [
      ...P.arcSweep(cx, cy + 40, 16, Math.PI * 1.1, Math.PI * 1.9, 180, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.burst(cx, cy + 40, 14, 2, 8, { hue: [H - 10, H + 10], shape: 2, gravity: 0.15 }),
      ...P.pillar(cx, cy + 40, 8, 60, { hue: [H - 20, H] }),
    ],
  };
}
/** boomerang · 回旋镖：椭圆弧线+旋转 */
function boomerang(): CrackStyle {
  const H = MATERIAL_HUE.boomerang; // 25
  return {
    hue: H,
    sprite: (t, _vel) => {
      const angle = t * Math.PI * 2;
      const dx = Math.sin(angle) * 160;
      const dy = -Math.sin(angle * 0.5) * 60;
      return { dx, dy, scale: 1 + Math.sin(angle * 0.5) * 1.5 + 0.5, rot: angle * 3, alpha: 1 - t * 0.7 };
    },
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 16, vel.dir - Math.PI * 0.4, vel.dir + Math.PI * 0.4, 180, { hue: [H - 15, H + 15] }),
      ...P.burst(cx, cy, 10, 3, 7, { hue: [H - 5, H + 5], shape: 0 }),
    ],
  };
}
/** axe · 战斧：重劈挥砍 + 冲击波 + 金属火花 */
function axe(): CrackStyle {
  const H = MATERIAL_HUE.axe; // 210
  return {
    hue: H,
    sprite: (t, _vel) => {
      // 阶段1: 上扬蓄力 (0-0.3)
      // 阶段2: 下劈 (0.3-0.7)
      // 阶段3: 冲击余波 (0.7-1.0)
      const phase1 = t < 0.3;
      const phase2 = t >= 0.3 && t < 0.7;

      let dx = 0, dy = 0, rot = 0;
      if (phase1) {
        const t1 = t / 0.3;
        dx = t1 * 40;
        dy = -t1 * 80;
        rot = -t1 * Math.PI * 0.5;
      } else if (phase2) {
        const t2 = (t - 0.3) / 0.4;
        dx = 40 + t2 * 140;
        dy = -80 + t2 * 200;
        rot = -Math.PI * 0.5 + t2 * Math.PI * 3;
      } else {
        const t3 = (t - 0.7) / 0.3;
        dx = 180 + t3 * 40;
        dy = 120 + t3 * 40;
        rot = Math.PI * 2.5;
      }

      return {
        dx,
        dy,
        scale: 1 + t * 2.5,
        rot,
        alpha: 1 - t * 0.8
      };
    },
    emit: (cx, cy, vel) => [
      // 劈砍弧光（宽阔的弧形斩击）
      ...P.arcSweep(cx, cy, 24, vel.dir - Math.PI * 0.6, vel.dir + Math.PI * 0.2, 200, {
        hue: [H - 15, H + 15],
        shape: 1,
        gravity: 0.08
      }),
      // 金属碰撞火花（橙黄色）
      ...P.spark(cx + 60, cy + 40, 18, 4, 10, { hue: [25, 45] }),
      // 木屑碎片
      ...P.shards(cx, cy, 14, 3, 9, { hue: [25, 40], shape: 2 }),
      // 冲击波（砸地效果）
      ...P.shockRing(cx + 60, cy + 60, 16, 40, 80, {
        hue: [H - 20, H + 20],
        gravity: 0
      }),
      // 尘土扬起
      ...P.burst(cx + 60, cy + 60, 12, 2, 6, {
        hue: [35, 55],
        shape: 0,
        gravity: 0.12
      }),
    ],
  };
}
/** scythe · 镰刀：暗紫弧+冥火 */
function scythe(): CrackStyle {
  const H = MATERIAL_HUE.scythe; // 280
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 200, dy: -t * 30, scale: 1 + t * 2.8, rot: -t * Math.PI, alpha: 1 - t }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 16, vel.dir - Math.PI * 0.6, vel.dir + Math.PI * 0.3, 200, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.pillar(cx, cy, 10, 100, { hue: [120, 150] }),
      ...P.burst(cx, cy, 8, 2, 6, { hue: [H - 10, H + 10], shape: 0, gravity: -0.03 }),
    ],
  };
}
/** flail · 连枷：链球旋转 */
function flail(): CrackStyle {
  const H = MATERIAL_HUE.flail; // 20
  return {
    hue: H,
    sprite: (t, _vel) => {
      const angle = t * Math.PI * 2.5;
      const dx = Math.cos(angle) * 140 * Math.min(1, t * 3);
      const dy = Math.sin(angle) * 60 * Math.min(1, t * 3);
      return { dx, dy, scale: 1 + t * 2, rot: angle, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 16, 2, 130, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.burst(cx, cy, 14, 4, 10, { hue: [H - 5, H + 15], shape: 2 }),
    ],
  };
}
/** chakram · 环刃：高速旋转飞行 + 刀光轨迹 + 空气涡流 */
function chakram(): CrackStyle {
  const H = MATERIAL_HUE.chakram; // 215
  return {
    hue: H,
    sprite: (t, _vel) => {
      // 高速旋转飞行，带弧线轨迹
      const dx = t * 220;
      const dy = -t * 60 + Math.sin(t * Math.PI * 2) * 20; // 波浪轨迹
      const rot = t * Math.PI * 8; // 快速旋转
      return {
        dx,
        dy,
        scale: 1 + t * 2.8,
        rot,
        alpha: 1 - t * 0.7
      };
    },
    emit: (cx, cy, _vel) => [
      // 刀光轨迹（锋利的弧形光刃）
      ...P.arcSweep(cx, cy, 20, -Math.PI * 0.3, Math.PI * 0.3, 160, {
        hue: [H - 5, H + 5],
        shape: 1,
        gravity: 0
      }),
      // 旋转产生的环形冲击波（多层）
      ...P.shockRing(cx, cy, 16, 30, 60, {
        hue: [H - 10, H + 10],
        gravity: 0
      }),
      ...P.shockRing(cx, cy, 14, 50, 90, {
        hue: [H - 15, H + 15],
        gravity: 0
      }),
      // 刃口发射的锋利光刃粒子（快速直线飞出）
      ...P.beam(cx, cy, 12, 80, {
        hue: [195, 225]
      }),
      ...P.beam(cx, cy, 12, 80, {
        hue: [195, 225]
      }),
      // 空气涡流效果（螺旋）
      ...P.spiral(cx, cy, 18, 2, 120, {
        hue: [H - 20, H + 20],
        gravity: 0
      }),
      // 金属反光粒子
      ...P.burst(cx, cy, 14, 6, 12, {
        hue: [200, 230],
        shape: 0,
        gravity: 0.03
      }),
    ],
  };
}
/** halberd · 戟：突刺+回旋 */
function halberd(): CrackStyle {
  const H = MATERIAL_HUE.halberd; // 210
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 220, dy: t * 20, scale: 1 + t * 2.4, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 12, vel.dir - 0.12, vel.dir + 0.12, 210, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.arcSweep(cx, cy, 14, vel.dir - Math.PI * 0.5, vel.dir + Math.PI * 0.5, 120, { hue: [H - 15, H + 15], shape: 0 }),
    ],
  };
}

export const MELEE_STYLES = {
  chain,
  tessen,
  trident,
  shield,
  hammer,
  boomerang,
  axe,
  scythe,
  flail,
  chakram,
  halberd,
};
