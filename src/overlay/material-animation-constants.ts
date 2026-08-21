import type { SpriteFrame } from './effects-core';

/** Shared scale contract for the material identity animation layer. */
export const MATERIAL_ANIMATION_AREA_SCALE = 3;
export const MATERIAL_SOURCE_SPRITE_LINEAR_SCALE = Math.sqrt(MATERIAL_ANIMATION_AREA_SCALE);
export const MATERIAL_ANIMATION_DURATION_SCALE = 1.5;

/** Scale one preset frame without changing its direction, rotation, or opacity. */
export function scaleMaterialSpriteFrame(frame: SpriteFrame): SpriteFrame {
  return {
    dx: frame.dx * MATERIAL_ANIMATION_AREA_SCALE,
    dy: frame.dy * MATERIAL_ANIMATION_AREA_SCALE,
    scale: frame.scale * MATERIAL_SOURCE_SPRITE_LINEAR_SCALE,
    rot: frame.rot,
    alpha: frame.alpha,
  };
}
