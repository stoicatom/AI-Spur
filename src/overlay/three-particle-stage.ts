import * as THREE from 'three';
import type { WhipVel } from './particles';
import { geometry, type PhysicalProfile } from './three-effect-profiles';
import type { MaterialPhysics } from './three-effect-physics';
import { seedParticleStates, type ParticleState } from './three-particle-motion';
import { domainForProfile, materialForDomain } from './three-material-domains';

export type ParticleStage = {
  particles: THREE.InstancedMesh;
  states: ParticleState[];
};

/** Create one preset's particle stage and deterministic physical state. */
export function createParticleStage(
  root: THREE.Group,
  profile: PhysicalProfile,
  physics: MaterialPhysics,
  origin: THREE.Vector3,
  direction: THREE.Vector2,
  vel: WhipVel,
  width: number,
  height: number,
  color: THREE.Color,
): ParticleStage {
  const material = materialForDomain(color, physics.energy, domainForProfile(profile));
  material.opacity = 0.92;
  const particles = new THREE.InstancedMesh(
    geometry(profile.particle, 3.4 + physics.energy * 2.2),
    material,
    physics.count,
  );
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(particles);
  const states = seedParticleStates(
    physics.count,
    origin,
    direction,
    profile,
    physics,
    vel,
    width,
    height,
  );
  return { particles, states };
}
