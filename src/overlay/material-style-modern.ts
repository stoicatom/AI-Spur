/** Canvas 降级渲染的素材专属运动与粒子配方 - 现代武器类。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';

/** revolver · 左轮手枪：枪口火焰 → 子弹轨迹 → 远端冲击（分阶段叙事） */
function revolver(): CrackStyle {
  const H = MATERIAL_HUE.revolver; // 0 (金属灰)
  return {
    hue: H,
    sprite: (t, vel) => {
      // 阶段1: 枪口火焰 (0-0.2)
      // 阶段2: 子弹飞行 (0.2-0.6)
      // 阶段3: 远端爆炸 (0.6-1.0)
      const phase1 = t < 0.2;
      const phase2 = t >= 0.2 && t < 0.6;

      let dx = 0, dy = 0, scale = 1, rot = 0;

      if (phase1) {
        // 枪口火焰阶段
        const t1 = t / 0.2;
        dx = t1 * 20;
        dy = 0;
        scale = 1 + t1 * 0.5;
        rot = vel.dir;
      } else if (phase2) {
        // 子弹飞行阶段
        const t2 = (t - 0.2) / 0.4;
        dx = 20 + t2 * 280;
        dy = 0;
        scale = 1 + t2 * 1.5;
        rot = vel.dir;
      } else {
        // 远端爆炸阶段
        const t3 = (t - 0.6) / 0.4;
        dx = 300;
        dy = 0;
        scale = 2.5 + t3 * 1.5;
        rot = vel.dir;
      }

      return { dx, dy, scale, rot, alpha: 1 - t * 0.7 };
    },
    emit: (cx, cy, _vel) => [
      // 枪口火焰爆发（橙红色）
      ...P.flare(cx + 40, cy, 16, 50, {
        hue: [15, 35]
      }),

      // 子弹轨迹光束
      ...P.beam(cx + 40, cy, 18, 250, {
        hue: [50, 60]
      }),

      // 弹壳抛出（向上侧方）
      ...P.burst(cx - 10, cy - 20, 8, 3, 7, {
        hue: [40, 50],
        shape: 2,
        gravity: 0.15
      }),

      // 硝烟扩散
      ...P.burst(cx + 40, cy, 12, 1, 4, {
        hue: [0, 20],
        shape: 0,
        gravity: 0.02
      }),

      // 远端冲击爆炸
      ...P.burst(cx + 300, cy, 20, 6, 12, {
        hue: [20, 40],
        shape: 0,
        gravity: 0.08
      }),

      // 冲击波
      ...P.shockRing(cx + 300, cy, 14, 40, 80, {
        hue: [25, 45],
        gravity: 0
      }),

      // 火花飞溅
      ...P.spark(cx + 300, cy, 16, 4, 10, {
        hue: [30, 50]
      }),
    ],
  };
}

export const MODERN_WEAPON_STYLES = { revolver };
