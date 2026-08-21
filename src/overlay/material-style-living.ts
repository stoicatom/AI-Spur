/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** dragonfly · 蜻蜓：振翅轨迹 + 蜻蜓低空疾掠 */
function dragonfly(): CrackStyle {
  const H = MATERIAL_HUE.dragonfly; // 140
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 180,
      dy: Math.sin(t * Math.PI * 4) * 60,
      scale: 1 + t * 2,
      rot: Math.sin(t * Math.PI * 3) * 0.3,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 14, vel.dir - 0.2, vel.dir + 0.2, 140, { hue: [H - 15, H + 15] }),
      ...P.burst(cx, cy, 12, 2, 5, { hue: [H - 10, H + 10], shape: 0, gravity: 0.05 }),
    ],
  };
}
/** bamboo · 竹：竹节断裂（P4 第 9 个） */
function bamboo(): CrackStyle {
  const H = MATERIAL_HUE.bamboo; // 110
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 140,
      dy: t * 60,
      scale: 1 + t * 2.2,
      rot: t * 0.5,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.shards(cx, cy, 14, 4, 10, { hue: [H - 15, H + 15] }),
      ...P.burst(cx, cy, 12, 2, 6, { hue: [H - 10, H + 10], shape: 0, gravity: 0.1 }),
    ],
  };
}
/** lotus · 莲花：花瓣飘散（P4 第 10 个） */
function lotus(): CrackStyle {
  const H = MATERIAL_HUE.lotus; // 310
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 120,
      dy: -t * 80,
      scale: 1 + t * 2.6,
      rot: t * Math.PI * 2,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 16, 2.5, 140, { hue: [H - 20, H + 20], gravity: 0.05 }),
      ...P.burst(cx, cy, 14, 2, 6, { hue: [H - 10, H + 10], shape: 0, gravity: 0.08 }),
    ],
  };
}

export const LIVING_STYLES = { dragonfly, bamboo, lotus };
