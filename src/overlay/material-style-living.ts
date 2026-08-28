/** Canvas 降级渲染的素材专属运动与粒子配方 - 传奇生物类。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';
import type { Particle, ParticleShape } from './particles-types';

/** dragon · 神龙：蜿蜒飞行 + 龙鳞闪烁 + 龙息能量波 + 云雾缠绕 + 龙珠追随 */
function dragon(): CrackStyle {
  const H = MATERIAL_HUE.dragon; // 45 (金色)
  return {
    hue: H,
    sprite: (t, _vel) => {
      // 神龙蜿蜒飞行（S型轨迹）
      const baseX = t * 240;
      const baseY = -t * 100;
      // S型波动
      const waveX = Math.sin(t * Math.PI * 2) * 40;
      const waveY = Math.sin(t * Math.PI * 4) * 30;

      return {
        dx: baseX + waveX,
        dy: baseY + waveY,
        scale: 1 + t * 3.5,
        rot: Math.sin(t * Math.PI * 2) * 0.4, // 随波动旋转
        alpha: 1 - t * 0.7
      };
    },
    emit: (cx, cy, vel) => {
      const particles: Particle[] = [];

      // 1. 龙鳞沿着龙身的 S 型路径排布，菱形粒子比泛化圆点更像鳞甲。
      for (let i = 0; i < 30; i++) {
        const fraction = i / 30;
        const angle = vel.dir + Math.sin(fraction * Math.PI * 4) * 0.75 + (i % 2 ? 0.18 : -0.18);
        const speed = 3 + Math.random() * 4;
        const offset = (fraction - 0.5) * 90;
        particles.push({
          x: cx + Math.cos(vel.dir) * offset,
          y: cy + Math.sin(vel.dir) * offset + Math.sin(fraction * Math.PI * 4) * 22,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.018 + Math.random() * 0.012,
          size: 3 + Math.random() * 3,
          hue: H + (Math.random() - 0.5) * 16,
          gravity: 0.015,
          shape: 2 as ParticleShape,
          angle: angle,
        });
      }

      // 2. 龙息能量波（口中喷出的能量）
      particles.push(
        ...P.beam(cx + Math.cos(vel.dir) * 28, cy + Math.sin(vel.dir) * 28, 18, 150, {
          hue: [H - 10, H + 20]
        })
      );

      // 3. 云雾缠绕（身周云气）
      particles.push(
        ...P.spiral(cx, cy, 14, 2.4, 105, {
          hue: [200, 220], // 青灰云雾
          gravity: -0.02
        })
      );
      particles.push(
        ...P.spiral(cx, cy, 12, -2.1, 92, {
          hue: [210, 230],
          gravity: -0.01
        })
      );

      // 4. 龙珠轨迹（追随龙身的光珠）
      const orbAngle = vel.dir + Math.PI * 0.3;
      const orbDist = 60;
      const orbX = cx + Math.cos(orbAngle) * orbDist;
      const orbY = cy + Math.sin(orbAngle) * orbDist;

      // 龙珠光环
      particles.push(
        ...P.shockRing(orbX, orbY, 14, 20, 50, {
          hue: [H - 5, H + 15],
          gravity: 0
        })
      );
      // 龙珠光芒
      particles.push(
        ...P.burst(orbX, orbY, 16, 2, 8, {
          hue: [H - 10, H + 10],
          shape: 0,
          gravity: 0
        })
      );

      // 5. 龙爪能量爪痕（从龙爪位置发射）
      const clawAngle1 = vel.dir - Math.PI * 0.15;
      const clawAngle2 = vel.dir + Math.PI * 0.15;
      particles.push(
        ...P.arcSweep(cx, cy, 16, clawAngle1 - 0.2, clawAngle1 + 0.2, 180, {
          hue: [H - 15, H + 15],
          shape: 1
        })
      );
      particles.push(
        ...P.arcSweep(cx, cy, 16, clawAngle2 - 0.2, clawAngle2 + 0.2, 180, {
          hue: [H - 15, H + 15],
          shape: 1
        })
      );

      // 6. 威压气场（外围金色能量环）
      particles.push(
        ...P.shockRing(cx, cy, 12, 46, 96, {
          hue: [H - 20, H + 20],
          gravity: 0
        })
      );

      // 7. 火焰纹理（龙威烈焰）
      particles.push(
        ...P.pillar(cx + Math.cos(vel.dir) * 28, cy + Math.sin(vel.dir) * 28, 10, 86, {
          hue: [15, 35]
        })
      );

      return particles;
    },
  };
}

/** phoenix · 凤凰：涅槃重生 + 火焰羽毛飘落 + 金色能量波 */
function phoenix(): CrackStyle {
  const H = MATERIAL_HUE.phoenix; // 20 (火红色)
  return {
    hue: H,
    sprite: (t, _vel) => {
      // 涅槃动画：先收缩燃烧（0-0.4），后展翅重生（0.4-1.0）
      const phase1 = t < 0.4;
      let scale, alpha;

      if (phase1) {
        // 燃烧收缩阶段
        const t1 = t / 0.4;
        scale = 1 - t1 * 0.3;
        alpha = 1;
      } else {
        // 展翅重生阶段
        const t2 = (t - 0.4) / 0.6;
        scale = 0.7 + t2 * 3;
        alpha = 1 - t2 * 0.7;
      }

      return {
        dx: t * 160,
        dy: -t * 120,
        scale,
        rot: Math.sin(t * Math.PI * 2) * 0.3,
        alpha
      };
    },
    emit: (cx, cy, vel) => {
      const particles: Particle[] = [];

      // 1. 火焰羽毛飘落（金红色羽毛）
      for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20 + vel.dir;
        const speed = 3 + Math.random() * 5;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 2, // 向下飘落
          life: 1,
          decay: 0.015 + Math.random() * 0.01,
          size: 5 + Math.random() * 4,
          hue: H + (Math.random() - 0.5) * 30,
          gravity: 0.04, // 轻微下落
          shape: 1 as ParticleShape,
          angle: angle,
        });
      }

      // 2. 涅槃火焰（中心爆发）
      particles.push(
        ...P.burst(cx, cy, 18, 4, 10, {
          hue: [H - 10, H + 20],
          shape: 0
        })
      );

      // 3. 凤凰展翅能量波（弧形扩散）
      particles.push(
        ...P.arcSweep(cx, cy, 16, vel.dir - Math.PI * 0.8, vel.dir + Math.PI * 0.8, 180, {
          hue: [H - 15, H + 15],
          shape: 1
        })
      );

      // 4. 金色光环
      particles.push(
        ...P.shockRing(cx, cy, 14, 60, 120, {
          hue: [40, 50],
          gravity: 0
        })
      );

      // 5. 上升火柱
      particles.push(
        ...P.pillar(cx, cy, 12, 140, {
          hue: [H - 5, H + 25]
        })
      );

      return particles;
    },
  };
}

export const LIVING_STYLES = { dragon, phoenix };
