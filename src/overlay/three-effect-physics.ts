import type { PhysicalProfile } from './three-effect-profiles';
import type {
  MaterialForce,
  MaterialPhysicalBlueprint,
  MaterialSurface,
} from './material-identity';

export type MaterialPhysics = {
  energy: number;
  count: number;
  spread: number;
  travel: number;
  lift: number;
  spin: number;
  gravity: number;
  drag: number;
  turbulence: number;
  /** Deterministic per-pack fingerprint; keeps same preset materials distinct. */
  signature: number;
  phase: number;
  scale: number;
  surface: MaterialSurface;
  force: MaterialForce;
  mass: number;
  restitution: number;
  friction: number;
  stiffness: number;
  resonance: number;
  impulse: number;
  identityPhase: number;
};

export { pixelRatioFor } from './canvas-pixel-budget';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function strongest(params: Record<string, number>, names: string[], fallback: number): number {
  let result = fallback;
  for (const name of names) {
    const value = params[name];
    if (Number.isFinite(value)) result = Math.max(result, value);
  }
  return result;
}

function fingerprint(params: Record<string, number>): number {
  // Stable across runs: pack params, rather than Math.random(), define the
  // identity of an effect. This makes two materials sharing a preset diverge.
  let hash = 2166136261;
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (!Number.isFinite(value)) continue;
    const token = `${key}:${value.toFixed(4)};`;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0) / 4294967295;
}

function compatibilityBlueprint(profile: PhysicalProfile): MaterialPhysicalBlueprint {
  const fluid = ['splash', 'wave', 'rain', 'downpour'].includes(profile.motion);
  const airborne = ['thrust', 'wing', 'vortex', 'tornado'].includes(profile.motion);
  const surface: MaterialSurface = fluid ? 'water' : airborne ? 'air' : 'metal';
  const force: MaterialForce = fluid ? 'fluid' : airborne ? 'vortex' : 'elastic';
  return {
    surface, force, mass: 1, restitution: fluid || airborne ? 0 : 0.42,
    friction: fluid || airborne ? 0.02 : 0.34, drag: profile.drag,
    gravity: profile.gravity, resonance: 1, stiffness: 1, phase: 0,
  };
}

/** Converts semantic pack controls into bounded solver values. */
export function resolveMaterialPhysics(
  profile: PhysicalProfile,
  params: Record<string, number>,
  rawSpeed: number,
  blueprint: MaterialPhysicalBlueprint = compatibilityBlueprint(profile),
): MaterialPhysics {
  const values = Object.values(params).filter(Number.isFinite);
  const detail = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
  const signature = fingerprint(params);
  const scale = clamp(0.88 + signature * 0.28 + Math.min(values.length, 8) * 0.012, 0.88, 1.28);
  const intensity = strongest(params, ['blast', 'intensity', 'impact', 'punch', 'radiance', 'heat', 'block'], detail);
  const spread = strongest(params, ['spread', 'burstSpread', 'debris', 'droplets', 'shards', 'scatter', 'branches'], detail);
  const travel = strongest(params, ['thrust', 'speed', 'dashLength', 'trailLength', 'arcLength', 'projection', 'flow'], detail);
  const lift = strongest(params, ['climb', 'riseSpeed', 'splashHeight', 'suction', 'gust', 'grace'], detail);
  const spin = strongest(params, ['spin', 'spirals', 'orbits', 'twinkle', 'turbulence', 'undulation', 'wingFlap'], detail);
  const weight = strongest(params, ['weight', 'chop', 'bass', 'pierce', 'shockwave'], 1);
  const speed = clamp(rawSpeed / 3.2, 0.35, 2.8);
  const mass = clamp(blueprint.mass, 0.08, 8);
  const impulse = clamp((0.46 + speed * 0.92) / Math.sqrt(mass), 0.32, 4.8);
  const energy = clamp(profile.energy * scale * (0.76 + impulse * 0.24) * (0.82 + intensity * 0.12), 0.72, 2.35);
  const identityPhase = ((blueprint.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  return {
    energy,
    count: Math.round(clamp(70 * energy * (0.78 + detail * 0.16), 48, 160)),
    spread: profile.spread * scale * clamp(0.72 + spread * 0.22, 0.8, 1.55),
    travel: profile.travel * scale * clamp(0.72 + travel * 0.2, 0.8, 1.55),
    lift: profile.lift * scale * clamp(0.76 + lift * 0.18, 0.82, 1.5),
    spin: profile.spin * (0.9 + signature * 0.3) * clamp(0.72 + spin * 0.2, 0.82, 1.55),
    gravity: (profile.gravity * .76 + blueprint.gravity * .24) * clamp(0.82 + weight * 0.16, 0.9, 1.48),
    drag: clamp(Math.min(profile.drag, blueprint.drag) - Math.max(0, weight - 1) * 0.0015, 0.95, 0.999),
    turbulence: clamp(0.72 + spin * 0.22 + detail * 0.08, 0.8, 1.8),
    signature,
    phase: (identityPhase + signature * Math.PI * 2) % (Math.PI * 2),
    scale,
    surface: blueprint.surface,
    force: blueprint.force,
    mass,
    restitution: clamp(blueprint.restitution, 0, 1),
    friction: clamp(blueprint.friction, 0, 1),
    stiffness: clamp(blueprint.stiffness, 0.1, 4),
    resonance: clamp(blueprint.resonance, 0.1, 3),
    impulse,
    identityPhase,
  };
}
