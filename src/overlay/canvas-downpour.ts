import {
  downpourDropAt,
  downpourLayerCount,
  downpourSplashAt,
  fieldHash,
  resolveDownpourField,
  type DownpourFieldConfig,
  type DownpourLayer,
} from './downpour-field';

const TAU = Math.PI * 2;
const LAYERS: readonly DownpourLayer[] = ['background', 'middle', 'foreground'];
const OPACITY: Record<DownpourLayer, number> = { background: .2, middle: .38, foreground: .62 };
const LIGHTNESS: Record<DownpourLayer, number> = { background: 58, middle: 66, foreground: 74 };

export type CanvasDownpourContext = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'ellipse' | 'fill'
> & {
  globalAlpha: number;
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  lineWidth: number;
  lineCap: CanvasLineCap;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Draw the same three depth sheets used by WebGL when the GPU path is unavailable. */
export function drawCanvasDownpour(
  ctx: CanvasDownpourContext,
  width: number,
  height: number,
  params: Record<string, number>,
  time: number,
  hue = 204,
  fade = 1,
): void {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const config = resolveDownpourField(params);
  const clock = Math.max(0, time);
  ctx.save();
  ctx.lineCap = 'round';

  for (const layer of LAYERS) {
    const count = downpourLayerCount(safeWidth, safeHeight, config, layer);
    ctx.globalAlpha = fade * OPACITY[layer];
    ctx.lineWidth = layer === 'foreground' ? 1.5 : layer === 'middle' ? 1.1 : .75;
    ctx.strokeStyle = `hsl(${hue}, 62%, ${LIGHTNESS[layer]}%)`;
    ctx.beginPath();
    for (let index = 0; index < count; index++) {
      const drop = downpourDropAt(index, count, safeWidth, safeHeight, config, layer, clock);
      const length = drop.length * (layer === 'foreground' ? 1.1 : .82);
      const trailX = drop.vx / Math.max(1, drop.vy) * length;
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - trailX, drop.y - length);
    }
    ctx.stroke();
  }

  drawGroundRain(ctx, safeWidth, safeHeight, config, clock, hue, fade);
  ctx.restore();
}

function drawGroundRain(
  ctx: CanvasDownpourContext,
  width: number,
  height: number,
  config: DownpourFieldConfig,
  time: number,
  hue: number,
  fade: number,
): void {
  const splashCount = Math.round(clamp(width / 42 * config.splashEnergy, 14, 64));
  ctx.strokeStyle = `hsl(${hue}, 58%, 73%)`;
  ctx.lineWidth = 1;
  for (let index = 0; index < splashCount; index++) {
    const splash = downpourSplashAt(index, splashCount, width, height, config, time);
    const phase = (time * .0022 + splash.phase) % 1;
    const scale = .24 + phase * 1.15;
    ctx.globalAlpha = fade * (1 - phase) * .34;
    ctx.beginPath();
    ctx.ellipse(splash.x, splash.y, splash.radius * scale, splash.radius * scale * .16, 0, 0, TAU);
    ctx.stroke();
  }

  const mistCount = Math.round(clamp(width / 170, 6, 16));
  ctx.fillStyle = `hsl(${hue}, 34%, 62%)`;
  for (let index = 0; index < mistCount; index++) {
    const phase = fieldHash(index, 149);
    const rise = (time * .00022 + phase) % 1;
    ctx.globalAlpha = fade * (.025 + (1 - rise) * .035);
    ctx.beginPath();
    ctx.ellipse(
      (index + .5) / mistCount * width + Math.sin(time * .0007 + phase * TAU) * 18,
      height - 10 - rise * 24,
      24 + phase * 30,
      4 + phase * 5,
      0,
      0,
      TAU,
    );
    ctx.fill();
  }
}
