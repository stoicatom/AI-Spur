import type { SpriteFrame } from './effects-core';
import { scaleMaterialSpriteFrame } from './material-animation-constants';

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
  const sprite = scaleMaterialSpriteFrame(frame);
  const width = fitWidth * sprite.scale;
  const height = fitHeight * sprite.scale;
  ctx.save();
  ctx.globalAlpha = Math.max(0, sprite.alpha);
  ctx.translate(x + sprite.dx, y + sprite.dy);
  if (sprite.rot) ctx.rotate(sprite.rot);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}
