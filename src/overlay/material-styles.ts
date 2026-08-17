/**
 * 素材专属爆裂风味：每枚素材的色相 + 精灵运动 + 粒子发射器。
 * 本模块从 material-visual.ts 拆分，承载 52 素材的差异化叙事。
 */

import { MATERIAL_HUE, type WhipVel, type Particle, P } from './particles';

const TAU = Math.PI * 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export type CrackStyle = {
  hue: number;
  sprite: (t: number, vel: WhipVel) => { dx: number; dy: number; scale: number; rot: number; alpha: number };
  emit: (cx: number, cy: number, vel: WhipVel) => Particle[];
};

// ── 已有优质叙事素材（Task 6 首批迁移）──────────────────────────────

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

/** rocket · 多段火箭升空：点火→加速→穿云→尾焰消散 */
function rocket(): CrackStyle {
  return {
    hue: MATERIAL_HUE.rocket,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.12) {
        // 点火：震颤+火焰膨胀
        const s = t / 0.12;
        dx = Math.sin(s * 50) * 5;
        dy = s * 10;
        scale = 1 + Math.sin(s * 30) * 0.2;
        rot = Math.sin(s * 35) * 0.15;
      } else if (t < 0.15) {
        // 起飞瞬间
        const s = (t - 0.12) / 0.03;
        dy = 10 - s * 40;
        scale = 1.2 + s * 0.3;
      } else if (t < 0.65) {
        // 主加速段：三次方加速
        const s = (t - 0.15) / 0.5;
        dy = -30 - s * s * s * 600;
        scale = 1.5 + s * 0.5;
        rot *= 1 - s;
      } else if (t < 0.85) {
        // 穿云段：速度放缓
        const s = (t - 0.65) / 0.2;
        dy = -30 - 600 - s * 80;
        scale = 2.0 + s * 0.3;
      } else {
        // 淡出
        const s = (t - 0.85) / 0.15;
        dy = -30 - 680 - s * 60;
        scale = 2.3 + s * 0.2;
        alpha = 1 - s;
      }
      return { dx, dy, scale, rot, alpha };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.rocket;
      // 第一层：核心白热喷流（高速向下 streak）
      for (let i = 0; i < 30; i++) {
        const sp = rand(14, 30);
        const a = Math.PI / 2 + rand(-0.2, 0.2);
        out.push({
          x: cx + rand(-4, 4),
          y: cy + 8,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.01, 0.018),
          size: rand(6, 14),
          hue: rand(H + 14, H + 34),
          gravity: 0,
          shape: 1,
          angle: a,
        });
      }
      // 第二层：橙红外层火焰
      for (let i = 0; i < 35; i++) {
        const a = Math.PI / 2 + rand(-0.6, 0.6);
        const sp = rand(6, 16);
        out.push({
          x: cx + rand(-12, 12),
          y: cy + rand(10, 30),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.012, 0.022),
          size: rand(4, 10),
          hue: rand(H - 12, H + 6),
          gravity: 0,
          shape: 0,
          angle: 0,
        });
      }
      // 第三层：烟雾羽流（负重力飘浮）
      for (let i = 0; i < 25; i++) {
        const a = Math.PI / 2 + rand(-1.0, 1.0);
        const sp = rand(3, 8);
        out.push({
          x: cx + rand(-20, 20),
          y: cy + rand(15, 45),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.015, 0.028),
          size: rand(3, 7),
          hue: rand(H - 16, H - 1),
          gravity: -0.02,
          shape: 0,
          angle: 0,
        });
      }
      return out;
    },
  };
}

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

/** meteor · 流星坠击：弧线飞行→翻滚→撞击爆裂→尘埃散落 */
function meteor(): CrackStyle {
  return {
    hue: MATERIAL_HUE.meteor,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.1) {
        // 远处出现
        scale = 0.5 + (t / 0.1) * 0.5;
        dx = -(t / 0.1) * 40;
      } else if (t < 0.75) {
        // 弧线飞行：抛物线轨迹
        const s = (t - 0.1) / 0.65;
        dx = -40 + s * 340;
        dy = -s * (1 - s) * 350;
        rot = s * 8;
        scale = 1.0 + s * 0.3;
      } else if (t < 0.82) {
        // 撞击瞬间：急速放大
        const s = (t - 0.75) / 0.07;
        dx = 300 + s * 20;
        scale = 1.3 + s * 2.5;
        alpha = 1;
      } else {
        // 消散
        const s = (t - 0.82) / 0.18;
        dx = 320;
        scale = 3.8 - s * 2.5;
        alpha = 1 - s;
      }
      return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.meteor;
      // 第一层：飞行火尾（沿抛物线身后撒 streak）
      for (let i = 0; i < 35; i++) {
        const frac = i / 35;
        const px = cx - 40 + frac * 150;
        const py = cy - frac * 80 + frac * frac * 60;
        const a = Math.PI * 0.85 + rand(-0.25, 0.25);
        const sp = rand(3, 8);
        out.push({
          x: px,
          y: py,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.015, 0.025),
          size: rand(3.5, 8),
          hue: rand(H - 12, H + 10),
          gravity: 0.1,
          shape: 1,
          angle: a,
        });
      }
      // 第二层：撞击冲击波（扇形爆开）
      for (let i = 0; i < 25; i++) {
        const a = rand(-Math.PI * 0.9, Math.PI * 0.1);
        const sp = rand(8, 22);
        out.push({
          x: cx + 320,
          y: cy + 20,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.015, 0.025),
          size: rand(4, 10),
          hue: rand(H - 10, H + 15),
          gravity: 0.06,
          shape: 1,
          angle: a,
        });
      }
      // 第三层：碎岩+火星
      for (let i = 0; i < 15; i++) {
        const a = rand(-1.4, 0.3);
        const sp = rand(6, 18);
        out.push({
          x: cx + 320,
          y: cy + 20,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.015, 0.028),
          size: rand(4, 10),
          hue: rand(H - 20, H + 5),
          gravity: 0.22,
          shape: 2,
          angle: rand(0, TAU),
        });
      }
      return out;
    },
  };
}

/** skull · 颅骨崩解：裂纹→碎裂→骨片坠落→灰烬飘散 */
function skull(): CrackStyle {
  return {
    hue: MATERIAL_HUE.skull,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.12) {
        // 预裂：微颤
        dx = Math.sin(t * 80) * 2;
        rot = Math.sin(t * 60) * 0.04;
      } else if (t < 0.28) {
        // 裂纹扩展：高频抖动加剧
        const s = (t - 0.12) / 0.16;
        dx = Math.sin(s * 60) * 14 * s;
        rot = Math.sin(s * 45) * 0.25 * s;
        scale = 1 + Math.sin(s * 35) * 0.08;
      } else if (t < 0.42) {
        // 碎开：左右分离+放大
        const s = (t - 0.28) / 0.14;
        dx = Math.sin(t * 50) * 18 * (1 - s);
        scale = 1.08 + s * 0.3;
        alpha = 1 - s * 0.2;
      } else if (t < 0.7) {
        // 崩散：快速缩放+下沉
        const s = (t - 0.42) / 0.28;
        scale = 1.38 - s * 0.8;
        alpha = 0.8 - s * 0.5;
      } else {
        // 消失
        const s = (t - 0.7) / 0.3;
        alpha = 0.3 - s * 0.3;
      }
      return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.skull;
      // 第一层：大骨片（从上下缘分离坠落）
      for (let i = 0; i < 30; i++) {
        const isTop = i < 12;
        const ox = rand(-30, 30);
        const oy = isTop ? rand(-45, -12) : rand(12, 40);
        const vx = ox * 0.25 + rand(-2, 2);
        const vy = isTop ? rand(-3, 1.5) : rand(1.5, 5);
        out.push({
          x: cx + ox,
          y: cy + oy,
          vx,
          vy,
          life: 1,
          decay: rand(0.015, 0.03),
          size: rand(5, 11),
          hue: rand(H, H + 14),
          gravity: 0.25,
          shape: 2,
          angle: rand(0, TAU),
        });
      }
      // 第二层：小碎骨
      for (let i = 0; i < 20; i++) {
        const a = rand(0, TAU);
        const sp = rand(2, 8);
        out.push({
          x: cx + rand(-25, 25),
          y: cy + rand(-20, 20),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.018, 0.032),
          size: rand(2.5, 5),
          hue: rand(H + 4, H + 20),
          gravity: 0.18,
          shape: 2,
          angle: rand(0, TAU),
        });
      }
      // 第三层：灰烬烟雾
      for (let i = 0; i < 18; i++) {
        const a = rand(-1.5, 1.5);
        const sp = rand(1, 4);
        out.push({
          x: cx + rand(-20, 20),
          y: cy + rand(-12, 12),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 0.3,
          life: 1,
          decay: rand(0.012, 0.022),
          size: rand(2, 4.5),
          hue: rand(H - 8, H + 2),
          gravity: 0.06,
          shape: 0,
          angle: 0,
        });
      }
      return out;
    },
  };
}

/** crown · 王冠加冕：抛起→旋转上升→宝石环绕→落回 */
function crown(): CrackStyle {
  return {
    hue: MATERIAL_HUE.crown,
    sprite: (t, _vel) => {
      let dx = 0,
        dy = 0,
        scale = 1,
        rot = 0,
        alpha = 1;
      if (t < 0.08) {
        // 预备：微缩
        scale = 1 - (t / 0.08) * 0.1;
      } else if (t < 0.5) {
        // 上抛：抛物线上升
        const s = (t - 0.08) / 0.42;
        dy = -s * (1 - s) * 280;
        rot = s * 1.2 * TAU; // 快速旋转
        scale = 0.9 + s * 0.6;
      } else if (t < 0.7) {
        // 滞空：慢速旋转+宝石光晕
        const s = (t - 0.5) / 0.2;
        dy = -140 + Math.sin(s * Math.PI) * 15; // 微浮
        rot = 1.2 * TAU + s * 0.3 * TAU; // 变慢
        scale = 1.5 + Math.sin(s * 8) * 0.1; // 脉动
      } else {
        // 落回
        const s = (t - 0.7) / 0.3;
        dy = -140 + s * 140;
        rot = 1.5 * TAU + s * 0.5 * TAU;
        scale = 1.5 - s * 0.4;
        alpha = 1 - s * s * 0.5;
      }
      return { dx, dy, scale, rot, alpha };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      const H = MATERIAL_HUE.crown;
      // 第一层：宝石光晕环（在滞空高点）
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * TAU;
        const r = 30 + rand(-6, 6);
        out.push({
          x: cx + Math.cos(angle) * r,
          y: cy - 140 + Math.sin(angle) * r,
          vx: Math.cos(angle) * 0.5,
          vy: Math.sin(angle) * 0.5,
          life: 1,
          decay: rand(0.008, 0.015),
          size: rand(4, 9),
          hue: i % 3 === 0 ? rand(195, 215) : i % 3 === 1 ? rand(0, 10) : rand(H - 5, H + 10),
          gravity: -0.02,
          shape: 0,
          angle: 0,
        });
      }
      // 第二层：上抛弧光迹
      for (let i = 0; i < 25; i++) {
        const frac = i / 25;
        const py = cy - frac * 140;
        const a = -Math.PI / 2 + rand(-0.12, 0.12);
        const sp = rand(3, 8);
        out.push({
          x: cx + rand(-5, 5),
          y: py,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.012, 0.022),
          size: rand(2.5, 5),
          hue: rand(H - 5, H + 13),
          gravity: -0.01,
          shape: 0,
          angle: 0,
        });
      }
      // 第三层：落点光晕
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU);
        const sp = rand(2, 5);
        out.push({
          x: cx + rand(-8, 8),
          y: cy + rand(-4, 4),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: rand(0.02, 0.035),
          size: rand(2, 4),
          hue: rand(H - 10, H + 10),
          gravity: 0.04,
          shape: 0,
          angle: 0,
        });
      }
      return out;
    },
  };
}

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

/** blowgun · 吹箭筒：单支细长尾迹 + 吹气雾 */
function blowgun(): CrackStyle {
  const H = MATERIAL_HUE.blowgun; // 120
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 200,
      dy: 0,
      scale: 1 + t * 2,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 10, vel.dir - 0.1, vel.dir + 0.1, 180, { hue: [H - 10, H + 10] }),
      ...P.burst(cx, cy, 12, 1, 4, { hue: [H - 5, H + 5], shape: 0 }),
    ],
  };
}

/** chain · 链条：spiral 缠绕 + shards 链节 */
function chain(): CrackStyle {
  const H = MATERIAL_HUE.chain; // 220
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 160,
      dy: Math.sin(t * Math.PI * 2) * 40,
      scale: 1 + t * 2.2,
      rot: t * Math.PI * 3,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.spiral(cx, cy, 18, 2, 140, { hue: [H - 15, H + 15] }),
      ...P.shards(cx, cy, 12, 4, 10, { hue: [H - 10, H + 10] }),
    ],
  };
}

/** football · 足球：草地弹跳 + 草屑 */
function football(): CrackStyle {
  const H = MATERIAL_HUE.football; // 110
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 240,
      dy: -Math.abs(Math.sin(t * Math.PI * 2)) * 80,
      scale: 1 + t * 2.5,
      rot: t * Math.PI * 4,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.parabola(cx, cy, 16, 250, 120, { hue: [H - 15, H + 15] }),
      ...P.shards(cx, cy, 10, 2, 6, { hue: [H - 20, H - 10], shape: 2 }),
    ],
  };
}

/** star · 五芒星叙事：5 束光丝 + 星尘 */
function star(): CrackStyle {
  const H = MATERIAL_HUE.star; // 45
  return {
    hue: H,
    sprite: (t, _vel) => {
      // 五芒星旋转放大
      const rot = t * Math.PI * 2;
      const scale = 1 + t * 2.5;
      return { dx: t * 150, dy: 0, scale, rot, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => {
      const out: Particle[] = [];
      // 5 束光丝（每束窄扇 8 粒子）
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: 0, angleHi: Math.PI / 5 }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 2) / 5, angleHi: (Math.PI * 3) / 5 }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 4) / 5, angleHi: Math.PI }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 6) / 5, angleHi: (Math.PI * 7) / 5 }));
      out.push(...P.burst(cx, cy, 8, 6, 12, { hue: [H - 10, H + 10], shape: 1, angleLo: (Math.PI * 8) / 5, angleHi: (Math.PI * 9) / 5 }));
      // 星尘
      out.push(...P.burst(cx, cy, 12, 2, 5, { hue: [H - 5, H + 5], shape: 0 }));
      return out;
    },
  };
}

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

/** trident · 三海浪：P.parabola 3 组 */
function trident(): CrackStyle {
  const H = MATERIAL_HUE.trident; // 205
  return {
    hue: H,
    sprite: (t, _vel) => {
      const scale = 1 + t * 2.8;
      const dy = -Math.sin(t * Math.PI) * 60;
      return { dx: t * 180, dy, scale, rot: Math.sin(t * Math.PI * 3) * 0.4, alpha: 1 - t };
    },
    emit: (cx, cy, _vel) => [
      ...P.parabola(cx, cy - 20, 12, 280, 80, { hue: [H - 15, H + 15] }),
      ...P.parabola(cx, cy, 12, 260, 100, { hue: [H - 10, H + 10] }),
      ...P.parabola(cx, cy + 20, 12, 240, 90, { hue: [H - 5, H + 5] }),
    ],
  };
}

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

/** dragonfly · 蜻蜓：双翅光轨镜像 + 疾掠 */
function dragonfly(): CrackStyle {
  const H = MATERIAL_HUE.dragonfly; // 140
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 240,
      dy: Math.sin(t * Math.PI * 6) * 30,
      scale: 1 + t * 2.3,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 12, vel.dir + Math.PI / 4, vel.dir + Math.PI / 2, 200, { hue: [H - 10, H + 10] }),
      ...P.arcSweep(cx, cy, 12, vel.dir - Math.PI / 2, vel.dir - Math.PI / 4, 200, { hue: [H - 10, H + 10] }),
      ...P.burst(cx, cy, 6, 8, 14, { hue: [H - 5, H + 5], shape: 1 }),
    ],
  };
}

/** tessen · 铁扇：扇形展开 + 斜切弧 */
function tessen(): CrackStyle {
  const H = MATERIAL_HUE.tessen; // 30
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: t * 200,
      dy: -t * 60,
      scale: 1 + t * 2.8,
      rot: t * Math.PI * 0.8,
      alpha: 1 - t,
    }),
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 20, vel.dir - Math.PI / 3, vel.dir + Math.PI / 3, 180, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.burst(cx, cy, 10, 4, 9, { hue: [H - 5, H + 5], shape: 0 }),
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

/** shield · 盾：冲击波+光晕 */
function shield(): CrackStyle {
  const H = MATERIAL_HUE.shield; // 215
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 60, dy: 0, scale: 1 + t * 2.5, rot: 0, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.shockRing(cx, cy, 18, 50, 100, { hue: [H - 15, H + 15], gravity: 0 }),
      ...P.shockRing(cx, cy, 12, 80, 150, { hue: [H - 10, H + 10], gravity: 0 }),
    ],
  };
}

/** bomb · 炸弹：球状爆炸 */
function bomb(): CrackStyle {
  const H = MATERIAL_HUE.bomb; // 15
  return {
    hue: H,
    sprite: (t, _vel) => {
      const scale = t < 0.2 ? 1 - t * 2 : (t - 0.2) * 4;
      return { dx: 0, dy: 0, scale, rot: 0, alpha: t < 0.2 ? 1 : 1 - (t - 0.2) / 0.8 };
    },
    emit: (cx, cy, _vel) => [
      ...P.burst(cx, cy, 18, 8, 16, { hue: [H - 5, H + 20], shape: 0 }),
      ...P.shockRing(cx, cy, 14, 30, 80, { hue: [H, H + 30], gravity: 0 }),
      ...P.shards(cx, cy, 12, 5, 12, { hue: [H - 10, H + 10] }),
    ],
  };
}

/** hammer · 战锤：砸地裂纹 */
function hammer(): CrackStyle {
  const H = MATERIAL_HUE.hammer; // 220
  return {
    hue: H,
    sprite: (t, _vel) => {
      const dy = t < 0.4 ? -t * 80 : (t - 0.4) * 300 - 32;
      const scale = 1 + t * 2;
      return { dx: 0, dy, scale, rot: t < 0.4 ? -t * 0.5 : -0.2, alpha: 1 - t * 0.8 };
    },
    emit: (cx, cy, _vel) => [
      ...P.arcSweep(cx, cy + 40, 16, Math.PI * 1.1, Math.PI * 1.9, 180, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.burst(cx, cy + 40, 14, 2, 8, { hue: [H - 10, H + 10], shape: 2, gravity: 0.15 }),
      ...P.pillar(cx, cy + 40, 8, 60, { hue: [H - 20, H] }),
    ],
  };
}

/** scepter · 权杖：八芒星芒+光环 */
function scepter(): CrackStyle {
  const H = MATERIAL_HUE.scepter; // 285
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: t * 80, dy: -t * 120, scale: 1 + t * 2.8, rot: t * Math.PI, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.burst(cx, cy, 16, 8, 14, { hue: [H - 15, H + 15], shape: 1 }),
      ...P.spiral(cx, cy, 12, 2, 100, { hue: [H - 10, H + 10] }),
      ...P.pillar(cx, cy, 8, 80, { hue: [285, 340] }),
    ],
  };
}

/** amulet · 护符：旋转符文环 */
function amulet(): CrackStyle {
  const H = MATERIAL_HUE.amulet; // 270
  return {
    hue: H,
    sprite: (t, _vel) => ({ dx: 0, dy: -t * 80, scale: 1 + t * 2.5, rot: t * Math.PI * 4, alpha: 1 - t }),
    emit: (cx, cy, _vel) => [
      ...P.spiral(cx, cy, 16, 3, 120, { hue: [H - 15, H + 15] }),
      ...P.shockRing(cx, cy, 14, 40, 90, { hue: [H - 20, H + 20], gravity: 0 }),
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

/** boomerang · 回旋镖：椭圆弧线+旋转 */
function boomerang(): CrackStyle {
  const H = MATERIAL_HUE.boomerang; // 25
  return {
    hue: H,
    sprite: (t, _vel) => {
      const angle = t * Math.PI * 2;
      const dx = Math.sin(angle) * 160;
      const dy = -Math.sin(angle * 0.5) * 60;
      return { dx, dy, scale: 1 + Math.sin(angle * 0.5) * 1.5 + 0.5, rot: angle * 3, alpha: 1 - t * 0.7 };
    },
    emit: (cx, cy, vel) => [
      ...P.arcSweep(cx, cy, 16, vel.dir - Math.PI * 0.4, vel.dir + Math.PI * 0.4, 180, { hue: [H - 15, H + 15] }),
      ...P.burst(cx, cy, 10, 3, 7, { hue: [H - 5, H + 5], shape: 0 }),
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

// ── 导出入口 ──────────────────────────────────────────────────────────

export function crackStyle(id: string): CrackStyle {
  const M: Record<string, () => CrackStyle> = {
    whip,
    classic,
    rocket,
    lightning,
    flame,
    meteor,
    skull,
    crown,
    sword,
    slingshot,
    blowgun,
    chain,
    football,
    star,
    horn,
    trident,
    dragonfly,
    tessen,
    bow,
    shield,
    bomb,
    hammer,
    scepter,
    amulet,
    dagger,
    boomerang,
    spear,
  };
  const fn =
    M[id] ??
    (() => {
      // 未知素材回退到简单 burst（其余素材 Task 7+ 填充）
      const H = MATERIAL_HUE[id] ?? 28;
      return {
        hue: H,
        sprite: (t, _vel) => ({
          dx: t * 200,
          dy: 0,
          scale: 1 + t,
          rot: 0,
          alpha: 1 - t,
        }),
        emit: (cx, cy, _vel) => {
          const out: Particle[] = [];
          for (let i = 0; i < 30; i++) {
            const a = rand(0, TAU);
            const sp = rand(2, 7);
            out.push({
              x: cx,
              y: cy,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 1,
              decay: rand(0.02, 0.035),
              size: rand(2, 5),
              hue: rand(H - 10, H + 10),
              gravity: 0.08,
              shape: 0,
              angle: 0,
            });
          }
          return out;
        },
      };
    });
  return fn();
}
