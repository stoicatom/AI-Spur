import type {
  ParticleOptions,
  ParticleRange,
  ParticleShape,
} from './particles-types';

/** 52 素材对应的专属主题色相。 */
export const MATERIAL_HUE: Record<string, number> = {
  whip: 28, classic: 205, rocket: 26, lightning: 55, flame: 20,
  star: 45, meteor: 30, skull: 90, crown: 45, sword: 204,
  bow: 33, shield: 215, bomb: 15, hammer: 220, scepter: 285,
  amulet: 270, dagger: 200, boomerang: 25, spear: 200, axe: 210,
  scythe: 280, trident: 205, flail: 20, chakram: 215, halberd: 210,
  slingshot: 25, blowgun: 120, tessen: 30, chain: 220, wind: 175,
  snow: 210, rain: 215, water: 205, tornado: 185, aurora: 140,
  earthquake: 25, volcano: 20, guitar: 35, drum: 25, bell: 40,
  horn: 48, flute: 195, harp: 45, football: 110, tennis: 80,
  boxing: 0, fireworks: 350, crystal: 270, bamboo: 110, lotus: 310,
  dragonfly: 140,
  archery: 350,
};

/** 冲击增强全局参数。 */
export const IMPACT = {
  maxPx: 96,
  ringRadius(speed: number): number {
    return 90 + speed * 70;
  },
  flashAlpha(speed: number): number {
    return Math.min(1, 0.5 + speed * 0.16);
  },
};

export const TAU = Math.PI * 2;

/** 粒子参数常量：统一管理速度、衰减、尺寸等 magic numbers。 */
export const PARTICLE_PARAMS = {
  SPEED: {
    ARC_SWEEP: { min: 5, max: 12 },
    PARABOLA: { min: 1, max: 3 },
    SHOCK_RING: { min: 3, max: 8 },
    SHOCK_RING_WITH_GRAVITY: 3,
    SPIRAL: 2,
    PILLAR_BASE: 2,
    PILLAR_MULTIPLIER: 3,
    NOTES: 3,
  },
  DECAY: {
    DOT: { min: 0.015, max: 0.028 },
    SHARD: { min: 0.02, max: 0.035 },
    SHOCK_RING: { min: 0.012, max: 0.02 },
    SPIRAL: { min: 0.018, max: 0.03 },
    NOTES: { min: 0.015, max: 0.025 },
  },
  SIZE: {
    DEFAULT: { min: 2, max: 5 },
    SHOCK_RING: { min: 3, max: 7 },
    SPIRAL: { min: 2, max: 4 },
    NOTES: { min: 3, max: 6 },
  },
  GRAVITY: {
    DOT: 0.05,
    SHARD: 0.1,
    PARABOLA: 0.05,
    PILLAR: -0.03,
    NOTES: 0.08,
    NONE: 0,
  },
  ANGLE: {
    BURST_JITTER: { min: -0.15, max: 0.15 },
  },
  GEOMETRY: {
    PILLAR_SPREAD: 20,
    PILLAR_SIZE_BASE: 0.6,
    PARABOLA_Y_MULT: 2,
    PARABOLA_Y_OFFSET: 0.3,
    NOTES_WIDTH: 160,
    NOTES_HEIGHT: 40,
    NOTES_JITTER: { min: -4, max: 4 },
    PILLAR_VX_RANGE: { min: -1, max: 1 },
  },
};

export const rand = (lo: number, hi: number): number => (
  lo + Math.random() * (hi - lo)
);

/** 把扩展形状归一到基础形状，以获得原有默认参数。 */
export function baseShape(
  shape: ParticleShape | undefined,
  fallback: 0 | 1 | 2,
): 0 | 1 | 2 {
  if (shape === 0 || shape === 1 || shape === 2) return shape;
  return fallback;
}

type ParticleDefaults = {
  decay: ParticleRange;
  size: ParticleRange;
  gravity: number;
};

export function base(shape: 0 | 1 | 2): ParticleDefaults {
  return shape === 2
    ? {
        decay: [PARTICLE_PARAMS.DECAY.SHARD.min, PARTICLE_PARAMS.DECAY.SHARD.max],
        size: [PARTICLE_PARAMS.SIZE.DEFAULT.min, PARTICLE_PARAMS.SIZE.DEFAULT.max],
        gravity: PARTICLE_PARAMS.GRAVITY.SHARD,
      }
    : {
        decay: [PARTICLE_PARAMS.DECAY.DOT.min, PARTICLE_PARAMS.DECAY.DOT.max],
        size: [PARTICLE_PARAMS.SIZE.DEFAULT.min, PARTICLE_PARAMS.SIZE.DEFAULT.max],
        gravity: PARTICLE_PARAMS.GRAVITY.DOT,
      };
}

export function hueRange(options: ParticleOptions): ParticleRange {
  return options.hue ?? [0, 0];
}
