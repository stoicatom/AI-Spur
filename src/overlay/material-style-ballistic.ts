/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, P, type Particle } from './particles';
import { rand, TAU, type CrackStyle } from './material-style-core';

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

export const BALLISTIC_STYLES = { rocket, meteor, bomb };
