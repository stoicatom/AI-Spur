/** Canvas 降级渲染的素材专属运动与粒子配方。 */
import { MATERIAL_HUE, type Particle } from './particles';
import { rand, TAU, type CrackStyle } from './material-style-core';

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

export const REGALIA_STYLES = { skull, crown };
