export type ElectricDischargeKind = 'lightning' | 'thunder';

export type ElectricPoint = Readonly<{
  /** Lateral displacement relative to the complete channel length. */
  x: number;
  /** Progress from the cloud (0) to the strike point (1). */
  y: number;
}>;

export type ElectricSegment = Readonly<{
  from: ElectricPoint;
  to: ElectricPoint;
  depth: number;
  branch: number;
  parent: number | null;
  reveal: number;
}>;

export type ElectricDischarge = Readonly<{
  segments: readonly ElectricSegment[];
  mainSegmentCount: number;
  maxSegments: number;
  maxDepth: number;
}>;

export type ElectricDischargeConfig = Readonly<{
  seed: number;
  mainSegments: number;
  branches: number;
  jaggedness: number;
  maxDepth: number;
  maxSegments: number;
}>;

export type ElectricEnvelope = Readonly<{
  preflash: number;
  leaderProgress: number;
  core: number;
  glow: number;
  cloud: number;
  impact: number;
  afterglow: number;
  returnStroke: number;
  pressure: number;
}>;

export const ELECTRIC_STROKE_TIMES = Object.freeze([0.15, 0.285, 0.405] as const);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function pulse(value: number, start: number, attack: number, decay: number): number {
  if (value < start || value >= start + attack + decay) return 0;
  if (value < start + attack) return smoothstep(start, start + attack, value);
  return 1 - smoothstep(start + attack, start + attack + decay, value);
}

function hashSeed(seed: number, value: number): number {
  let mixed = (seed ^ Math.imul(value | 0, 0x45d9f3b)) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x45d9f3b) >>> 0;
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function param(params: Record<string, number>, name: string, fallback: number): number {
  const value = params[name];
  return Number.isFinite(value) ? value : fallback;
}

/** Resolves the same bounded channel complexity for WebGL and Canvas. */
export function resolveElectricDischargeConfig(
  kind: ElectricDischargeKind,
  params: Record<string, number>,
  reducedMotion = false,
): ElectricDischargeConfig {
  const intensity = clamp(param(params, 'intensity', 1), 0.5, 3);
  const branchParam = kind === 'lightning'
    ? param(params, 'branches', 3)
    : 2.4 + intensity * 0.7;
  const jaggedness = kind === 'lightning'
    ? clamp(param(params, 'jaggedness', 1.25), 0.6, 2.8)
    : clamp(1.05 + intensity * 0.2, 0.8, 1.8);
  const branches = reducedMotion
    ? Math.min(2, Math.max(1, Math.round(branchParam)))
    : clamp(Math.round(branchParam), 2, 7);
  const mainSegments = reducedMotion ? 12 : kind === 'thunder' ? 20 : 18;
  const maxDepth = reducedMotion ? 1 : 2;
  const maxSegments = reducedMotion ? 30 : kind === 'thunder' ? 62 : 56;
  const flicker = param(params, 'flicker', 1);
  let seed = kind === 'thunder' ? 0x7468756e : 0x626f6c74;
  seed = hashSeed(seed, Math.round(branchParam * 100));
  seed = hashSeed(seed, Math.round(jaggedness * 100));
  seed = hashSeed(seed, Math.round(flicker * 100));
  return { seed, mainSegments, branches, jaggedness, maxDepth, maxSegments };
}

/**
 * Builds a stable stepped leader with child leaders attached to exact parent
 * endpoints. Topology never changes after a strike starts, matching how a
 * return stroke reuses the ionized channel established by the first leader.
 */
export function generateElectricDischarge(config: ElectricDischargeConfig): ElectricDischarge {
  const mainSegments = Math.round(clamp(config.mainSegments, 8, 26));
  const maxSegments = Math.round(clamp(config.maxSegments, mainSegments, 80));
  const branchCount = Math.round(clamp(config.branches, 1, 8));
  const maxDepth = Math.round(clamp(config.maxDepth, 0, 3));
  const jaggedness = clamp(config.jaggedness, 0.35, 3.2);
  const random = randomSource(config.seed);
  const segments: ElectricSegment[] = [];
  const mainPoints: ElectricPoint[] = [{ x: 0, y: 0 }];
  let lateral = 0;
  let momentum = 0;

  for (let index = 1; index < mainSegments; index++) {
    const progress = index / mainSegments;
    momentum = momentum * 0.38 + (random() - 0.5) * 0.075 * jaggedness;
    lateral = clamp(lateral + momentum, -0.16 * jaggedness, 0.16 * jaggedness);
    const taper = Math.pow(Math.sin(progress * Math.PI), 0.7);
    mainPoints.push({
      x: (lateral + (random() - 0.5) * 0.026 * jaggedness) * taper,
      y: progress,
    });
  }
  mainPoints.push({ x: 0, y: 1 });

  for (let index = 0; index < mainSegments; index++) {
    segments.push({
      from: mainPoints[index],
      to: mainPoints[index + 1],
      depth: 0,
      branch: 0,
      parent: index === 0 ? null : index - 1,
      reveal: 0.08 + (index + 1) / mainSegments * 0.72,
    });
  }

  let nextBranch = 1;
  const growBranch = (
    root: ElectricPoint,
    parent: number,
    depth: number,
    sign: number,
    branch: number,
  ): void => {
    if (depth > maxDepth || segments.length >= maxSegments) return;
    const steps = depth === 1 ? 4 + Math.round(random()) : 3;
    const verticalReach = (0.16 + random() * 0.08) / Math.pow(depth, 0.55);
    const lateralReach = sign * (0.11 + random() * 0.1) / Math.pow(depth, 0.45);
    let point = root;
    let previous = parent;
    let childRoot: { point: ElectricPoint; parent: number } | null = null;

    for (let step = 0; step < steps && segments.length < maxSegments; step++) {
      const progress = (step + 1) / steps;
      const wobble = (random() - 0.5) * 0.035 * jaggedness / depth;
      const next: ElectricPoint = {
        x: root.x + lateralReach * progress + wobble,
        y: clamp(root.y + verticalReach * progress + (random() - 0.5) * 0.018, 0, 0.965),
      };
      const segmentIndex = segments.length;
      segments.push({
        from: point,
        to: next,
        depth,
        branch,
        parent: previous,
        reveal: clamp(0.2 + root.y * 0.48 + progress * 0.22 + depth * 0.035, 0, 0.98),
      });
      if (step === Math.floor(steps / 2)) childRoot = { point: next, parent: segmentIndex };
      point = next;
      previous = segmentIndex;
    }

    if (childRoot && depth < maxDepth && segments.length < maxSegments) {
      growBranch(childRoot.point, childRoot.parent, depth + 1, -sign, nextBranch++);
    }
  };

  for (let branch = 0; branch < branchCount && segments.length < maxSegments; branch++) {
    const spread = (branch + 0.6) / (branchCount + 0.2);
    const mainIndex = Math.round(clamp(mainSegments * (0.2 + spread * 0.56), 2, mainSegments - 3));
    const sign = branch % 2 === 0 ? (random() > 0.25 ? 1 : -1) : (random() > 0.25 ? -1 : 1);
    growBranch(mainPoints[mainIndex], mainIndex - 1, 1, sign, nextBranch++);
  }

  return Object.freeze({
    segments: Object.freeze(segments),
    mainSegmentCount: mainSegments,
    maxSegments,
    maxDepth: segments.reduce((depth, segment) => Math.max(depth, segment.depth), 0),
  });
}

/** Shared multi-stage optical timeline for both renderers. */
export function electricEnvelope(
  progress: number,
  reducedMotion = false,
  flicker = 1,
): ElectricEnvelope {
  const t = clamp01(progress);
  const energy = clamp(0.78 + flicker * 0.16, 0.82, 1.18);
  if (reducedMotion) {
    const strike = pulse(t, 0.13, 0.055, 0.22) * 0.72;
    const afterglow = t < 0.18 ? 0 : Math.pow(1 - smoothstep(0.18, 0.82, t), 1.35) * 0.42;
    return {
      preflash: 0,
      leaderProgress: smoothstep(0.055, 0.19, t),
      core: Math.max(strike, afterglow * 0.28),
      glow: Math.max(strike * 0.62, afterglow * 0.52),
      cloud: strike * 0.28 + afterglow * 0.12,
      impact: Math.max(strike * 0.62, afterglow * 0.2),
      afterglow,
      returnStroke: 0,
      pressure: smoothstep(0.18, 0.58, t) * (1 - smoothstep(0.62, 1, t)),
    };
  }

  const preflash = Math.max(
    pulse(t, 0.018, 0.018, 0.035) * 0.52,
    pulse(t, 0.074, 0.012, 0.047) * 0.8,
  );
  const main = pulse(t, ELECTRIC_STROKE_TIMES[0] - 0.012, 0.012, 0.09) * energy;
  const returnOne = pulse(t, ELECTRIC_STROKE_TIMES[1] - 0.008, 0.008, 0.056) * 0.82 * energy;
  const returnTwo = pulse(t, ELECTRIC_STROKE_TIMES[2] - 0.007, 0.007, 0.047) * 0.64 * energy;
  const returnStroke = Math.max(returnOne, returnTwo);
  const stroke = Math.max(main, returnStroke);
  const afterglow = t < 0.16 ? 0 : Math.pow(1 - smoothstep(0.16, 0.84, t), 1.7);
  const impactTail = t < 0.155 ? 0 : Math.pow(1 - smoothstep(0.155, 0.72, t), 2.25);
  return {
    preflash,
    leaderProgress: smoothstep(0.052, 0.158, t),
    core: clamp01(Math.max(stroke, afterglow * 0.2)),
    glow: clamp01(Math.max(preflash * 0.14, stroke * 0.78, afterglow * 0.38)),
    cloud: clamp01(preflash * 0.68 + stroke * 0.72 + afterglow * 0.16),
    impact: clamp01(Math.max(stroke * 0.9, impactTail * 0.48)),
    afterglow,
    returnStroke: clamp01(returnStroke),
    pressure: smoothstep(0.15, 0.5, t) * (1 - smoothstep(0.72, 1, t)),
  };
}

export function prefersReducedElectricMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
