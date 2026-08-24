/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** horn · 环形声波：环形冲击波（P.shockRing）+ 音符（P.notes） */
function horn(): CrackStyle {
  const H = MATERIAL_HUE.horn; // 48
  return {
    hue: H,
    sprite: (t, _vel) => {
      const scale = 1 + Math.sin(t * Math.PI * 4) * 0.3 + t * 2;
      return { dx: t * 120, dy: -t * 80, scale, rot: t * Math.PI, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 16, 40, 80, { hue: [H - 10, H + 10], gravity: 0 }),
      ...P.notes(cx, cy, 14, { hue: [H - 5, H + 5] }),
    ],
  };
}
/** harp · 竖琴：琴弦波纹（P.parabola）+ 螺旋波（P.spiral） */
function harp(): CrackStyle {
  const H = MATERIAL_HUE.harp; // 45
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 160,
      dy: -t * 80,
      scale: 1 + t * 2.5,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.parabola(cx, cy, 14, 240, 100, { hue: [H - 15, H + 15] }),
      ...P.spiral(cx, cy, 12, 2, 120, { hue: [H - 10, H + 10], gravity: 0 }),
    ],
  };
}
/** guitar · 吉他：音符+弦振 */
function guitar(): CrackStyle {
  const H = MATERIAL_HUE.guitar; // 35
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 140, dy: -t * 80, scale: 1 + t * 2.3, rot: t * 0.5, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.notes(cx, cy, 14, { hue: [H - 10, H + 10] }),
      ...P.parabola(cx, cy, 10, 200, 80, { hue: [H - 5, H + 15] }),
    ],
  };
}
/** drum · 鼓：冲击波+音符 */
function drum(): CrackStyle {
  const H = MATERIAL_HUE.drum; // 25
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: 0,
      dy: -t * 60,
      scale: 1 + Math.sin(t * Math.PI * 4) * 0.4 + t * 2,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 14, 50, 110, { hue: [H - 10, H + 10], gravity: 0 }),
      ...P.notes(cx, cy, 12, { hue: [H - 5, H + 15] }),
    ],
  };
}
/** bell · 铃铛：环形音波 + 轻微上浮音符 */
function bell(): CrackStyle {
  const H = MATERIAL_HUE.bell; // 40
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 80,
      dy: -t * 120,
      scale: 1 + Math.sin(t * Math.PI * 5) * 0.3 + t * 2,
      rot: Math.sin(t * Math.PI * 4) * 0.3,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 16, 40, 90, { hue: [H - 15, H + 15], gravity: 0 }),
      ...P.burst(cx, cy, 10, 2, 6, { hue: [H - 5, H + 10], shape: 0, gravity: 0.05 }),
    ],
  };
}
/** flute · 笛子：横向音符流 + 螺旋波 */
function flute(): CrackStyle {
  const H = MATERIAL_HUE.flute; // 195
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 200,
      dy: Math.sin(t * Math.PI * 3) * 40,
      scale: 1 + t * 2.2,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => [
      ...P.notes(cx, cy, 16, { hue: [H - 10, H + 10] }),
      ...P.spiral(cx, cy, 10, 1.5, 120, { hue: [H - 5, H + 5], gravity: 0 }),
    ],
  };
}

export const RHYTHM_STYLES = { horn, harp, guitar, drum, bell, flute };
