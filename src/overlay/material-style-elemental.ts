/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, type Particle } from './particles';
import { rand, TAU, type CrackStyle } from './material-style-core';

/** lightning · 电弧劈裂：蓄电→多段闪烁→分叉→余电消散 */
function lightning(): CrackStyle {
  return {
    hue: MATERIAL_HUE.lightning,
    sprite: (t, _vel) => {
      // 高频闪烁：开头连闪2-3次，后段渐灭
      const flicker =
        t < 0.35
          ? 0.5 + 0.5 * Math.abs(Math.sin(t * 55)) // 前段剧烈闪烁
          : 1 - (t - 0.35) / 0.65; // 后段渐灭
      const alpha = Math.max(0, flicker);
      const scale =
        t < 0.1
          ? 1.0 + Math.sin(t * 80) * 0.6 // 爆闪
          : t < 0.4
            ? 1.6 - ((t - 0.1) / 0.3) * 0.6
            : 1.0 - (t - 0.4) * 0.5;
      return { dx: 0, dy: 0, scale: Math.max(0.3, scale), rot: 0, alpha };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.lightning;
      // 第一层：主电弧（粗大分形折线）
      const mainArcs = 3 + Math.floor(Math.random() * 3);
      for (let a = 0; a < mainArcs; a++) {
        const baseAngle = (a / mainArcs) * TAU + rand(-0.4, 0.4);
        const arcLen = rand(100, 200);
        const segs = 4 + Math.floor(Math.random() * 3);
        const delay = rand(0, 0.2);
        for (let s = 0; s < segs; s++) {
          const segAngle = baseAngle + (Math.random() - 0.5) * 1.5;
          const progress = (s + 1) / segs;
          const sx = cx + Math.cos(baseAngle) * arcLen * progress;
          const sy = cy + Math.sin(baseAngle) * arcLen * progress;
          const sp = rand(12, 25);
          out.push({
            x: sx,
            y: sy,
            vx: Math.cos(segAngle) * sp,
            vy: Math.sin(segAngle) * sp,
            life: 1,
            decay: rand(0.02, 0.035) + delay,
            size: rand(5, 12),
            hue: rand(H - 10, H + 10),
            gravity: 0,
            shape: 1,
            angle: segAngle,
          });
        }
      }
      // 第二层：次级分叉（短而亮）
      for (let i = 0; i < 15; i++) {
        const a = rand(0, TAU);
        const sp = rand(8, 16);
        out.push({
          x: cx + rand(-40, 40),
          y: cy + rand(-40, 40),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.025, 0.04),
          size: rand(2.5, 5),
          hue: rand(H - 5, H + 25),
          gravity: 0,
          shape: 1,
          angle: a,
        });
      }
      // 第三层：电弧余辉光点
      for (let i = 0; i < 20; i++) {
        const a = rand(0, TAU);
        const sp = rand(3, 10);
        out.push({
          x: cx + rand(-60, 60),
          y: cy + rand(-60, 60),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.03, 0.05),
          size: rand(2, 4),
          hue: rand(H - 15, H + 15),
          gravity: 0,
          shape: 0,
          angle: 0,
        });
      }
      return out;
    },
  };
}
/** flame · 烈焰腾升：点火→爆燃→火舌摇曳→余烬 */
function flame(): CrackStyle {
  return {
    hue: MATERIAL_HUE.flame,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.08) {
        // 点火：从小火星爆发
        const s = t / 0.08;
        scale = 0.2 + s * 0.6;
        alpha = s;
      } else if (t < 0.35) {
        // 爆燃膨胀
        const s = (t - 0.08) / 0.27;
        dx = Math.sin(s * 12) * 18;
        dy = -s * 40;
        scale = 0.8 + s * 1.8;
        rot = Math.sin(s * 8) * 0.2;
      } else if (t < 0.7) {
        // 火舌摇曳：呼吸摆动+上腾
        const s = (t - 0.35) / 0.35;
        dx = Math.sin(t * 14) * 20 * (1 - s * 0.5);
        dy = -40 - s * 50;
        scale = 2.6 + Math.sin(t * 10) * 0.3;
        rot = Math.sin(t * 9) * 0.15;
      } else {
        // 余烬淡出
        const s = (t - 0.7) / 0.3;
        dy = -90 - s * 30;
        scale = 2.6 - s * 1.2;
        alpha = 1 - s;
      }
      return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.flame;
      // 第一层：核心白热火星（高速上冲）
      for (let i = 0; i < 35; i++) {
        const base = rand(-10, 10);
        const sp = rand(6, 14);
        const vx = base * 0.4 + Math.sin(i * 0.5) * 2;
        out.push({
          x: cx + rand(-6, 6),
          y: cy + rand(-4, 4),
          vx,
          vy: -sp,
          life: 1,
          decay: rand(0.008, 0.015),
          size: rand(5, 11),
          hue: rand(H + 18, H + 35),
          gravity: -0.04,
          shape: 0,
          angle: 0,
        });
      }
      // 第二层：橙红外焰（涡旋上升）
      for (let i = 0; i < 40; i++) {
        const base = rand(-18, 18);
        const sp = rand(3, 8);
        const vx = base * 0.3 + Math.sin(i * 0.4) * 3;
        const frac = i / 40;
        const hue = H - 6 + frac * 28;
        out.push({
          x: cx + rand(-14, 14),
          y: cy + rand(-2, 8),
          vx,
          vy: -sp,
          life: 1,
          decay: rand(0.01, 0.02),
          size: rand(3.5, 8),
          hue,
          gravity: -0.03,
          shape: 0,
          angle: 0,
        });
      }
      // 第三层：烟雾（横向扩散+下沉）
      for (let i = 0; i < 18; i++) {
        const a = rand(-1.4, 1.4);
        const sp = rand(2, 5);
        out.push({
          x: cx + rand(-14, 14),
          y: cy - rand(14, 30),
          vx: Math.cos(a) * sp,
          vy: -0.3,
          life: 1,
          decay: rand(0.012, 0.02),
          size: rand(3, 6),
          hue: rand(H - 20, H - 12),
          gravity: 0.07,
          shape: 0,
          angle: 0,
        });
      }
      return out;
    },
  };
}

export const ELEMENTAL_STYLES = { lightning, flame };
