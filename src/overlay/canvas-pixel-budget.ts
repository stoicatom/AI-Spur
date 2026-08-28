export const CANVAS_PIXEL_BUDGET = 2_400_000;
export const MAX_CANVAS_PIXEL_RATIO = 1.75;

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Selects the sharpest ratio that remains inside the backing-store budget. */
export function pixelRatioFor(
  width: number,
  height: number,
  deviceRatio: number,
  pixelBudget = CANVAS_PIXEL_BUDGET,
): number {
  const safeWidth = positiveOr(width, 1);
  const safeHeight = positiveOr(height, 1);
  const safeDeviceRatio = positiveOr(deviceRatio, 1);
  const safeBudget = positiveOr(pixelBudget, CANVAS_PIXEL_BUDGET);
  const budgetRatio = Math.sqrt(safeBudget / (safeWidth * safeHeight));
  return Math.min(safeDeviceRatio, MAX_CANVAS_PIXEL_RATIO, budgetRatio);
}

/** Resizes a 2D canvas without changing its CSS-space drawing coordinates. */
export function resizeCanvas2D(
  canvas: HTMLCanvasElement,
  context: Pick<CanvasRenderingContext2D, 'setTransform'>,
  cssWidth: number,
  cssHeight: number,
  deviceRatio: number,
): number {
  const width = Math.max(0, Number.isFinite(cssWidth) ? cssWidth : 0);
  const height = Math.max(0, Number.isFinite(cssHeight) ? cssHeight : 0);
  const ratio = pixelRatioFor(width, height, deviceRatio);

  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ratio;
}
