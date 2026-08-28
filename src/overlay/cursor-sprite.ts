/**
 * 光标跟随精灵的几何与绘制。
 *
 * 从 image-material.ts 拆出来的原因不只是行数：绘制参数（光晕层的偏移/放大、
 * shadowBlur、呼吸与倾斜）和「脏区域要外扩多少」是同一组数字的两种用法，放在
 * 一起才不会改了一个忘了另一个 —— 漏算就是屏幕上的残影。
 */

/** 精灵最长边的目标像素尺寸。 */
export const CURSOR_MAX_PX = 96;

/** 光晕层的 shadowBlur，向外溢出的像素数。 */
const SHADOW_BLUR = 24;

/** 光晕层相对中心的偏移与放大倍数（drawCursor 里的两个魔数）。 */
const GLOW_OFFSET = 0.58;
const GLOW_SCALE = 1.16;

/** 按最长边缩放到 CURSOR_MAX_PX，保持宽高比。 */
export function fitSize(img: HTMLImageElement, max: number): { w: number; h: number } {
  const imageWidth = img.naturalWidth || max;
  const imageHeight = img.naturalHeight || max;
  const scale = max / Math.max(imageWidth, imageHeight);
  return { w: imageWidth * scale, h: imageHeight * scale };
}

/**
 * drawCursorSprite 在 (x, y) 周围实际落笔的最大半径。
 *
 * 旋转（tilt）会让包围盒超出宽高本身，所以按对角线兜底；再叠加光晕层的
 * 偏移 × 放大，最后加上 shadowBlur 的外溢。
 */
export function cursorDrawRadius(fitW: number, fitH: number): number {
  return Math.hypot(fitW, fitH) * GLOW_OFFSET * GLOW_SCALE + SHADOW_BLUR;
}

/** 居中绘制在 (x, y)：底层一个发光的放大副本，上层是原图。 */
export function drawCursorSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  fitW: number,
  fitH: number,
  hue: number,
): void {
  const time = performance.now() * 0.004;
  const bob = 1 + Math.sin(time * 1.7) * 0.035;
  const tilt = Math.sin(time * 1.15) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(bob, 1 / bob);
  ctx.shadowColor = `hsl(${hue}, 100%, 62%)`;
  ctx.shadowBlur = SHADOW_BLUR;
  ctx.globalAlpha = 0.3;
  ctx.drawImage(
    img,
    -fitW * GLOW_OFFSET,
    -fitH * 0.42,
    fitW * GLOW_SCALE,
    fitH * GLOW_SCALE,
  );
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.drawImage(img, -fitW / 2, -fitH / 2, fitW, fitH);
  ctx.restore();
}
