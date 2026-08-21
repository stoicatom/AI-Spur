import type * as THREE from 'three';
import type { MaterialPhysics } from './three-effect-physics';
import type { PhysicalProfile } from './three-effect-profiles';

const TAU = Math.PI * 2;

/** Places the source icon on a family-specific trajectory without per-frame allocation. */
export function placeFamilySprite(
  sprite: THREE.Mesh, t: number, now: number, profile: PhysicalProfile,
  physics: MaterialPhysics, origin: THREE.Vector3, direction: THREE.Vector2,
): void {
  const wave = Math.sin(t * TAU);
  const beat = Math.sin(t * TAU * 4);
  const shimmer = Math.sin(now * 0.004 + physics.phase);
  const variant = physics.scale;
  const angle = Math.atan2(direction.y, direction.x);
  let dx = 0; let dy = 0; let scale = 1; let rotation = angle; let z = 40;
  switch (profile.motion) {
    case 'tornado': {
      const orbit = (18 + t * 90) * variant;
      const spin = t * TAU * (2.1 + physics.signature * 1.4);
      dx = Math.cos(spin) * orbit; dy = -88 + t * 176; rotation = spin + Math.PI / 2; scale = 0.76 + t * 0.34; z = 28; break;
    }
    case 'downpour':
      dx = direction.x * t * 210 * variant; dy = 180 - t * 360 * variant; rotation = angle - Math.PI / 2; scale = 0.75 + wave * 0.06; z = 22; break;
    case 'wildfire':
      dx = direction.x * t * 28 * variant + Math.sin(t * TAU * (2.6 + physics.signature)) * 14; dy = -t * 125 * variant + Math.sin(t * TAU * 2) * 9; rotation = angle + wave * 0.22; scale = 0.88 + t * 0.5 * variant + wave * 0.08; z = 42; break;
    case 'projectile':
      dx = direction.x * (t * 290 * variant - 32); dy = direction.y * (t * 290 * variant - 32); rotation = angle; scale = 0.62 + (1 - t) * 0.26; z = 48; break;
    case 'fracture':
      dx = direction.x * t * 28; dy = direction.y * t * 28; rotation = angle + t * TAU * (1.4 + physics.signature * 1.5); scale = 1.15 + Math.min(0.6, t * 0.8) * variant; z = 45; break;
    case 'boxing': {
      const punch = t < 0.34 ? t / 0.34 : 1 - Math.min(1, (t - 0.34) / 0.66);
      dx = direction.x * (punch * 110 * variant - 52); dy = direction.y * (punch * 110 * variant - 52); rotation = angle; scale = 0.78 + punch * 0.42 * variant; z = 52; break;
    }
    case 'whip': {
      const u = Math.min(1, t * (1.12 + physics.signature * 0.34)); const curve = Math.sin(u * Math.PI + physics.phase) * (34 + t * 20) * variant;
      dx = direction.x * u * 180 * variant - direction.y * curve; dy = direction.y * u * 180 * variant + direction.x * curve;
      rotation = angle + Math.sin(t * TAU * 5 + physics.phase) * 0.34; scale = 0.78 + t * 0.4; z = 46; break;
    }
    case 'melody':
      dx = -130 + t * 260 * variant; dy = Math.sin(t * TAU * (2.5 + physics.signature)) * 46 - Math.abs(Math.sin(t * TAU * 6 + physics.phase)) * 24;
      rotation = wave * 0.18; scale = 0.84 + Math.abs(beat) * 0.24 + shimmer * 0.025; z = 44; break;
    case 'groove':
      dx = Math.cos(t * TAU * (1.8 + physics.signature)) * 46 * variant; dy = Math.sin(t * TAU * (1.8 + physics.signature)) * 46 * variant; rotation = t * TAU * (3.1 + physics.signature); scale = 0.9 + beat * 0.08; z = 46; break;
    case 'fireworks': {
      if (t < 0.42) { dx = direction.x * t * 100 * variant; dy = direction.y * t * 100 + t * 120 * variant; rotation = angle; scale = 0.68 + t * 0.25; }
      else { const burst = (t - 0.42) / 0.58; const r = Math.min(130 * variant, burst * 230 * variant); const a = t * TAU * (2.1 + physics.signature * 1.6); dx = Math.cos(a) * r; dy = Math.sin(a) * r; rotation = a; scale = 1.15 - burst * 0.55; }
      z = 52; break;
    }
    case 'singularity': {
      const r = 150 * (1 - t) * variant; const a = t * TAU * (2.2 + physics.signature * 1.8); dx = Math.cos(a) * r; dy = Math.sin(a) * r; rotation = a + Math.PI / 2; scale = 1.18 - t * 0.62; z = 56; break;
    }
    case 'drum':
      dx = direction.x * wave * 12 * variant; dy = direction.y * wave * 12 * variant; rotation = angle; scale = 0.9 + Math.abs(beat) * 0.34 * variant; z = 48; break;
    default: {
      const eased = 1 - Math.pow(1 - t, 3);
      const distance = eased * 150 * physics.travel;
      dx = direction.x * distance * variant; dy = direction.y * distance * variant + wave * physics.lift * 56;
      rotation = angle + wave * 0.2; scale = (1 + eased * 0.45) * (1 + wave * 0.08); z = 40; break;
    }
  }
  sprite.position.set(origin.x + dx, origin.y + dy, z);
  sprite.rotation.z = rotation;
  sprite.scale.setScalar(scale);
  const fade = t < 0.68 ? 1 : Math.max(0, 1 - (t - 0.68) / 0.32);
  (sprite.material as THREE.MeshBasicMaterial).opacity = fade;
}
