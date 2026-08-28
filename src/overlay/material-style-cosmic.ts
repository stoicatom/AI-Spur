/** Canvas 降级渲染的素材专属运动与粒子配方 - 天体与高能物理类。 */
import { MATERIAL_HUE, P } from './particles';
import type { CrackStyle } from './material-style-core';
import type { Particle, ParticleShape } from './particles-types';

/** sun · 烈日：径向爆发 + 火焰粒子 + 热浪扩散 + 日冕喷发 */
function sun(): CrackStyle {
  const H = MATERIAL_HUE.sun; // 40 (金黄色)
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: 0,
      dy: -t * 80,
      scale: 1 + t * 3.5,
      rot: t * Math.PI * 2,
      alpha: 1 - t * 0.6
    }),
    emit: (cx, cy, _vel) => {
      const particles: Particle[] = [];

      // 1. 径向光线爆发（12根）
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const speed = 8 + Math.random() * 6;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.02 + Math.random() * 0.01,
          size: 6 + Math.random() * 4,
          hue: H + (Math.random() - 0.5) * 20,
          gravity: 0,
          shape: 1 as ParticleShape,
          angle: angle,
        });
      }

      // 2. 火焰粒子螺旋上升
      particles.push(
        ...P.spiral(cx, cy, 20, 3, 140, {
          hue: [H - 15, H + 20],
          gravity: -0.03
        })
      );

      // 3. 热浪环形扩散（多层）
      particles.push(
        ...P.shockRing(cx, cy, 18, 50, 100, {
          hue: [H - 10, H + 10],
          gravity: 0
        })
      );
      particles.push(
        ...P.shockRing(cx, cy, 16, 80, 140, {
          hue: [H - 15, H + 15],
          gravity: 0
        })
      );

      // 4. 日冕喷发（上下方向）
      particles.push(
        ...P.pillar(cx, cy, 14, 160, {
          hue: [H - 5, H + 25]
        })
      );

      // 5. 耀斑爆发
      particles.push(
        ...P.flare(cx, cy, 16, 100, {
          hue: [H - 20, H + 20]
        })
      );

      return particles;
    },
  };
}

/** blackhole · 吞噬黑洞：向心螺旋吸入 + 事件视界扭曲 + 喷流 */
function blackhole(): CrackStyle {
  const H = MATERIAL_HUE.blackhole; // 280 (深紫色)
  return {
    hue: H,
    sprite: (t, _vel) => ({
      dx: 0,
      dy: 0,
      scale: 1 + t * 2.8,
      rot: -t * Math.PI * 6, // 逆时针旋转
      alpha: 1 - t * 0.8
    }),
    emit: (cx, cy, _vel) => {
      const particles: Particle[] = [];

      // 1. 向心螺旋吸入（负turns = 向内）
      particles.push(
        ...P.spiral(cx, cy, 24, -4, 150, {
          hue: [H - 20, H + 20],
          gravity: 0
        })
      );
      particles.push(
        ...P.spiral(cx, cy, 20, -3, 120, {
          hue: [H - 15, H + 15],
          gravity: 0
        })
      );

      // 2. 事件视界环（紫色光环）
      particles.push(
        ...P.shockRing(cx, cy, 18, 60, 90, {
          hue: [H - 10, H + 10],
          gravity: 0
        })
      );

      // 3. 霍金辐射（外围散发）
      particles.push(
        ...P.burst(cx, cy, 16, 2, 6, {
          hue: [H - 15, H + 15],
          shape: 0,
          gravity: 0
        })
      );

      // 4. 相对论性喷流（上下双向）
      particles.push(
        ...P.pillar(cx, cy - 40, 12, 120, {
          hue: [H - 10, H + 10]
        })
      );
      particles.push(
        ...P.pillar(cx, cy + 40, 12, -120, {
          hue: [H - 10, H + 10]
        })
      );

      // 5. 吸积盘粒子（橙黄色）
      particles.push(
        ...P.burst(cx, cy, 14, 4, 8, {
          hue: [30, 50],
          shape: 0,
          gravity: 0
        })
      );

      return particles;
    },
  };
}

export const COSMIC_STYLES = { sun, blackhole };
