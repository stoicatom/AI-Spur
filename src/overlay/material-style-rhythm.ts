/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P, type Particle } from './particles';
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
/** drum · 黑胶律动：黑胶唱片旋转 + 音符螺旋 + 节奏冲击波 */
function drum(): CrackStyle {
  const H = MATERIAL_HUE.drum; // 25 (橙色)
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: 0,
      dy: -t * 80,
      scale: 1 + t * 2.6,
      rot: t * Math.PI * 8, // 高速旋转（黑胶唱片）
      alpha: 1 - t * 0.7,
    }),
    emit: (cx, cy, _vel) => {
      const particles: Particle[] = [];

      // 1. 黑胶唱片纹路（多层同心圆冲击波）
      particles.push(
        ...P.shockRing(cx, cy, 18, 30, 60, {
          hue: [0, 20], // 黑色到深灰
          gravity: 0
        })
      );
      particles.push(
        ...P.shockRing(cx, cy, 16, 50, 90, {
          hue: [0, 15],
          gravity: 0
        })
      );
      particles.push(
        ...P.shockRing(cx, cy, 14, 70, 120, {
          hue: [0, 10],
          gravity: 0
        })
      );

      // 2. 音符螺旋飞出（黑胶播放）
      particles.push(
        ...P.spiral(cx, cy, 20, 3, 140, {
          hue: [H - 10, H + 20],
          gravity: 0
        })
      );
      particles.push(
        ...P.spiral(cx, cy, 18, -3, 140, {
          hue: [H - 5, H + 15],
          gravity: 0
        })
      );

      // 3. 音符粒子（随机飞出）
      particles.push(
        ...P.notes(cx, cy, 14, {
          hue: [H - 5, H + 20]
        })
      );

      // 4. 节奏波纹（律动感）
      particles.push(
        ...P.burst(cx, cy, 12, 4, 10, {
          hue: [H - 10, H + 10],
          shape: 0,
          gravity: 0.04
        })
      );

      // 5. 金色高光（唱针反光）
      particles.push(
        ...P.burst(cx, cy, 10, 2, 6, {
          hue: [40, 50],
          shape: 0,
          gravity: 0
        })
      );

      return particles;
    },
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

/** piano · 钢琴：琴键按下 → 音符飞出 + 琴弦震动波纹 + 泛音光环 */
function piano(): CrackStyle {
  const H = MATERIAL_HUE.piano; // 0 (黑白)
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 140,
      dy: -t * 100,
      scale: 1 + t * 2.6,
      rot: 0,
      alpha: 1 - t
    }),
    emit: (cx, cy, _vel) => [
      // 1. 音符飞舞（彩色音符）
      ...P.notes(cx, cy, 20, {
        hue: [200, 280]
      }),

      // 2. 琴弦震动波纹（抛物线）
      ...P.parabola(cx, cy, 16, 220, 80, {
        hue: [40, 60]
      }),

      // 3. 泛音光环扩散（多层）
      ...P.shockRing(cx, cy, 14, 50, 100, {
        hue: [200, 240],
        gravity: 0
      }),
      ...P.shockRing(cx, cy, 12, 80, 130, {
        hue: [240, 280],
        gravity: 0
      }),

      // 4. 琴键敲击光芒（向上）
      ...P.pillar(cx, cy, 10, 100, {
        hue: [220, 260]
      }),

      // 5. 音波螺旋
      ...P.spiral(cx, cy, 12, 2, 110, {
        hue: [200, 280],
        gravity: 0
      }),
    ],
  };
}

export const RHYTHM_STYLES = { horn, harp, guitar, drum, bell, flute, piano };
