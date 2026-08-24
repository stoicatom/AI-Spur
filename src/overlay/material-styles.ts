/**
 * Canvas 降级渲染的素材专属爆裂风格入口。
 * 各系列配方按语义拆分，入口仅负责稳定的 ID 分派与未知素材兜底。
 */
import { BALLISTIC_STYLES } from './material-style-ballistic';
import { DAILY_STYLES } from './material-style-daily';
import { ELEMENTAL_STYLES } from './material-style-elemental';
import { LIVING_STYLES } from './material-style-living';
import { MELEE_STYLES } from './material-style-melee';
import { NATURAL_STYLES } from './material-style-natural';
import { RANGED_STYLES } from './material-style-ranged';
import { REGALIA_STYLES } from './material-style-regalia';
import { RHYTHM_STYLES } from './material-style-rhythm';
import { SIGNATURE_STYLES } from './material-style-signature';
import { SWORD_STYLES } from './material-style-sword';
import { WONDER_STYLES } from './material-style-wonder';
import { rand, TAU, type CrackStyle, type CrackStyleFactory } from './material-style-core';
import { MATERIAL_HUE, type Particle } from './particles';

export type { CrackStyle } from './material-style-core';

const STYLE_FACTORIES: Record<string, CrackStyleFactory> = {
  ...SIGNATURE_STYLES,
  ...BALLISTIC_STYLES,
  ...ELEMENTAL_STYLES,
  ...REGALIA_STYLES,
  ...SWORD_STYLES,
  ...RANGED_STYLES,
  ...MELEE_STYLES,
  ...NATURAL_STYLES,
  ...RHYTHM_STYLES,
  ...DAILY_STYLES,
  ...WONDER_STYLES,
  ...LIVING_STYLES,
};

function fallbackStyle(id: string): CrackStyle {
  const hue = MATERIAL_HUE[id] ?? 28;
  return {
    hue,
    sprite: (t, _vel) => ({
      dx: t * 200,
      dy: 0,
      scale: 1 + t,
      rot: 0,
      alpha: 1 - t,
    }),
    emit: (cx, cy, _vel) => {
      const particles: Particle[] = [];
      for (let i = 0; i < 30; i++) {
        const angle = rand(0, TAU);
        const speed = rand(2, 7);
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: rand(0.02, 0.035),
          size: rand(2, 5),
          hue: rand(hue - 10, hue + 10),
          gravity: 0.08,
          shape: 0,
          angle: 0,
        });
      }
      return particles;
    },
  };
}

export function crackStyle(id: string): CrackStyle {
  return STYLE_FACTORIES[id]?.() ?? fallbackStyle(id);
}
