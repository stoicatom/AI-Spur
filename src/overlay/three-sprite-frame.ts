import type * as THREE from 'three';
import type { EffectPreset, SpriteFrame } from './effects-core';
import type { WhipVel } from './particles';
import { scaleMaterialSpriteFrame } from './material-animation-constants';
import {
  updateImageHeroLayers,
  type ImageHeroLayers,
} from './three-image-hero';
import type { MaterialPhysics } from './three-effect-physics';

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

/** Apply the shared preset frame to both the source sprite and its Hero stack. */
export function updateThreeImageSpriteFrame(
  sprite: THREE.Mesh,
  hero: ImageHeroLayers | null,
  effect: EffectPreset,
  progress: number,
  vel: WhipVel,
  params: Record<string, number>,
  now: number,
  physics: MaterialPhysics,
  origin: THREE.Vector3,
  direction: THREE.Vector2,
): void {
  const frame = scaleMaterialSpriteFrame(effect.sprite(progress, vel, params));
  placeThreeSpriteFrame(sprite, frame, origin);
  if (hero) updateImageHeroLayers(hero, frame, progress, now, physics, origin, direction);
}
