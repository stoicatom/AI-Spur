import * as THREE from 'three';
import type { PhysicalProfile } from './three-effect-profiles';
import type { MaterialPhysics } from './three-effect-physics';
import type { ParticleState } from './three-particle-motion';

const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
const spinAxis = new THREE.Vector3(0.3, 0.8, 0.5).normalize();

/** Upload the current fixed-step particle state into the instanced GPU mesh. */
export function updateParticleMatrices(
  particles: THREE.InstancedMesh,
  states: readonly ParticleState[],
  profile: PhysicalProfile,
  physics: MaterialPhysics,
  now: number,
): void {
  for (let index = 0; index < states.length; index++) {
    const state = states[index];
    const fade = Math.max(0, Math.min(1, state.life));
    if (['downpour', 'rain', 'projectile', 'whip'].includes(profile.motion)) {
      quaternion.setFromAxisAngle(zAxis, Math.atan2(state.vy, state.vx));
    } else {
      quaternion.setFromAxisAngle(spinAxis, state.spin * (1 - fade) + now * 0.001 * physics.spin);
    }
    matrix.compose(
      position.set(state.x, state.y, state.z),
      quaternion,
      scale.set(
        state.size * fade * state.stretchX,
        state.size * fade * state.stretchY,
        state.size * fade * state.stretchZ,
      ),
    );
    particles.setMatrixAt(index, matrix);
  }
  particles.instanceMatrix.needsUpdate = true;
}
