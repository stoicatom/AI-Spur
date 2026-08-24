/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P, type Particle } from './particles';
import type { CrackStyle } from './material-style-core';

/** star · 五芒星叙事：5 束光丝 + 星尘 */
function star(): CrackStyle {
  const H = MATERIAL_HUE.star; // 45
  return {
    hue: H,
    sprite: (t, _vel) => {
      // 五芒星旋转放大
      const rot = t * Math.PI * 2;
      const scale = 1 + t * 2.5;
      return { dx: t * 150, dy: 0, scale, rot, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      // 5 束光丝（每束窄扇 8 粒子）
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: 0, angleHi: Math.PI / 5 }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 2) / 5, angleHi: (Math.PI * 3) / 5 }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 4) / 5, angleHi: Math.PI }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 6) / 5, angleHi: (Math.PI * 7) / 5 }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 8) / 5, angleHi: (Math.PI * 9) / 5 }));
      // 星尘
      out.push(...P.burst(cx, cy, 12, 2, 5, { hue: [H - 5, H + 5], shape: 0 }));
      return out;
    },
  };
}
/** scepter · 权杖：八芒星芒+光环 */
function scepter(): CrackStyle {
  const H = MATERIAL_HUE.scepter; // 285
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 80, dy: -t * 120, scale: 1 + t * 2.8, rot: t * Math.PI, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.burst(cx, cy, 16, 8, 14, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.spiral(cx, cy, 12, 2, 100, { hue: [H - 10, H + 10] }),
      ...P.pillar(cx, cy, 8, 80, { hue: [285, 340] }),
    ],
  };
}
/** amulet · 护符：旋转符文环 */
function amulet(): CrackStyle {
  const H = MATERIAL_HUE.amulet; // 270
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: 0, dy: -t * 80, scale: 1 + t * 2.5, rot: t * Math.PI * 4, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 16, 3, 120, { hue: [H - 15, H + 15] }),
      ...P.shockRing(cx, cy, 14, 40, 90, { hue: [H - 20, H + 20], gravity: 0 }),
    ],
  };
}
/** fireworks · 烟花：爆裂绽放 */
function fireworks(): CrackStyle {
  const H = MATERIAL_HUE.fireworks; // 350
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: 0,
      dy: -t * 200,
      scale: 1 + t * 3,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.burst(cx, cy, 24, 8, 16, { hue: [H - 20, H + 40], shape: 0, gravity: 0.15 }),
      ...P.burst(cx, cy, 18, 4, 10, { hue: [H + 20, H + 60], shape: 0, gravity: 0.12 }),
    ],
  };
}
/** crystal · 水晶：晶体碎裂（P4 第 8 个） */
function crystal(): CrackStyle {
  const H = MATERIAL_HUE.crystal; // 270
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 100,
      dy: -t * 60,
      scale: 1 + t * 2.8,
      rot: t * Math.PI * 3,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.shards(cx, cy, 18, 5, 12, { hue: [H - 15, H + 15] }),
      ...P.burst(cx, cy, 12, 3, 8, { hue: [H - 10, H + 10], shape: 0, gravity: 0.08 }),
    ],
  };
}

export const WONDER_STYLES = { star, scepter, amulet, fireworks, crystal };
