/** Deterministic full-viewport rain field shared by WebGL and Canvas. */

export type DownpourLayer = 'background' | 'middle' | 'foreground';

export type DownpourFieldConfig = Readonly<{
  density: number;
  fallSpeed: number;
  windSkew: number;
  curtainWidth: number;
  sheetDepth: number;
  splashEnergy: number;
}>;

export type DownpourDrop = Readonly<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  depth: number;
  layer: DownpourLayer;
}>;

export type DownpourSplash = Readonly<{ x: number; y: number; radius: number; phase: number }>;

const TAU = Math.PI * 2;
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const frac = (value: number): number => value - Math.floor(value);

/** A cheap, stable hash avoids frame-to-frame allocation and random flicker. */
export function fieldHash(index: number, salt = 0): number {
  return frac(Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453);
}

export function resolveDownpourField(params: Record<string, number> = {}): DownpourFieldConfig {
  return {
    density: clamp(finite(params.dropDensity ?? params.density, 1), 0.45, 3.5),
    fallSpeed: clamp(finite(params.fallSpeed, 1), 0.55, 3.5),
    // Wind is an x velocity, never a replacement for gravity.  Keep it finite
    // so a malformed pack cannot rotate rain sideways or backwards.
    windSkew: clamp(finite(params.windSkew, 0.7), -1.6, 1.6),
    curtainWidth: clamp(finite(params.curtainWidth, 1), 1, 3),
    sheetDepth: clamp(finite(params.sheetDepth, 1), 0.35, 2),
    splashEnergy: clamp(finite(params.splashEnergy, 1), 0.35, 3),
  };
}

export function downpourLayerCount(
  width: number,
  height: number,
  config: DownpourFieldConfig,
  layer: DownpourLayer,
): number {
  const areaScale = clamp((Math.max(1, width) * Math.max(1, height)) / (BASE_WIDTH * BASE_HEIGHT), 0.35, 3.2);
  const layerRatio = layer === 'background' ? 0.42 : layer === 'middle' ? 0.82 : 1.16;
  return Math.max(18, Math.round(34 * areaScale * config.density * layerRatio));
}

function layerIndex(layer: DownpourLayer): number {
  return layer === 'background' ? 0 : layer === 'middle' ? 1 : 2;
}

/** Return a screen-space drop.  Screen y grows downwards. */
export function downpourDropAt(
  index: number,
  count: number,
  width: number,
  height: number,
  config: DownpourFieldConfig,
  layer: DownpourLayer,
  time = 0,
): DownpourDrop {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const layerId = layerIndex(layer);
  const lane = (index + 0.5) / Math.max(1, count);
  const jitter = fieldHash(index, 11 + layerId * 13);
  const depth = layer === 'background' ? 0.46 + jitter * 0.22 : layer === 'middle' ? 0.72 + jitter * 0.2 : 1.02 + jitter * 0.26;
  const overscan = safeWidth * clamp((config.curtainWidth - 1) * 0.08, 0, 0.16);
  const span = safeWidth + overscan * 2;
  // Seed above and below the viewport so every frame has a continuous sheet.
  const phase = fieldHash(index, 37 + layerId * 17);
  const fallPixels = (time * 0.001 * (250 + 120 * config.fallSpeed) * depth);
  const rawX = lane * span + (jitter - 0.5) * safeWidth * 0.035 + fallPixels * config.windSkew * 0.18;
  const x = frac(rawX / span) * span - overscan;
  const y = ((phase * (safeHeight + 180) + fallPixels) % (safeHeight + 180)) - 90;
  const vy = (250 + 120 * config.fallSpeed) * depth;
  const vx = clamp(config.windSkew * 34 * depth, -78, 78);
  const length = (18 + 24 * config.fallSpeed) * depth;
  return { x, y, vx, vy, length, depth, layer };
}

/** World-space velocity for a Three particle (positive screen y is downward). */
export function downpourWorldVelocity(config: DownpourFieldConfig, depth = 1): { vx: number; vy: number } {
  return { vx: clamp(config.windSkew * 0.48 * depth, -1.2, 1.2), vy: -(3.6 + config.fallSpeed * 2.4) * depth };
}

export function downpourSplashAt(
  index: number,
  count: number,
  width: number,
  height: number,
  config: DownpourFieldConfig,
  time = 0,
): DownpourSplash {
  const lane = (index + 0.5) / Math.max(1, count);
  const phase = fieldHash(index, 83);
  const x = lane * Math.max(1, width) + Math.sin(time * 0.002 + phase * TAU) * 18;
  const y = Math.max(0, height) - 2 - fieldHash(index, 89) * 5;
  return { x, y, radius: (8 + fieldHash(index, 97) * 18) * config.splashEnergy, phase };
}

export function downpourCoverage(
  width: number,
  config: DownpourFieldConfig,
  layer: DownpourLayer = 'middle',
): { minX: number; maxX: number } {
  const count = downpourLayerCount(width, BASE_HEIGHT, config, layer);
  const drops = Array.from({ length: count }, (_, index) => downpourDropAt(index, count, width, BASE_HEIGHT, config, layer));
  return { minX: Math.min(...drops.map((drop) => drop.x)), maxX: Math.max(...drops.map((drop) => drop.x)) };
}
