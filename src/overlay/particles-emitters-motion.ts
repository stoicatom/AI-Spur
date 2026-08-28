import {
  PARTICLE_PARAMS,
  TAU,
  base,
  baseShape,
  hueRange,
  rand,
} from './particles-config';
import type { Particle, ParticleOptions } from './particles-types';

/** 弧线残影：沿弧布点，速度沿切线。 */
export function arcSweep(
  cx: number,
  cy: number,
  count: number,
  angA: number,
  angB: number,
  radius: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const defaults = base(baseShape(o.shape, 1));
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const fraction = i / count;
    const angle = angA + (angB - angA) * fraction;
    const distance = radius * fraction * fraction;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    const tangent = angle + Math.PI / 2;
    const speed = rand(
      PARTICLE_PARAMS.SPEED.ARC_SWEEP.min,
      PARTICLE_PARAMS.SPEED.ARC_SWEEP.max,
    );
    out.push({
      x, y,
      vx: Math.cos(tangent) * speed,
      vy: Math.sin(tangent) * speed,
      life: 1,
      decay: rand(...(o.decay ?? defaults.decay)),
      size: rand(...(o.size ?? defaults.size)),
      hue: rand(...hue),
      gravity: o.gravity ?? defaults.gravity,
      shape: o.shape ?? 1,
      angle: tangent,
    });
  }
  return out;
}

/** 抛物线：count 点沿弧线分布（x 展宽 dx，y 拱起 dz）。 */
export function parabola(
  cx: number,
  cy: number,
  count: number,
  dx: number,
  dz: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const defaults = base(baseShape(o.shape, 1));
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const fraction = i / count;
    const x = cx + fraction * dx;
    const y = cy - Math.sin(fraction * Math.PI) * dz;
    const speed = rand(
      PARTICLE_PARAMS.SPEED.PARABOLA.min,
      PARTICLE_PARAMS.SPEED.PARABOLA.max,
    );
    out.push({
      x, y, vx: speed,
      vy: (Math.cos(fraction * Math.PI) - PARTICLE_PARAMS.GEOMETRY.PARABOLA_Y_OFFSET)
        * PARTICLE_PARAMS.GEOMETRY.PARABOLA_Y_MULT,
      life: 1,
      decay: rand(...(o.decay ?? defaults.decay)),
      size: rand(...(o.size ?? defaults.size)),
      hue: rand(...hue),
      gravity: o.gravity ?? PARTICLE_PARAMS.GRAVITY.PARABOLA,
      shape: o.shape ?? 1,
      angle: 0,
    });
  }
  return out;
}

/** 扩散圆环：一圈 streak 垂直半径方向，模拟冲击波。 */
export function shockRing(
  cx: number,
  cy: number,
  count: number,
  radiusLo: number,
  radiusHi: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const radius = rand(radiusLo, radiusHi);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const speed = (o.gravity ?? PARTICLE_PARAMS.GRAVITY.NONE) === PARTICLE_PARAMS.GRAVITY.NONE
      ? rand(PARTICLE_PARAMS.SPEED.SHOCK_RING.min, PARTICLE_PARAMS.SPEED.SHOCK_RING.max)
      : PARTICLE_PARAMS.SPEED.SHOCK_RING_WITH_GRAVITY;
    out.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(PARTICLE_PARAMS.DECAY.SHOCK_RING.min, PARTICLE_PARAMS.DECAY.SHOCK_RING.max),
      size: rand(PARTICLE_PARAMS.SIZE.SHOCK_RING.min, PARTICLE_PARAMS.SIZE.SHOCK_RING.max),
      hue: rand(...hue),
      gravity: o.gravity ?? PARTICLE_PARAMS.GRAVITY.NONE,
      shape: 1,
      angle: angle + Math.PI / 2,
    });
  }
  return out;
}

/** 螺旋：turns 圈从中心旋出。 */
export function spiral(
  cx: number,
  cy: number,
  count: number,
  turns: number,
  radius: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const fraction = i / count;
    const angle = fraction * turns * TAU;
    const distance = radius * fraction;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    const tangent = angle + Math.PI / 2;
    out.push({
      x, y,
      vx: Math.cos(tangent) * PARTICLE_PARAMS.SPEED.SPIRAL,
      vy: Math.sin(tangent) * PARTICLE_PARAMS.SPEED.SPIRAL,
      life: 1,
      decay: rand(PARTICLE_PARAMS.DECAY.SPIRAL.min, PARTICLE_PARAMS.DECAY.SPIRAL.max),
      size: rand(PARTICLE_PARAMS.SIZE.SPIRAL.min, PARTICLE_PARAMS.SIZE.SPIRAL.max),
      hue: rand(...hue),
      gravity: o.gravity ?? PARTICLE_PARAMS.GRAVITY.NONE,
      shape: 1,
      angle: tangent,
    });
  }
  return out;
}
