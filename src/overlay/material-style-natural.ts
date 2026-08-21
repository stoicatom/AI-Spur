/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** wind · 风：旋风螺旋 + 青绿飘动 */
function wind(): CrackStyle {
  const H = MATERIAL_HUE.wind; // 175
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 180, dy: -t * 60, scale: 1 + t * 2.4, rot: t * Math.PI * 4, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 18, 3, 150, { hue: [H - 15, H + 15], gravity: -0.02 }),
      ...P.burst(cx, cy, 8, 2, 6, { hue: [H - 10, H + 10], shape: 0, gravity: 0 }),
    ],
  };
}
/** snow · 雪：飘落晶体 + 重力下沉 */
function snow(): CrackStyle {
  const H = MATERIAL_HUE.snow; // 210
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 120, dy: t * 80, scale: 1 + t * 2, rot: t * Math.PI * 2, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.burst(cx, cy, 20, 1, 5, { hue: [H - 10, H + 10], shape: 0, gravity: 0.08 }),
      ...P.spiral(cx, cy, 10, 1.5, 100, { hue: [H - 5, H + 5], gravity: 0.05 }),
    ],
  };
}
/** rain · 雨：斜线雨丝 + 下方喷溅 */
function rain(): CrackStyle {
  const H = MATERIAL_HUE.rain; // 215
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 160, dy: t * 200, scale: 1 + t * 1.8, rot: 0.3, alpha: 1 - t }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 16, vel.dir + 0.3, vel.dir + 0.5, 180, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.burst(cx, cy + 40, 10, 1, 4, { hue: [H - 5, H + 5], shape: 0, gravity: 0.12 }),
    ],
  };
}
/** water · 水：波纹扩散 + 浅色光环 */
function water(): CrackStyle {
  const H = MATERIAL_HUE.water; // 205
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 140, dy: t * 20, scale: 1 + t * 2.6, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 16, 40, 100, { hue: [H - 15, H + 15], gravity: 0 }),
      ...P.shockRing(cx, cy, 14, 80, 140, { hue: [H - 10, H + 10], gravity: 0 }),
    ],
  };
}
/** tornado · 龙卷风：螺旋上升 + 负重力柱 */
function tornado(): CrackStyle {
  const H = MATERIAL_HUE.tornado; // 185
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 100, dy: -t * 180, scale: 1 + t * 2.8, rot: t * Math.PI * 6, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 20, 4, 160, { hue: [H - 15, H + 15], gravity: -0.04 }),
      ...P.pillar(cx, cy, 12, 140, { hue: [H - 10, H + 10] }),
    ],
  };
}
/** aurora · 极光：波浪光带 + 紫光柱 */
function aurora(): CrackStyle {
  const H = MATERIAL_HUE.aurora; // 140
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 160, dy: -t * 100, scale: 1 + t * 2.5, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.parabola(cx, cy, 14, 260, 100, { hue: [H - 20, H + 20] }),
      ...P.pillar(cx, cy, 14, 120, { hue: [280, 320] }),
    ],
  };
}
/** earthquake · 地震：裂地冲击（上冲 → 下落） */
function earthquake(): CrackStyle {
  const H = MATERIAL_HUE.earthquake; // 25
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: 0,
      dy: t < 0.3 ? -t * 40 : (t - 0.3) * 200 - 12,
      scale: 1 + t * 2.2,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.arcSweep(cx, cy + 40, 16, Math.PI * 1.1, Math.PI * 1.9, 180, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.shards(cx, cy + 40, 14, 3, 9, { hue: [35, 55] }),
    ],
  };
}
/** volcano · 火山：喷发柱+岩浆+碎屑 */
function volcano(): CrackStyle {
  const H = MATERIAL_HUE.volcano; // 20
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: 0, dy: -t * 200, scale: 1 + t * 3, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.pillar(cx, cy, 18, 180, { hue: [H - 5, H + 30] }),
      ...P.burst(cx, cy, 12, 8, 16, { hue: [H, H + 40], shape: 0 }),
      ...P.shards(cx, cy, 10, 5, 12, { hue: [H - 10, H + 10] }),
    ],
  };
}

export const NATURAL_STYLES = { wind, snow, rain, water, tornado, aurora, earthquake, volcano };
