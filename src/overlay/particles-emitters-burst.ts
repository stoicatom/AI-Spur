import { PARTICLE_PARAMS, TAU, base, baseShape, hueRange, rand } from './particles-config';
import type { Particle, ParticleOptions } from './particles-types';

/** 竖直光柱/腾升：由下往上，越靠上越散。 */
export function pillar(
  cx: number,
  cy: number,
  count: number,
  height: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  const vxRange = PARTICLE_PARAMS.GEOMETRY.PILLAR_VX_RANGE;
  for (let i = 0; i < count; i++) {
    const fraction = i / count;
    const x = cx + rand(vxRange.min, vxRange.max)
      * fraction * PARTICLE_PARAMS.GEOMETRY.PILLAR_SPREAD;
    const y = cy - fraction * height;
    out.push({
      x, y,
      vx: rand(vxRange.min, vxRange.max) * fraction,
      vy: -PARTICLE_PARAMS.SPEED.PILLAR_BASE
        - fraction * PARTICLE_PARAMS.SPEED.PILLAR_MULTIPLIER,
      life: 1,
      decay: rand(PARTICLE_PARAMS.DECAY.SHARD.min, PARTICLE_PARAMS.DECAY.SHARD.max),
      size: rand(PARTICLE_PARAMS.SIZE.DEFAULT.min, PARTICLE_PARAMS.SIZE.DEFAULT.max)
        * (PARTICLE_PARAMS.GEOMETRY.PILLAR_SIZE_BASE + fraction),
      hue: rand(...hue),
      gravity: PARTICLE_PARAMS.GRAVITY.PILLAR,
      shape: o.shape ?? 0,
      angle: 0,
    });
  }
  return out;
}

/** 点状爆散：dot 均匀四散。 */
export function burst(
  cx: number,
  cy: number,
  count: number,
  speedLo: number,
  speedHi: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const defaults = base(baseShape(o.shape, 0));
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rand(
      PARTICLE_PARAMS.ANGLE.BURST_JITTER.min,
      PARTICLE_PARAMS.ANGLE.BURST_JITTER.max,
    );
    const speed = rand(speedLo, speedHi);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(...(o.decay ?? defaults.decay)),
      size: rand(...(o.size ?? defaults.size)),
      hue: rand(...hue),
      gravity: o.gravity ?? defaults.gravity,
      shape: o.shape ?? 0,
      angle,
    });
  }
  return out;
}

/** 音符：小方块排成一行弹跳曲线，供乐器素材使用。 */
export function notes(
  cx: number,
  cy: number,
  count: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const fraction = i / count;
    const jitter = PARTICLE_PARAMS.GEOMETRY.NOTES_JITTER;
    const x = cx + fraction * PARTICLE_PARAMS.GEOMETRY.NOTES_WIDTH
      + rand(jitter.min, jitter.max);
    const y = cy - Math.abs(Math.sin(fraction * Math.PI * 2))
      * PARTICLE_PARAMS.GEOMETRY.NOTES_HEIGHT;
    out.push({
      x, y,
      vx: PARTICLE_PARAMS.SPEED.NOTES,
      vy: -Math.cos(fraction * Math.PI * 2) * PARTICLE_PARAMS.SPEED.PILLAR_BASE,
      life: 1,
      decay: rand(PARTICLE_PARAMS.DECAY.NOTES.min, PARTICLE_PARAMS.DECAY.NOTES.max),
      size: rand(PARTICLE_PARAMS.SIZE.NOTES.min, PARTICLE_PARAMS.SIZE.NOTES.max),
      hue: rand(...hue),
      gravity: PARTICLE_PARAMS.GRAVITY.NOTES,
      shape: 2,
      angle: 0,
    });
  }
  return out;
}
