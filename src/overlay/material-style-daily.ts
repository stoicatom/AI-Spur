/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** football · 足球：踢球轨迹 + 草屑 */
function football(): CrackStyle {
  const H = MATERIAL_HUE.football; // 110
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 200,
      dy: -Math.sin(t * Math.PI) * 120,
      scale: 1 + t * 2.2,
      rot: t * Math.PI * 3,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 14, vel.dir - 0.3, vel.dir + 0.3, 160, { hue: [H - 15, H + 15] }),
      ...P.burst(cx, cy, 12, 3, 8, { hue: [H - 10, H + 10], shape: 0, gravity: 0.1 }),
    ],
  };
}
/** tennis · 网球：拍击弹跳 + 弧线轨迹 */
function tennis(): CrackStyle {
  const H = MATERIAL_HUE.tennis; // 80
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 220,
      dy: -Math.abs(Math.sin(t * Math.PI * 2)) * 100,
      scale: 1 + t * 2,
      rot: t * Math.PI * 4,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.parabola(cx, cy, 14, 200, 80, { hue: [H - 10, H + 20] }),
      ...P.burst(cx, cy, 12, 2, 6, { hue: [H - 5, H + 10], shape: 0, gravity: 0.08 }),
    ],
  };
}
/** boxing · 拳击：拳头冲击波 + 碎屑爆发 */
function boxing(): CrackStyle {
  const H = MATERIAL_HUE.boxing; // 0
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 240,
      dy: 0,
      scale: 1 + t * 2.6,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 16, 30, 80, { hue: [H, H + 20], gravity: 0 }),
      ...P.burst(cx, cy, 14, 5, 12, { hue: [H + 10, H + 30], shape: 0, gravity: 0.05 }),
    ],
  };
}

export const DAILY_STYLES = { football, tennis, boxing };
