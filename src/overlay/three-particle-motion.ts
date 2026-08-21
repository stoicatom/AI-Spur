import type * as THREE from 'three';
import type { WhipVel } from './particles';
import type { MaterialPhysics } from './three-effect-physics';
import type { PhysicalProfile } from './three-effect-profiles';

const DT = 1 / 60;

export type ParticleState = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; size: number; spin: number;
  age: number; phase: number; decay: number; stage: number;
  stretchX: number; stretchY: number; stretchZ: number;
  /** Unconsumed wall time; simulation itself always advances at 60 Hz. */
  stepRemainder: number;
};

const frac = (value: number): number => value - Math.floor(value);
const hash = (index: number, salt: number): number => frac(Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453);

function makeState(index: number): ParticleState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1,
    size: 1, spin: 1, age: 0, phase: index * 0.37, decay: 0.012,
    stage: 0, stretchX: 1, stretchY: 1, stretchZ: 1, stepRemainder: 0,
  };
}

/** Family-specific birth distributions. Allocation is limited to effect start. */
export function seedParticleStates(
  count: number, origin: THREE.Vector3, direction: THREE.Vector2,
  profile: PhysicalProfile, physics: MaterialPhysics, velocity: WhipVel,
  width: number, height: number,
): ParticleState[] {
  const states: ParticleState[] = [];
  const perpendicularX = -direction.y;
  const perpendicularY = direction.x;
  for (let i = 0; i < count; i++) {
    const state = makeState(i);
    const unit = count > 1 ? i / (count - 1) : 0.5;
    const angle = unit * Math.PI * 2 + (i % 7) * 0.17 + physics.phase;
    const radial = 8 + (i % 13) * 3.2;
    const jitter = hash(i, 3);
    state.size = (0.55 + (i % 6) * 0.2) * physics.scale;
    state.spin = (i % 2 ? 1 : -1) * (0.4 + i % 7 * 0.16);
    state.z = (i % 11) * 2.8;
    state.decay = profile.motion === 'downpour' ? 0.006 : profile.motion === 'fireworks' ? 0.007 : 0.011 + (i % 5) * 0.001;
    switch (profile.motion) {
      case 'tornado': {
        const funnel = 24 + unit * 112;
        state.x = origin.x + Math.cos(angle) * funnel * physics.scale;
        state.y = origin.y - 70 + unit * 145;
        state.vx = -Math.sin(angle) * (1.4 + unit * 2.5) * physics.scale - Math.cos(angle) * 0.08;
        state.vy = 1.8 + unit * 1.5;
        state.stretchX = 0.45; state.stretchY = 1.5; state.stretchZ = 0.55;
        break;
      }
      case 'downpour':
        state.x = -width / 2 + frac(i * (0.618 + physics.signature * 0.08)) * width;
        state.y = height / 2 + hash(i, 8) * height;
        state.vx = (physics.signature - 0.5) * 0.8 + (jitter - 0.5) * 0.35;
        state.vy = -7.5 - jitter * 4.2;
        state.stretchX = 0.18; state.stretchY = 4.8; state.stretchZ = 0.35;
        break;
      case 'wildfire': {
        const cluster = i % 7;
        state.x = origin.x + (cluster - 3) * 22 * physics.scale + (jitter - 0.5) * 24;
        state.y = origin.y - 18 + hash(i, 5) * 18;
        state.vx = (jitter - 0.5) * 1.1;
        state.vy = 1.2 + hash(i, 7) * 2.5;
        state.stretchX = 0.7; state.stretchY = 1.6; state.stretchZ = 0.7;
        break;
      }
      case 'projectile':
        state.x = origin.x - direction.x * (8 + i % 5 * 5) + perpendicularX * (jitter - 0.5) * 7;
        state.y = origin.y - direction.y * (8 + i % 5 * 5) + perpendicularY * (jitter - 0.5) * 7;
        state.vx = direction.x * (8 + velocity.speed * 0.45 + i % 4);
        state.vy = direction.y * (8 + velocity.speed * 0.45 + i % 4);
        state.stretchX = 2.8; state.stretchY = 0.42; state.stretchZ = 0.42;
        break;
      case 'fracture':
        state.x = origin.x + Math.cos(angle) * radial * 0.35;
        state.y = origin.y + Math.sin(angle) * radial * 0.35;
        state.vx = Math.cos(angle) * (2.4 + jitter * 4.4);
        state.vy = Math.sin(angle) * (2.4 + jitter * 4.4);
        state.stretchX = 0.65; state.stretchY = 0.65; state.stretchZ = 1.5;
        break;
      case 'boxing':
        state.x = origin.x - direction.x * (34 + i % 5 * 7) + perpendicularX * (jitter - 0.5) * 34;
        state.y = origin.y - direction.y * (34 + i % 5 * 7) + perpendicularY * (jitter - 0.5) * 34;
        state.vx = direction.x * (2.8 + jitter * 2.5);
        state.vy = direction.y * (2.8 + jitter * 2.5);
        state.stretchX = 1.5; state.stretchY = 0.8; state.stretchZ = 0.8;
        break;
      case 'whip': {
        const u = unit;
        state.x = origin.x + direction.x * u * 150 + perpendicularX * Math.sin(u * Math.PI) * 12;
        state.y = origin.y + direction.y * u * 150 + perpendicularY * Math.sin(u * Math.PI) * 12;
        state.vx = direction.x * (2.1 + u * 4.5);
        state.vy = direction.y * (2.1 + u * 4.5);
        state.phase += u * 5; state.stretchX = 1.7; state.stretchY = 0.32; state.stretchZ = 0.32;
        break;
      }
      case 'melody':
        state.x = origin.x - 150 * physics.scale + unit * 300 * physics.scale;
        state.y = origin.y + Math.sin(unit * Math.PI * 4) * 34;
        state.vx = 0.6 + unit * 1.1; state.vy = 0.3 + jitter * 0.6;
        state.stretchX = 0.9; state.stretchY = 0.9; state.stretchZ = 0.9;
        break;
      case 'groove': {
        const orbit = (34 + (i % 8) * 8) * physics.scale;
        state.x = origin.x + Math.cos(angle) * orbit;
        state.y = origin.y + Math.sin(angle) * orbit;
        state.vx = -Math.sin(angle) * 1.4; state.vy = Math.cos(angle) * 1.4;
        state.stretchX = 0.45; state.stretchY = 0.45; state.stretchZ = 0.18;
        break;
      }
      case 'fireworks':
        state.x = origin.x; state.y = origin.y;
        state.vx = direction.x * (2.2 + jitter * 1.8); state.vy = direction.y * (2.2 + jitter * 1.8) + 3.8;
        state.stage = 0; state.stretchX = 0.65; state.stretchY = 1.8; state.stretchZ = 0.65;
        break;
      case 'singularity': {
        const orbit = (110 + (i % 9) * 16) * physics.scale;
        state.x = origin.x + Math.cos(angle) * orbit;
        state.y = origin.y + Math.sin(angle) * orbit;
        state.vx = -Math.sin(angle) * 1.2; state.vy = Math.cos(angle) * 1.2;
        state.stretchX = 0.6; state.stretchY = 0.6; state.stretchZ = 0.6;
        break;
      }
      case 'drum':
        state.x = origin.x + Math.cos(angle) * radial * 1.4;
        state.y = origin.y + Math.sin(angle) * radial * 1.4;
        state.vx = Math.cos(angle) * 0.2; state.vy = Math.sin(angle) * 0.2;
        state.stretchX = 0.45; state.stretchY = 0.45; state.stretchZ = 0.2;
        break;
      default:
        state.x = origin.x + Math.cos(angle) * (profile.motion === 'orbit' || profile.motion === 'vortex' ? radial : 0);
        state.y = origin.y + Math.sin(angle) * (profile.motion === 'orbit' || profile.motion === 'vortex' ? radial : 0);
        state.vx = direction.x * (1.8 + velocity.speed * 0.1) + Math.cos(angle) * radial * physics.spread * 0.34;
        state.vy = direction.y * (1.8 + velocity.speed * 0.1) + Math.sin(angle) * radial * physics.spread * 0.34 + physics.lift;
        break;
    }
    states.push(state);
  }
  return states;
}

/** Advance exactly one reference step with no temporary allocation. */
function integrateParticleStep(
  state: ParticleState, index: number, origin: THREE.Vector3, direction: THREE.Vector2,
  profile: PhysicalProfile, physics: MaterialPhysics,
): void {
  const oldVx = state.vx; const oldVy = state.vy; const oldVz = state.vz;
  const noise = Math.sin(state.phase + state.age * 31 + index * 2.17);
  const rx = state.x - origin.x;
  const ry = state.y - origin.y;
  const radius = Math.max(8, Math.hypot(rx, ry));
  const perpendicularX = -direction.y;
  const perpendicularY = direction.x;
  state.vy += physics.gravity;
  switch (profile.motion) {
    case 'thrust': state.vx += direction.x * 0.075 * physics.travel; state.vy += direction.y * 0.075 * physics.travel + 0.035 * physics.lift; break;
    case 'wing': { const wing = index % 2 === 0 ? 1 : -1; state.vx += perpendicularX * wing * 0.055 * physics.spread; state.vy += perpendicularY * wing * 0.055 * physics.spread + 0.03 * physics.lift; break; }
    case 'electric': state.vx += perpendicularX * noise * 0.42 * physics.turbulence; state.vy += perpendicularY * noise * 0.42 * physics.turbulence; state.vz += Math.cos(state.phase + state.age * 43) * 0.12; break;
    case 'wave': { const wave = Math.sin(state.phase + state.age * 16) * 0.16 * physics.turbulence; state.vx += perpendicularX * wave; state.vy += perpendicularY * wave; break; }
    case 'orbit': state.vx += (-ry / radius) * 0.2 * physics.spin - rx * 0.0028; state.vy += (rx / radius) * 0.2 * physics.spin - ry * 0.0028; break;
    case 'flame': case 'wildfire': state.vx += noise * 0.12 * physics.turbulence; state.vy += 0.05 * physics.lift; break;
    case 'pulse': state.vx += (rx / radius) * 0.025 * physics.energy; state.vy += (ry / radius) * 0.025 * physics.energy; break;
    case 'vortex': state.vx += (-ry / radius) * 0.16 * physics.spin - rx * 0.0015; state.vy += (rx / radius) * 0.16 * physics.spin - ry * 0.0015 + 0.018 * physics.lift; break;
    case 'petal': state.vx += perpendicularX * noise * 0.06; state.vy += perpendicularY * noise * 0.06; break;
    case 'rain': state.vx += direction.x * 0.018; state.vy -= 0.045 * physics.travel; break;
    case 'downpour': state.vx += noise * 0.003 * physics.turbulence; state.vy -= 0.045 * physics.travel; break;
    case 'tornado': { const pull = Math.min(0.28, radius * 0.0018); state.vx += (-ry / radius) * 0.3 * physics.spin - rx / radius * pull; state.vy += (rx / radius) * 0.3 * physics.spin + 0.08 * physics.lift; break; }
    case 'projectile': state.vx += direction.x * 0.16 * physics.travel; state.vy += direction.y * 0.16 * physics.travel; break;
    case 'fracture': state.vz += noise * 0.14; break;
    case 'boxing': if (state.age > 0.28) { state.vx -= direction.x * 0.18; state.vy -= direction.y * 0.18; } break;
    case 'whip': { const wave = Math.sin(state.phase + state.age * 28) * 0.16; state.vx += perpendicularX * wave; state.vy += perpendicularY * wave; break; }
    case 'melody': state.vy += Math.sin(state.phase + state.age * 18) * 0.08 + 0.025 * physics.lift; break;
    case 'groove': state.vx += (-ry / radius) * 0.18 * physics.spin - rx * 0.001; state.vy += (rx / radius) * 0.18 * physics.spin - ry * 0.001; break;
    case 'fireworks':
      if (state.stage === 0 && state.age >= 0.42) { state.stage = 1; state.vx = Math.cos(state.phase) * (3.4 + physics.spread); state.vy = Math.sin(state.phase) * (3.4 + physics.spread); state.vz = Math.sin(state.phase * 2) * 0.8; }
      else if (state.stage === 0) { state.vx += direction.x * 0.04; state.vy += direction.y * 0.04 + 0.035 * physics.lift; }
      break;
    case 'singularity': state.vx += -rx / radius * 0.34 * physics.energy + (-ry / radius) * 0.2 * physics.spin; state.vy += -ry / radius * 0.34 * physics.energy + (rx / radius) * 0.2 * physics.spin; break;
    case 'drum': { const pulse = Math.sin(state.age * 34 - radius * 0.08) * 0.05 * physics.energy; state.vx += rx / radius * pulse; state.vy += ry / radius * pulse; break; }
    case 'arc': { const bend = Math.max(0, 1 - state.age * 1.2) * 0.11 * physics.travel; state.vx += perpendicularX * bend; state.vy += perpendicularY * bend; break; }
    case 'split': { const side = index % 2 === 0 ? 1 : -1; state.vx += perpendicularX * side * 0.045 * physics.spread; state.vy += perpendicularY * side * 0.045 * physics.spread; break; }
    case 'impact': case 'slash': case 'shards': case 'radial': case 'splash': case 'ballistic': break;
  }
  const damping = physics.drag;
  state.vx *= damping; state.vy *= damping; state.vz *= damping;
  state.x += (oldVx + state.vx) * 0.5;
  state.y += (oldVy + state.vy) * 0.5;
  state.z += (oldVz + state.vz) * 0.5;
  state.age += DT; state.life -= state.decay;
}

/**
 * Consume elapsed wall time in fixed 60 Hz quanta.  This makes the result
 * independent of the caller's render cadence while retaining a small
 * remainder for a later frame instead of distorting force and drag.
 */
export function stepParticle(
  state: ParticleState, index: number, origin: THREE.Vector3, direction: THREE.Vector2,
  profile: PhysicalProfile, physics: MaterialPhysics, dt = DT,
): void {
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : DT;
  const total = state.stepRemainder + elapsed;
  const steps = Math.floor((total + Number.EPSILON) / DT);
  state.stepRemainder = Math.max(0, total - steps * DT);
  for (let step = 0; step < steps; step++) {
    integrateParticleStep(state, index, origin, direction, profile, physics);
  }
}
