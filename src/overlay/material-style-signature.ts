/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, type Particle } from './particles';
import { rand, TAU, type CrackStyle } from './material-style-core';

/** whip · 甩鞭：蓄力→弧线甩出→鞭梢爆破 */
function whip(): CrackStyle {
  return {
    hue: MATERIAL_HUE.whip,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.15) {
        // 蓄力：微颤+蓄势后缩
        const s = t / 0.15;
        dx = Math.sin(s * 24) * 6;
        dy = s * 8;
        scale = 1 - s * 0.12;
        rot = Math.sin(s * 18) * 0.12;
      } else if (t < 0.5) {
        // 甩出：沿弧线加速扫过
        const s = (t - 0.15) / 0.35;
        const angle = s * Math.PI * 0.55;
        const r = s * s * 260;
        dx = Math.cos(angle) * r;
        dy = -Math.sin(angle) * r;
        scale = 0.88 + s * 1.5;
        rot = -angle + Math.PI * 0.4;
      } else if (t < 0.7) {
        // 鞭梢过冲：继续前冲但减速
        const s = (t - 0.5) / 0.2;
        const r = 260 + s * 80;
        dx = Math.cos(Math.PI * 0.55) * r;
        dy = -Math.sin(Math.PI * 0.55) * r;
        scale = 2.38 + s * 0.4;
        rot = Math.PI * 0.4 - s * 0.2;
        alpha = 1;
      } else {
        // 回弹+淡出
        const s = (t - 0.7) / 0.3;
        const r = 340 - s * 40;
        dx = Math.cos(Math.PI * 0.55) * r;
        dy = -Math.sin(Math.PI * 0.55) * r - s * 30;
        scale = 2.78 - s * 1.0;
        rot = Math.PI * 0.36 - s * 0.5;
        alpha = 1 - s * s;
      }
      return { dx, dy, scale, rot, alpha };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.whip;
      // 第一层：弧线残影（鞭身扫过的路径）
      for (let i = 0; i < 55; i++) {
        const frac = i / 55;
        const angle = frac * Math.PI * 0.55;
        const r = frac * frac * 260;
        const px = cx + Math.cos(angle) * r;
        const py = cy - Math.sin(angle) * r;
        const tangent = angle + Math.PI * 0.5;
        const sp = rand(5, 12);
        out.push({
          x: px,
          y: py,
          vx: Math.cos(tangent) * sp,
          vy: -Math.sin(tangent) * sp,
          life: 1,
          decay: rand(0.012, 0.02),
          size: rand(3, 8),
          hue: rand(H - 8, H + 14),
          gravity: 0.04,
          shape: 1,
          angle: tangent,
        });
      }
      // 第二层：鞭梢爆破火花（末端散射）
      for (let i = 0; i < 25; i++) {
        const a = rand(-0.8, 0.8) + Math.PI * 0.55;
        const sp = rand(4, 14);
        out.push({
          x: cx + 180,
          y: cy - 200,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.02, 0.035),
          size: rand(3, 7),
          hue: rand(H + 7, H + 27),
          gravity: 0.08,
          shape: 0,
          angle: 0,
        });
      }
      // 第三层：皮革碎片散落
      for (let i = 0; i < 18; i++) {
        const a = rand(0, TAU);
        const sp = rand(2, 7);
        out.push({
          x: cx + rand(60, 200),
          y: cy - rand(80, 220),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.018, 0.03),
          size: rand(2, 5),
          hue: rand(H - 16, H + 7),
          gravity: 0.12,
          shape: Math.random() < 0.4 ? 2 : 0,
          angle: rand(0, TAU),
        });
      }
      return out;
    },
  };
}
/** classic · 横切光弧：蓄势→横扫→光芒收敛 */
function classic(): CrackStyle {
  return {
    hue: MATERIAL_HUE.classic,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        alpha = 1;
      if (t < 0.1) {
        // 蓄势：压缩+闪烁
        alpha = 0.3 + Math.sin(t * 80) * 0.2;
        scale = 0.85;
      } else if (t < 0.45) {
        // 加速横扫
        const s = (t - 0.1) / 0.35;
        dx = s * 220;
        dy = s * -20;
        scale = 0.85 + s * 0.8;
        alpha = 0.5 + s * 0.5;
      } else if (t < 0.65) {
        // 满速：光痕最亮最大
        const s = (t - 0.45) / 0.2;
        dx = 220 + s * 30;
        dy = -20 + s * -5;
        scale = 1.65 + Math.sin(s * 12) * 0.15;
      } else {
        // 光芒收敛淡出
        const s = (t - 0.65) / 0.35;
        dx = 250 + s * 10;
        dy = -25 - s * 8;
        scale = 1.8 - s * 0.6;
        alpha = 1 - s * s;
      }
      return { dx, dy, scale, rot: 0, alpha };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.classic;
      // 第一层：主光痕 streak（水平飞射）
      for (let i = 0; i < 45; i++) {
        const frac = (i / 45 - 0.5) * 240;
        const px = cx + frac;
        const py = cy + frac * -0.09;
        const sp = rand(8, 20);
        out.push({
          x: px,
          y: py,
          vx: sp,
          vy: rand(-0.5, 0.5),
          life: 1,
          decay: rand(0.015, 0.025),
          size: rand(4, 10),
          hue: rand(H - 8, H + 15),
          gravity: 0.01,
          shape: 1,
          angle: 0.04,
        });
      }
      // 第二层：起点爆散光点
      for (let i = 0; i < 15; i++) {
        const a = rand(Math.PI * 0.4, Math.PI * 0.8);
        const sp = rand(2, 6);
        out.push({
          x: cx + rand(-5, 5),
          y: cy + rand(-5, 5),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.025, 0.04),
          size: rand(2, 4),
          hue: rand(H + 10, H + 35),
          gravity: 0.05,
          shape: 0,
          angle: 0,
        });
      }
      // 第三层：终点灰烟
      for (let i = 0; i < 12; i++) {
        const a = Math.PI + rand(-0.6, 0.6);
        const sp = rand(1.5, 4);
        out.push({
          x: cx - 115 + rand(-6, 6),
          y: cy + 10 + rand(-4, 4),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp + 0.3,
          life: 1,
          decay: rand(0.02, 0.035),
          size: rand(2, 4),
          hue: rand(H + 15, H + 35),
          gravity: 0.08,
          shape: 0,
          angle: 0,
        });
      }
      return out;
    },
  };
}

export const SIGNATURE_STYLES = { whip, classic };
