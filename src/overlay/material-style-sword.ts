/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, type Particle } from './particles';
import { rand, TAU, type CrackStyle } from './material-style-core';

/** sword · 三段式剑斩：提刀→劈下→收刀 */
function sword(): CrackStyle {
  return {
    hue: MATERIAL_HUE.sword,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.15) {
        // 提刀：后撤上举
        const s = t / 0.15;
        dx = -s * 40;
        dy = -s * 80;
        rot = -s * 1.2;
        scale = 0.9 + s * 0.1;
      } else if (t < 0.2) {
        // 蓄势停顿
        const s = (t - 0.15) / 0.05;
        dx = -40;
        dy = -80;
        rot = -1.2;
        scale = 1 + Math.sin(s * 20) * 0.05;
      } else if (t < 0.6) {
        // 劈下：大弧线斩落
        const s = (t - 0.2) / 0.4;
        const angle = -Math.PI * 0.3 + s * Math.PI * 0.7;
        const r = 100;
        dx = -40 + Math.cos(angle + Math.PI * 0.5) * r * s;
        dy = -80 + Math.sin(angle + Math.PI * 0.5) * r * s + 160 * s;
        rot = -1.2 + s * 2.8;
        scale = 1 + s * 0.7;
      } else if (t < 0.8) {
        // 劈后停顿+震颤
        const s = (t - 0.6) / 0.2;
        dy = 80 + Math.sin(s * 15) * 4 * (1 - s);
        rot = 1.6 - s * 0.2;
        scale = 1.7 + Math.sin(s * 20) * 0.08 * (1 - s);
      } else {
        // 收刀淡出
        const s = (t - 0.8) / 0.2;
        dy = 80 - s * 80;
        rot = 1.4 - s * 1.4;
        scale = 1.7 - s * 0.7;
        alpha = 1 - s;
      }
      return { dx, dy, scale, rot, alpha };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.sword;
      // 第一层：刃光弧线（沿劈斩路径）
      for (let i = 0; i < 45; i++) {
        const frac = i / 45;
        const angle = -Math.PI * 0.3 + frac * Math.PI * 0.7;
        const r = 100;
        const px = cx - 40 + Math.cos(angle + Math.PI * 0.5) * r * frac;
        const py = cy - 80 + Math.sin(angle + Math.PI * 0.5) * r * frac + 160 * frac;
        const tangent = angle + Math.PI * 0.5;
        const sp = rand(8, 20);
        out.push({
          x: px,
          y: py,
          vx: Math.cos(tangent) * sp,
          vy: Math.sin(tangent) * sp,
          life: 1,
          decay: rand(0.015, 0.028),
          size: rand(4, 10),
          hue: rand(H + 14, H + 34),
          gravity: 0.02,
          shape: 1,
          angle: tangent,
        });
      }
      // 第二层：劈斩端点火花爆溅
      for (let i = 0; i < 18; i++) {
        const a = rand(-1.5, 0.6) + Math.PI * 0.4;
        const sp = rand(5, 14);
        out.push({
          x: cx + 60,
          y: cy + 80,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.018, 0.032),
          size: rand(3, 7),
          hue: rand(H - 6, H + 22),
          gravity: 0.12,
          shape: 0,
          angle: 0,
        });
      }
      // 第三层：铁屑碎片
      for (let i = 0; i < 10; i++) {
        const a = rand(-1.0, 0.3) + Math.PI * 0.4;
        const sp = rand(4, 10);
        out.push({
          x: cx + 60,
          y: cy + 80,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.02, 0.035),
          size: rand(2.5, 5),
          hue: rand(H + 1, H + 18),
          gravity: 0.18,
          shape: 2,
          angle: rand(0, TAU),
        });
      }
      return out;
    },
  };
}

export const SWORD_STYLES = { sword };
