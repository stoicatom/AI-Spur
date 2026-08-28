import type { SpriteFrame } from './effects-core';
import { drawCanvasMaterialHero } from './canvas-material-hero';

/** Draw one preset frame through the image-derived Canvas Hero stack. */
export function drawImageMaterialFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: SpriteFrame,
  x: number,
  y: number,
  fitWidth: number,
  fitHeight: number,
  hue: number,
  energy: number,
  now: number,
): void {
  drawCanvasMaterialHero(
    ctx, image, frame, x, y, fitWidth, fitHeight, hue, energy, now,
  );
}
