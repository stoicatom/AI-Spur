import type { SpriteFrame } from './effects-core';
import {
  MATERIAL_ANIMATION_AREA_SCALE,
  MATERIAL_SOURCE_SPRITE_LINEAR_SCALE,
} from './material-animation-constants';

/** Draw numeric frame values without allocating a transformed SpriteFrame. */
export function drawCanvasMaterialSpriteValues(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  dx: number,
  dy: number,
  scale: number,
  rot: number,
  alpha: number,
  x: number,
  y: number,
  fitWidth: number,
  fitHeight: number,
): void {
  const width = fitWidth * scale * MATERIAL_SOURCE_SPRITE_LINEAR_SCALE;
  const height = fitHeight * scale * MATERIAL_SOURCE_SPRITE_LINEAR_SCALE;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(x + dx * MATERIAL_ANIMATION_AREA_SCALE, y + dy * MATERIAL_ANIMATION_AREA_SCALE);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/** Draw a Canvas-oriented material frame after applying the shared scale contract. */
export function drawCanvasMaterialSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: SpriteFrame,
  x: number,
  y: number,
  fitWidth: number,
  fitHeight: number,
): void {
  drawCanvasMaterialSpriteValues(
    ctx, image, frame.dx, frame.dy, frame.scale, frame.rot, frame.alpha,
    x, y, fitWidth, fitHeight,
  );
}
