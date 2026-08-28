/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** slingshot · 弹弓：皮筋绷紧 + 高速弹道 */
function slingshot(): CrackStyle {
  const H = MATERIAL_HUE.slingshot; // 25
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 220,
      dy: -t * 50,
      scale: 1 + Math.pow(t, 0.5) * 2.5,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 18, vel.dir - 0.2, vel.dir + 0.2, 240, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.burst(cx, cy, 8, 3, 8, { hue: [H - 5, H + 5], shape: 2 }),
    ],
  };
}
/** blowgun · 吹箭筒：直线飞镖 + 吹气雾 */
function blowgun(): CrackStyle {
  const H = MATERIAL_HUE.blowgun; // 120
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 280,
      dy: t * 20,
      scale: 1 + t * 1.6,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 14, vel.dir, vel.dir + 0.05, 220, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.burst(cx, cy, 12, 1, 4, { hue: [H - 5, H + 5], shape: 0, gravity: 0.08 }),
    ],
  };
}
/** bow · 弓：拉弦→抛物线齐射 */
function bow(): CrackStyle {
  const H = MATERIAL_HUE.bow; // 33
  return {
    hue: H,
    sprite: (t, _vel) => {
      const scale = 1 + t * 2.6;
      const dx = t < 0.3 ? -t * 30 : (t - 0.3) * 260;
      return { dx, dy: -t * 40, scale, rot: 0, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => [
      ...P.parabola(cx, cy, 10, 240, 100, { hue: [H - 10, H + 10] }),
      ...P.parabola(cx, cy - 15, 10, 260, 80, { hue: [H - 5, H + 5] }),
      ...P.parabola(cx, cy + 15, 8, 220, 90, { hue: [H - 8, H + 8] }),
    ],
  };
}
/** dagger · 匕首：刺击+喷溅 */
function dagger(): CrackStyle {
  const H = MATERIAL_HUE.dagger; // 200
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 220, dy: t * 40, scale: 1 + t * 2.4, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 12, vel.dir - 0.15, vel.dir + 0.15, 200, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.burst(cx, cy, 14, 4, 12, { hue: [350, 360], shape: 0 }),
    ],
  };
}
/** spear · 长矛：直线尾迹+钉地 */
function spear(): CrackStyle {
  const H = MATERIAL_HUE.spear; // 200
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 240, dy: t * 60, scale: 1 + t * 2.3, rot: 0.4, alpha: 1 - t }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 14, vel.dir - 0.08, vel.dir + 0.08, 220, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.burst(cx, cy + 60, 10, 2, 7, { hue: [25, 45], shape: 0, gravity: 0.12 }),
    ],
  };
}
/** archery · 射箭：箭矢直线尾迹 + 碎裂喷溅 */
function archery(): CrackStyle {
  const H = MATERIAL_HUE.archery; // 350
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 260,
      dy: t * 40,
      scale: 1 + t * 1.8,
      rot: 0.1,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 14, vel.dir, vel.dir + 0.1, 200, { hue: [H - 10, H + 10], shape: 1 }),
      ...P.burst(cx, cy, 12, 2, 5, { hue: [H - 5, H + 15], shape: 0, gravity: 0.1 }),
    ],
  };
}

export const RANGED_STYLES = { slingshot, blowgun, bow, dagger, spear, archery };
