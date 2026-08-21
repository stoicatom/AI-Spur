import { burst, notes, pillar } from './particles-emitters-burst';
import { beam, flare, glyph, ringWave, spark } from './particles-emitters-extended';
import { arcSweep, parabola, shockRing, spiral } from './particles-emitters-motion';
import type { ParticleFactory } from './particles-types';

export { IMPACT, MATERIAL_HUE } from './particles-config';
export { drawImpact } from './particles-impact';
export { DEFAULT_VEL, toWhipVel } from './particles-types';
export type { Particle, ParticleFactory, WhipVel } from './particles-types';

/** 粒子发射原语库。保留单一入口，避免调用方感知内部模块拆分。 */
export const P: ParticleFactory = {
  arcSweep,
  parabola,
  shockRing,
  spiral,
  pillar,
  shards(cx, cy, count, speedLo, speedHi, o = {}) {
    return P.burst(cx, cy, count, speedLo, speedHi, {
      ...o,
      shape: o.shape ?? 2,
    });
  },
  burst,
  notes,
  ringWave,
  spark,
  beam,
  flare,
  glyph,
};
