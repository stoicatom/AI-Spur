import type * as THREE from 'three';
import type { SpriteFrame } from './effects-core';

/** Map a Canvas-oriented preset frame into Three's upward-positive coordinate system. */
export function placeThreeSpriteFrame(
  sprite: THREE.Mesh,
  frame: SpriteFrame,
  origin: THREE.Vector3,
): void {
  sprite.position.set(origin.x + frame.dx, origin.y - frame.dy, 40);
  sprite.rotation.z = -frame.rot;
  sprite.scale.setScalar(frame.scale);
  (sprite.material as THREE.MeshBasicMaterial).opacity = frame.alpha;
}
