import {
  electricEnvelope,
  generateElectricDischarge,
  prefersReducedElectricMotion,
  resolveElectricDischargeConfig,
  type ElectricDischarge,
  type ElectricDischargeKind,
  type ElectricEnvelope,
  type ElectricPoint,
} from './electric-discharge';

const TAU = Math.PI * 2;

export type CanvasElectricContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke'
  | 'ellipse' | 'fill' | 'fillRect' | 'createRadialGradient'
> & {
  globalAlpha: number;
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
};

export type CanvasElectricStats = Readonly<{
  segmentVisits: number;
  strokes: number;
  gradients: number;
  rings: number;
}>;

type CanvasPoint = Readonly<{ x: number; y: number }>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

function numberParam(params: Record<string, number>, name: string, fallback: number): number {
  const value = params[name];
  return Number.isFinite(value) ? value : fallback;
}

function channelLength(height: number, strikeY: number): number {
  const desired = clamp(height * 0.46, 220, 460);
  return Math.min(desired, Math.max(150, strikeY + height * 0.1));
}

function canvasPoint(point: ElectricPoint, strikeX: number, strikeY: number, length: number): CanvasPoint {
  return {
    x: strikeX + point.x * length,
    y: strikeY - (1 - point.y) * length,
  };
}

function drawChannelPass(
  ctx: CanvasElectricContext,
  topology: ElectricDischarge,
  strikeX: number,
  strikeY: number,
  length: number,
  reveal: number,
  width: number,
  color: string,
  alpha: number,
  stats: { segmentVisits: number; strokes: number },
): void {
  if (alpha <= 0.002) return;
  for (let depth = 0; depth <= topology.maxDepth; depth++) {
    const depthAlpha = alpha * Math.pow(0.66, depth);
    if (depthAlpha <= 0.002) continue;
    let hasPath = false;
    ctx.beginPath();
    for (const segment of topology.segments) {
      if (segment.depth !== depth || segment.reveal > reveal) continue;
      const from = canvasPoint(segment.from, strikeX, strikeY, length);
      const to = canvasPoint(segment.to, strikeX, strikeY, length);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      stats.segmentVisits++;
      hasPath = true;
    }
    if (!hasPath) continue;
    ctx.globalAlpha = depthAlpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.45, width * Math.pow(0.57, depth));
    ctx.stroke();
    stats.strokes++;
  }
}

function drawRadialExposure(
  ctx: CanvasElectricContext,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  alpha: number,
  inner: string,
  outer: string,
  stats: { gradients: number },
): void {
  if (alpha <= 0.002) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(radiusX, radiusY));
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.22, inner);
  gradient.addColorStop(1, outer);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
  ctx.fill();
  stats.gradients++;
}

function drawCloudScatter(
  ctx: CanvasElectricContext,
  x: number,
  y: number,
  length: number,
  envelope: ElectricEnvelope,
  stats: { gradients: number },
): void {
  const alpha = envelope.cloud;
  drawRadialExposure(
    ctx, x, y, length * 0.48, length * 0.15, alpha * 0.22,
    'rgba(225, 240, 255, .92)', 'rgba(69, 103, 139, 0)', stats,
  );
  drawRadialExposure(
    ctx, x - length * 0.22, y + length * 0.025, length * 0.31, length * 0.11,
    alpha * 0.12, 'rgba(202, 225, 248, .72)', 'rgba(56, 76, 104, 0)', stats,
  );
  drawRadialExposure(
    ctx, x + length * 0.24, y - length * 0.018, length * 0.34, length * 0.12,
    alpha * 0.14, 'rgba(213, 234, 252, .78)', 'rgba(56, 76, 104, 0)', stats,
  );
}

function drawImpactExposure(
  ctx: CanvasElectricContext,
  x: number,
  y: number,
  length: number,
  envelope: ElectricEnvelope,
  stats: { gradients: number; rings: number },
): void {
  drawRadialExposure(
    ctx, x, y, length * 0.22, length * 0.075, envelope.impact * 0.82,
    'rgba(255, 255, 255, .98)', 'rgba(96, 163, 226, 0)', stats,
  );
  if (envelope.impact <= 0.01) return;
  const radius = length * (0.025 + (1 - envelope.impact) * 0.12);
  ctx.globalAlpha = envelope.impact * 0.5;
  ctx.strokeStyle = 'rgba(220, 241, 255, .9)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.24, 0, 0, TAU);
  ctx.stroke();
  stats.rings++;
}

function drawPressureRings(
  ctx: CanvasElectricContext,
  x: number,
  y: number,
  length: number,
  progress: number,
  envelope: ElectricEnvelope,
  count: number,
  expansion: number,
  stats: { rings: number },
): void {
  for (let index = 0; index < count; index++) {
    const wave = clamp01((progress - 0.15 - index * 0.048) / 0.58);
    const opacity = Math.sin(wave * Math.PI) * envelope.pressure * Math.pow(0.78, index);
    if (opacity <= 0.004) continue;
    const radius = length * (0.07 + wave * (0.42 + expansion * 0.075));
    ctx.globalAlpha = opacity * 0.54;
    ctx.strokeStyle = 'rgba(171, 215, 244, .82)';
    ctx.lineWidth = Math.max(0.7, 2.2 - wave * 1.25);
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.18, 0, 0, TAU);
    ctx.stroke();
    stats.rings++;
  }
}

/**
 * Canvas fallback for a complete electric discharge, including stable leader
 * branches, volumetric-looking multi-pass light, cloud scatter and impact.
 */
export function drawCanvasElectricDischarge(
  ctx: CanvasElectricContext,
  width: number,
  height: number,
  strikeX: number,
  strikeY: number,
  params: Record<string, number>,
  progress: number,
  hue = 204,
  kind: ElectricDischargeKind = 'lightning',
  reducedMotion = prefersReducedElectricMotion(),
): CanvasElectricStats {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const x = clamp(strikeX, -safeWidth * 0.1, safeWidth * 1.1);
  const y = clamp(strikeY, 0, safeHeight);
  const t = clamp01(progress);
  const config = resolveElectricDischargeConfig(kind, params, reducedMotion);
  const topology = generateElectricDischarge(config);
  const flicker = numberParam(params, 'flicker', kind === 'thunder' ? 1.7 : 1);
  const envelope = electricEnvelope(t, reducedMotion, flicker);
  const length = channelLength(safeHeight, y);
  const cloud = canvasPoint({ x: 0, y: 0 }, x, y, length);
  const ionHue = Math.round(206 + Math.sin(hue * Math.PI / 180) * 4);
  const stats = { segmentVisits: 0, strokes: 0, gradients: 0, rings: 0 };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (envelope.impact > 0.04 && !reducedMotion) {
    ctx.globalAlpha = envelope.impact * 0.032;
    ctx.fillStyle = 'rgba(225, 240, 255, 1)';
    ctx.fillRect(0, 0, safeWidth, safeHeight);
  }
  drawCloudScatter(ctx, cloud.x, cloud.y, length, envelope, stats);

  const leaderAlpha = Math.max(envelope.preflash * 0.2, envelope.leaderProgress < 1 ? 0.13 : 0);
  drawChannelPass(
    ctx, topology, x, y, length, envelope.leaderProgress,
    reducedMotion ? 1 : 1.25, `hsl(${ionHue}, 70%, 72%)`, leaderAlpha, stats,
  );
  drawChannelPass(
    ctx, topology, x, y, length, 1,
    reducedMotion ? 5.5 : 8.5, `hsl(${ionHue}, 90%, 63%)`, envelope.glow * 0.28, stats,
  );
  drawChannelPass(
    ctx, topology, x, y, length, 1,
    reducedMotion ? 2.2 : 2.8, 'rgba(236, 248, 255, 1)', envelope.core * 0.9, stats,
  );
  drawChannelPass(
    ctx, topology, x, y, length, 1,
    0.82, 'rgba(255, 255, 255, 1)', envelope.core, stats,
  );

  drawImpactExposure(ctx, x, y, length, envelope, stats);
  if (kind === 'thunder') {
    const rings = Math.round(clamp(numberParam(params, 'rings', 3), 2, reducedMotion ? 3 : 5));
    const expansion = clamp(numberParam(params, 'expansion', 1), 0.5, 3);
    drawPressureRings(ctx, x, y, length, t, envelope, rings, expansion, stats);
  }
  ctx.restore();
  return Object.freeze(stats);
}
