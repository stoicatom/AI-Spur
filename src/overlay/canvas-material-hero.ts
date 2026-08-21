import type { SpriteFrame } from './effects-core';
import { drawCanvasMaterialSpriteValues } from './canvas-material-sprite';

/** Draw the light-weight Canvas equivalent of the GPU Hero depth stack. */
export function drawCanvasMaterialHero(
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
  const length = Math.hypot(frame.dx, frame.dy) || 1;
  const unitX = frame.dx / length;
  const unitY = frame.dy / length;
  const pulse = 1 + Math.sin(now * 0.006) * 0.08;
  const trail = (8 + energy * 5) * pulse;
  const previousComposite = ctx.globalCompositeOperation;
  const previousShadowColor = ctx.shadowColor;
  const previousShadowBlur = ctx.shadowBlur;
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = `hsla(${hue}, 100%, 66%, ${Math.min(0.9, 0.34 + energy * 0.1)})`;
  ctx.shadowBlur = 10 + energy * 7;
  drawCanvasMaterialSpriteValues(
    ctx, image,
    frame.dx - unitX * trail,
    frame.dy - unitY * trail,
    frame.scale * 0.92,
    frame.rot,
    frame.alpha * (0.13 + energy * 0.025),
    x, y, fitWidth, fitHeight,
  );
  drawCanvasMaterialSpriteValues(
    ctx, image,
    frame.dx - unitX * trail * 1.8,
    frame.dy - unitY * trail * 1.8,
    frame.scale * 0.82,
    frame.rot,
    frame.alpha * (0.07 + energy * 0.014),
    x, y, fitWidth, fitHeight,
  );
  drawCanvasMaterialSpriteValues(
    ctx, image, frame.dx, frame.dy, frame.scale, frame.rot, frame.alpha,
    x, y, fitWidth, fitHeight,
  );
  ctx.shadowColor = previousShadowColor;
  ctx.shadowBlur = previousShadowBlur;
  ctx.globalCompositeOperation = previousComposite;
}
