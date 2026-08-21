import type { Particle, WhipVel } from './particles';
import { P } from './particles';
import type { EffectPreset, SpriteFrame } from './effects-core';
import {
  downpourDropAt,
  downpourLayerCount,
  downpourSplashAt,
  fieldHash,
  resolveDownpourField,
  type DownpourLayer,
} from './downpour-field';

const TAU = Math.PI * 2;

const num = (params: Record<string, number>, key: string, fallback: number): number => {
  const value = params[key];
  return Number.isFinite(value) ? value : fallback;
};

const first = (params: Record<string, number>, keys: readonly string[], fallback: number): number => {
  for (const key of keys) {
    const value = params[key];
    if (Number.isFinite(value)) return value;
  }
  return fallback;
};

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, value))
);

const speed = (vel: WhipVel): number => 0.82 + Math.min(vel.speed, 8) * 0.115;
const fade = (t: number, start = 0.72): number => t < start ? 1 : Math.max(0, 1 - (t - start) / (1 - start));
const cap = (parts: Particle[][]): Particle[] => parts.flat().slice(0, 115);
const dir = (vel: WhipVel): number => vel.dir;

/** Convert a local ballistic arc to the cursor travel direction. */
function rotateLocalTrajectory(parts: Particle[], cx: number, cy: number, angle: number): Particle[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (const particle of parts) {
    const x = particle.x;
    const y = particle.y;
    const vx = particle.vx;
    const vy = particle.vy;
    particle.x = cx + x * cosine - y * sine;
    particle.y = cy + x * sine + y * cosine;
    particle.vx = vx * cosine - vy * sine;
    particle.vy = vx * sine + vy * cosine;
    particle.angle += angle;
  }
  return parts;
}

/** Aim generic beam particles into a cone instead of leaving a radial starburst. */
function aimBeam(parts: Particle[], angle: number, cone: number, velocity: number): Particle[] {
  const last = Math.max(1, parts.length - 1);
  for (let index = 0; index < parts.length; index++) {
    const particle = parts[index];
    const offset = (index / last - 0.5) * cone;
    particle.angle = angle + offset;
    particle.vx = Math.cos(particle.angle) * velocity;
    particle.vy = Math.sin(particle.angle) * velocity;
  }
  return parts;
}

const tornado: EffectPreset = {
  id: 'tornado',
  sprite: (t, _vel, params): SpriteFrame => {
    const turns = first(params, ['funnelTurns', 'spin'], 4.4); const width = first(params, ['funnelWidth', 'stormScale'], 1);
    const a = t * TAU * (1.4 + turns * 0.42); const r = (18 + t * 92) * width;
    return { dx: Math.cos(a) * r, dy: -92 + t * 184, scale: 0.78 + t * 0.32, rot: a + Math.PI / 2, alpha: fade(t, 0.78) };
  },
  emit: (cx, cy, vel, params) => {
    const turns = num(params, 'funnelTurns', 4.4);
    const debrisOrbit = num(params, 'debrisOrbit', 1);
    const suction = num(params, 'suction', 1);
    const lateralDrift = num(params, 'lateralDrift', 0.4);
    const funnelWidth = num(params, 'funnelWidth', 1);
    const stormScale = num(params, 'stormScale', 1);
    const driftX = (lateralDrift - 0.4) * 92;
    const funnel = P.spiral(
      cx + driftX,
      cy - 70,
      38,
      turns,
      92 * funnelWidth * stormScale * speed(vel),
      { shape: 1, hue: [184, 212] },
    );
    for (const particle of funnel) {
      particle.vx += lateralDrift * 0.75;
      particle.vy -= suction * 0.2;
      particle.gravity = -0.018 * suction;
    }
    const debris = P.arcSweep(
      cx + driftX,
      cy - 22,
      Math.round(10 + debrisOrbit * 8),
      -0.65,
      0.5 + turns * 0.08,
      58 * funnelWidth * stormScale,
      { shape: 2, gravity: 0.07, hue: [28, 54] },
    );
    for (let index = 0; index < debris.length; index++) {
      const particle = debris[index];
      const tangential = debrisOrbit * (1.8 + index * 0.04);
      particle.vx += Math.cos(particle.angle) * tangential + lateralDrift * 0.7;
      particle.vy += Math.sin(particle.angle) * tangential - suction * 0.14;
      particle.angle += debrisOrbit * (index % 3 - 1) * 0.42;
    }
    const column = P.pillar(
      cx + driftX,
      cy + 52,
      22,
      122 * suction * stormScale,
      { shape: 1, hue: [180, 204] },
    );
    for (const particle of column) {
      particle.vx += lateralDrift * 0.9;
      particle.gravity = -0.045 * suction;
    }
    return cap([
      funnel,
      debris,
      column,
      P.ringWave(cx + driftX, cy, 12, 20 * stormScale, 3.2 * speed(vel), { shape: 3, hue: [190, 214] }),
    ]);
  },
};

const downpour: EffectPreset = {
  id: 'downpour',
  sprite: (t, _vel, params) => {
    const config = resolveDownpourField(params);
    const drop = downpourDropAt(0, 1, 640, 480, config, 'foreground', t * 1900);
    return { dx: drop.x - 320, dy: drop.y - 240, scale: 0.74, rot: -Math.atan2(drop.vx, drop.vy), alpha: fade(t, 0.84) };
  },
  emit: (cx, cy, _vel, params) => {
    const width = typeof window === 'undefined' ? Math.max(640, cx * 2) : Math.max(1, window.innerWidth);
    const height = typeof window === 'undefined' ? Math.max(480, cy * 2) : Math.max(1, window.innerHeight);
    const config = resolveDownpourField(params); const out: Particle[] = [];
    const layers: DownpourLayer[] = ['background', 'middle', 'foreground'];
    const raw = layers.map((layer) => downpourLayerCount(width, height, config, layer));
    const areaScale = Math.sqrt(width * height / (1280 * 720));
    const rainBudget = Math.round(Math.max(66, Math.min(96, 72 * areaScale * Math.sqrt(config.density))));
    const total = raw.reduce((sum, value) => sum + value, 0);
    for (let layerId = 0; layerId < layers.length; layerId++) {
      const layer = layers[layerId]; const count = Math.max(12, Math.round(rainBudget * raw[layerId] / total));
      for (let i = 0; i < count; i++) {
        const drop = downpourDropAt(i, count, width, height, config, layer);
        const vx = drop.vx / 60; const vy = drop.vy / 60;
        out.push({ x: drop.x, y: drop.y, vx, vy, life: 1, decay: 0.007 + layerId * 0.0015, size: drop.length, hue: 204 + layerId * 3, gravity: 0.035 * config.fallSpeed, shape: 4, angle: Math.atan2(vy, vx), data: drop.depth });
      }
    }
    const splashCount = Math.max(8, Math.min(14, Math.round(width / 110 * config.splashEnergy)));
    for (let i = 0; i < splashCount; i++) {
      const splash = downpourSplashAt(i, splashCount, width, height, config);
      out.push({ x: splash.x, y: splash.y, vx: 0, vy: -0.12, life: 1, decay: 0.022, size: splash.radius * 0.32, hue: 204, gravity: 0.006, shape: 3, angle: 0 });
    }
    const mistCount = Math.max(4, Math.min(7, Math.round(width / 240)));
    for (let i = 0; i < mistCount; i++) out.push({ x: (i + 0.5) / mistCount * width, y: height - 12, vx: (fieldHash(i, 149) - 0.5) * 0.25, vy: -0.16, life: 1, decay: 0.01, size: 28 + fieldHash(i, 151) * 22, hue: 206, gravity: -0.002, shape: 6, angle: 0 });
    return out.slice(0, 115);
  },
};

const wildfire: EffectPreset = {
  id: 'wildfire',
  sprite: (t, vel, params) => { const height = first(params, ['flameHeight', 'emberLift'], 1); return { dx: Math.cos(dir(vel)) * t * 34 + Math.sin(t * TAU * 4) * 14, dy: -t * 132 * height + Math.sin(t * TAU * 3) * 9, scale: 0.86 + t * 0.48 * height + Math.sin(t * TAU * 5) * 0.08, rot: dir(vel) + Math.sin(t * TAU * 3) * 0.2, alpha: fade(t, 0.78) }; },
  emit: (cx, cy, vel, params) => {
    const flameHeight = num(params, 'flameHeight', 1);
    const emberLift = num(params, 'emberLift', 1);
    const spread = num(params, 'spread', 1);
    const heatWarp = num(params, 'heatWarp', 1);
    const smokeRise = num(params, 'smokeRise', 1);
    const gustResponse = num(params, 'gustResponse', 1);
    const flames = P.pillar(cx, cy + 28, Math.round(22 * spread), 126 * flameHeight, { shape: 1, hue: [4, 36] });
    for (let index = 0; index < flames.length; index++) {
      const particle = flames[index];
      const spreadOffset = (index / Math.max(1, flames.length - 1) - 0.5) * 28 * spread;
      particle.x += spreadOffset;
      particle.vx += spreadOffset * 0.035 + (gustResponse - 1) * 0.48;
      particle.vy -= flameHeight * 0.36;
      particle.gravity = -0.032 * flameHeight;
    }
    const embers = P.burst(cx, cy + 6, Math.round(16 + spread * 7), 1.6, 5.8 * speed(vel), { shape: 5, gravity: -0.01, hue: [24, 54] });
    for (const particle of embers) {
      particle.vy -= emberLift * 2.1;
      particle.vx += (gustResponse - 1) * 1.25;
      particle.gravity = -0.018 * emberLift;
      particle.decay /= 0.78 + emberLift * 0.22;
    }
    const smoke = rotateLocalTrajectory(
      P.parabola(0, 0, Math.round(11 + smokeRise * 5), 78 * gustResponse, 38 * smokeRise, { shape: 6, hue: [196, 220] }),
      cx - 48 * gustResponse,
      cy - 12,
      -0.18,
    );
    for (const particle of smoke) {
      particle.gravity = -0.012 * smokeRise;
      particle.vx += (gustResponse - 1) * 0.62;
      particle.decay /= 0.7 + smokeRise * 0.3;
    }
    return cap([
      flames,
      embers,
      smoke,
      P.ringWave(cx, cy - 34, Math.round(4 + heatWarp * 3), 24 * heatWarp, 1.4 + heatWarp * 0.8, { shape: 3, hue: [18, 42] }),
    ]);
  },
};

const gunshot: EffectPreset = {
  id: 'gunshot',
  sprite: (t, vel, _params) => { const d = dir(vel); const s = Math.min(1, t * 2.4); return { dx: Math.cos(d) * (s * 300 - 35), dy: Math.sin(d) * (s * 300 - 35), scale: 0.6 + (1 - t) * 0.32, rot: d, alpha: fade(t, 0.52) }; },
  emit: (cx, cy, vel, params) => {
    const d = dir(vel);
    const muzzleEnergy = num(params, 'muzzleEnergy', 1);
    const recoilKick = num(params, 'recoilKick', 1);
    const tracerSpeed = num(params, 'tracerSpeed', 1);
    const smokeCurl = num(params, 'smokeCurl', 1);
    const casingSpin = num(params, 'casingSpin', 1);
    const flashCone = num(params, 'flashCone', 1);
    const muzzleX = cx + Math.cos(d) * (34 - recoilKick * 7);
    const muzzleY = cy + Math.sin(d) * (34 - recoilKick * 7);
    const tracer = aimBeam(
      P.beam(muzzleX, muzzleY, Math.round(6 + flashCone * 5), 58 * tracerSpeed, { shape: 4, hue: [38, 62] }),
      d,
      0.12 + flashCone * 0.19,
      1.5 + tracerSpeed * 1.55,
    );
    for (const particle of tracer) particle.decay = 0.012 + 0.004 / Math.max(0.45, tracerSpeed);
    const muzzleFlash = P.flare(muzzleX, muzzleY, Math.round(3 + muzzleEnergy * 3), 18 * muzzleEnergy * flashCone, { shape: 6, hue: [28, 55] });
    const sparks = P.spark(muzzleX, muzzleY, Math.round(9 + muzzleEnergy * 4), 4, 10 * muzzleEnergy * speed(vel), { shape: 5, gravity: 0, hue: [30, 62] });
    for (const particle of sparks) {
      particle.angle = d + (particle.angle - Math.PI) * flashCone * 0.36;
      particle.vx = Math.cos(particle.angle) * (5 + muzzleEnergy * 2.5);
      particle.vy = Math.sin(particle.angle) * (5 + muzzleEnergy * 2.5);
    }
    const smoke = P.spiral(muzzleX, muzzleY, Math.round(10 + smokeCurl * 8), 0.7 + smokeCurl * 1.35, 24 + smokeCurl * 18, { shape: 6, hue: [192, 214] });
    for (const particle of smoke) {
      particle.vx = (particle.x - muzzleX) * 0.038 - Math.sin(d) * 0.42;
      particle.vy = (particle.y - muzzleY) * 0.038 - Math.cos(d) * 0.68;
      particle.gravity = -0.008;
      particle.decay = 0.012 + 0.006 / Math.max(0.3, smokeCurl);
    }
    const casings = P.shards(cx - Math.cos(d) * 14, cy - Math.sin(d) * 14, 5, 0.8, 2.2, { shape: 2, hue: [36, 50] });
    for (let index = 0; index < casings.length; index++) {
      const particle = casings[index];
      const ejectAngle = d + (index % 2 ? 1 : -1) * (Math.PI * 0.56 + index * 0.08);
      const ejection = 2.8 + recoilKick * 1.2 + index * 0.35;
      particle.vx = Math.cos(ejectAngle) * ejection;
      particle.vy = Math.sin(ejectAngle) * ejection - 1.7;
      particle.gravity = 0.16;
      particle.angle = ejectAngle + casingSpin * (index + 1) * 0.72;
      particle.decay = 0.016 + index * 0.001;
    }
    return cap([tracer, muzzleFlash, sparks, smoke, casings]);
  },
};

const glassBreak: EffectPreset = {
  id: 'glass-break',
  sprite: (t, vel, params) => ({ dx: Math.cos(dir(vel)) * t * 28, dy: Math.sin(dir(vel)) * t * 28, scale: 1.16 + t * 0.58 * first(params, ['impactRadius', 'refraction'], 1), rot: dir(vel) + t * TAU * 1.9 * first(params, ['shardSpin'], 1), alpha: fade(t, 0.62) }),
  emit: (cx, cy, vel, params) => {
    const branches = num(params, 'crackBranches', 8);
    const impactRadius = num(params, 'impactRadius', 1);
    const shardVelocity = num(params, 'shardVelocity', 1);
    const shardSpin = num(params, 'shardSpin', 1);
    const refraction = num(params, 'refraction', 1);
    const fractureDelay = clamp(num(params, 'fractureDelay', 0.08), 0, 0.42);
    const primary = P.shards(cx, cy, Math.round(30 + branches * 3), 2.2, 8 * shardVelocity * speed(vel), { shape: 2, gravity: 0.15, hue: [186, 220] });
    for (let index = 0; index < primary.length; index++) {
      const particle = primary[index];
      const tangent = particle.angle + Math.PI / 2;
      particle.vx += Math.cos(tangent) * refraction * 0.72;
      particle.vy += Math.sin(tangent) * refraction * 0.72;
      particle.size *= 0.78 + refraction * 0.18;
      particle.angle += shardSpin * (index % 4 - 1.5) * 0.62;
    }
    const lateShards = P.shards(cx, cy, Math.round(8 + branches), 1.1, 5.2 * shardVelocity, { shape: 2, gravity: 0.17, hue: [204, 240] });
    for (let index = 0; index < lateShards.length; index++) {
      const particle = lateShards[index];
      particle.delay = fractureDelay + (index % 4) * 0.014;
      particle.angle += shardSpin * (index + 1) * 0.84;
      particle.vx *= 0.72 + refraction * 0.2;
      particle.vy -= refraction * 0.38;
    }
    const lens = P.ringWave(cx, cy, 18, 16 * impactRadius * refraction, 3.2 * impactRadius, { shape: 3, hue: [188, 228] });
    for (const particle of lens) particle.decay = 0.012 + fractureDelay * 0.035;
    return cap([
      primary,
      lateShards,
      lens,
      P.spark(cx, cy, Math.round(7 + refraction * 6), 2, 6 * shardVelocity, { shape: 5, gravity: 0, hue: [200, 238] }),
    ]);
  },
};

const boxing: EffectPreset = {
  id: 'boxing',
  sprite: (t, vel, params) => { const recovery = first(params, ['recovery'], 0.66); const p = t < 0.34 ? t / 0.34 : 1 - Math.min(1, (t - 0.34) / recovery); const force = first(params, ['punchForce', 'punch'], 1); return { dx: Math.cos(dir(vel)) * (p * 115 * force - 52), dy: Math.sin(dir(vel)) * (p * 115 * force - 52), scale: 0.8 + p * 0.45 * first(params, ['compression', 'gloveMass'], 1), rot: dir(vel), alpha: fade(t, 0.55) }; },
  emit: (cx, cy, vel, params) => {
    const d = dir(vel);
    const punchForce = num(params, 'punchForce', 1);
    const gloveMass = num(params, 'gloveMass', 1);
    const compression = num(params, 'compression', 0.35);
    const screenKnockback = num(params, 'screenKnockback', 1);
    const sweatSpray = num(params, 'sweatSpray', 1);
    const recovery = num(params, 'recovery', 0.66);
    const impactX = cx + Math.cos(d) * (24 + screenKnockback * 10);
    const impactY = cy + Math.sin(d) * (24 + screenKnockback * 10);
    const impact = P.burst(impactX, impactY, Math.round(22 + gloveMass * 7), 2.4, 8.5 * punchForce * speed(vel) / Math.sqrt(gloveMass), { shape: 5, gravity: -0.01, hue: [0, 24] });
    for (const particle of impact) {
      particle.vx += Math.cos(d) * screenKnockback * 0.9;
      particle.vy += Math.sin(d) * screenKnockback * 0.9;
      particle.decay = 0.016 + gloveMass * 0.003;
    }
    const dent = P.shockRing(impactX, impactY, Math.round(12 + gloveMass * 6), 8 + compression * 16, 21 + compression * 42, { shape: 3, gravity: 0, hue: [28, 48] });
    for (const particle of dent) {
      particle.vx += Math.cos(d) * screenKnockback * 0.45;
      particle.vy += Math.sin(d) * screenKnockback * 0.45;
    }
    const sweat = P.burst(impactX, impactY, Math.round(6 + sweatSpray * 9), 1.6, 4.2 + sweatSpray * 3.4, { shape: 0, gravity: 0.13, hue: [186, 210] });
    for (let index = 0; index < sweat.length; index++) {
      const particle = sweat[index];
      const splashAngle = d + (index / Math.max(1, sweat.length - 1) - 0.5) * 1.55;
      particle.vx = Math.cos(splashAngle) * (2 + sweatSpray * 2.2);
      particle.vy = Math.sin(splashAngle) * (2 + sweatSpray * 2.2) - 1.8;
      particle.size *= 0.5 + sweatSpray * 0.16;
    }
    const recoveryWave = P.ringWave(cx, cy, 6, 20 + screenKnockback * 7, 1.6 + punchForce * 0.55, { shape: 3, hue: [36, 55] });
    for (const particle of recoveryWave) particle.decay = 0.026 / Math.max(0.28, recovery);
    return cap([
      impact,
      dent,
      sweat,
      recoveryWave,
      P.flare(impactX, impactY, 3, 18 + punchForce * 8 + compression * 12, { shape: 6, hue: [42, 60] }),
    ]);
  },
};

const whipCrack: EffectPreset = {
  id: 'whip-crack',
  sprite: (t, vel, params) => { const snap = first(params, ['snapVelocity'], 1); const length = first(params, ['lashLength', 'length'], 1); const u = Math.min(1, t * (1.1 + snap * 0.2)); const c = Math.sin(u * Math.PI) * (32 + t * 24) * first(params, ['waveTension'], 1); return { dx: Math.cos(dir(vel)) * u * 185 * length - Math.sin(dir(vel)) * c, dy: Math.sin(dir(vel)) * u * 185 * length + Math.cos(dir(vel)) * c, scale: 0.8 + t * 0.38, rot: dir(vel) + Math.sin(t * TAU * 5) * 0.3, alpha: fade(t, 0.72) }; },
  emit: (cx, cy, vel, params) => {
    const d = dir(vel);
    const lashLength = num(params, 'lashLength', 1);
    const snapVelocity = num(params, 'snapVelocity', 1);
    const waveTension = num(params, 'waveTension', 1);
    const tipCrack = num(params, 'tipCrack', 1);
    const dustArc = num(params, 'dustArc', 1);
    const recoil = num(params, 'recoil', 1);
    const reach = 166 * lashLength;
    const handleX = cx - Math.cos(d) * recoil * 11;
    const handleY = cy - Math.sin(d) * recoil * 11;
    const lash = P.arcSweep(
      handleX,
      handleY,
      Math.round(28 + waveTension * 10),
      d - (0.13 + waveTension * 0.18),
      d + (0.16 + waveTension * 0.24),
      reach,
      { shape: 4, gravity: -0.015, hue: [26, 48] },
    );
    for (const particle of lash) {
      particle.vx *= 0.55 + snapVelocity * 0.42;
      particle.vy *= 0.55 + snapVelocity * 0.42;
      particle.decay = 0.011 + 0.006 / Math.max(0.4, snapVelocity);
    }
    const tipX = handleX + Math.cos(d) * reach;
    const tipY = handleY + Math.sin(d) * reach;
    const crack = P.spark(tipX, tipY, Math.round(10 + tipCrack * 8), 4, 9 * snapVelocity * tipCrack, { shape: 5, gravity: 0, hue: [35, 62] });
    const dust = rotateLocalTrajectory(
      P.parabola(0, 0, Math.round(8 + dustArc * 10), 74 * lashLength, 20 + dustArc * 34, { shape: 0, hue: [24, 40] }),
      handleX + Math.cos(d) * reach * 0.38,
      handleY + Math.sin(d) * reach * 0.38,
      d,
    );
    for (const particle of dust) {
      particle.gravity = 0.09 + dustArc * 0.05;
      particle.vx *= 0.5 + dustArc * 0.35;
      particle.vy *= 0.5 + dustArc * 0.35;
      particle.size *= 0.7 + dustArc * 0.2;
    }
    const recoilDust = P.burst(handleX, handleY, Math.round(4 + recoil * 5), 1, 2.2 + recoil, { shape: 0, gravity: 0.08, hue: [20, 35] });
    for (const particle of recoilDust) {
      particle.vx = -Math.cos(d) * (1.2 + recoil) + particle.vx * 0.25;
      particle.vy = -Math.sin(d) * (1.2 + recoil) + particle.vy * 0.25;
    }
    return cap([lash, crack, dust, recoilDust]);
  },
};

const noteDance: EffectPreset = {
  id: 'note-dance',
  sprite: (t, _vel, params) => ({ dx: -135 + t * 270 * first(params, ['phraseLength', 'chordSpread'], 1), dy: Math.sin(t * TAU * 3 * first(params, ['vibrato', 'noteSpiral'], 1)) * 46 - Math.abs(Math.sin(t * TAU * 6)) * 22 * first(params, ['keyBounce', 'bellBurst', 'bounce'], 1) - t * 24 * first(params, ['noteRise', 'breathFlow'], 1), scale: 0.82 + Math.abs(Math.sin(t * TAU * 4)) * 0.26, rot: Math.sin(t * TAU * 2) * 0.2, alpha: fade(t, 0.84) }),
  emit: (cx, cy, vel, params) => {
    const pianoMode = Number.isFinite(params.keyCount) || !Number.isFinite(params.noteSpiral);
    if (pianoMode) {
      const keyCount = num(params, 'keyCount', 6);
      const keyBounce = num(params, 'keyBounce', 1);
      const chordSpread = num(params, 'chordSpread', 1);
      const noteRise = num(params, 'noteRise', 1);
      const sustainTrails = num(params, 'sustainTrails', 1);
      const octaveArc = num(params, 'octaveArc', 1);
      const keys = P.notes(cx - 76, cy + 10, Math.round(keyCount * 3), { shape: 2, hue: [28, 58] });
      for (let index = 0; index < keys.length; index++) {
        const particle = keys[index];
        const fraction = index / Math.max(1, keys.length - 1);
        particle.x = cx + (particle.x - cx) * chordSpread;
        particle.y -= Math.sin(fraction * Math.PI) * keyBounce * 22;
        particle.vy -= noteRise * (0.8 + Math.sin(fraction * Math.PI) * 1.1);
        particle.gravity = 0.022 + keyBounce * 0.018;
        particle.decay /= 0.58 + sustainTrails * 0.42;
      }
      const sustain = aimBeam(
        P.beam(cx - 70 * chordSpread, cy - 8, Math.round(6 + sustainTrails * 6), 34 + sustainTrails * 34, { shape: 4, hue: [36, 72] }),
        -Math.PI / 2,
        0.18 + chordSpread * 0.1,
        0.8 + noteRise * 0.7,
      );
      for (const particle of sustain) particle.decay = 0.011 / Math.max(0.45, sustainTrails);
      const octaves = rotateLocalTrajectory(
        P.parabola(0, 0, Math.round(8 + octaveArc * 8), 126 * chordSpread, 24 + octaveArc * 64, { shape: 1, hue: [42, 76] }),
        cx - 68 * chordSpread,
        cy + 8,
        0,
      );
      for (const particle of octaves) {
        particle.vy -= noteRise * 0.5;
        particle.gravity = 0.025;
      }
      return cap([
        keys,
        sustain,
        octaves,
        P.ringWave(cx, cy, 10, 15 + chordSpread * 10, 1.5 + keyBounce * speed(vel), { shape: 3, hue: [38, 70] }),
      ]);
    }

    const noteSpiral = num(params, 'noteSpiral', 1);
    const brassGlow = num(params, 'brassGlow', 1);
    const breathFlow = num(params, 'breathFlow', 1);
    const vibrato = num(params, 'vibrato', 1);
    const phraseLength = num(params, 'phraseLength', 1);
    const bellBurst = num(params, 'bellBurst', 1);
    const bellX = cx - 54;
    const bellY = cy + 8;
    const spiral = P.spiral(bellX, bellY, Math.round(16 + phraseLength * 10), 0.8 + noteSpiral * 1.7, 42 + phraseLength * 26, { shape: 1, hue: [35, 66] });
    for (let index = 0; index < spiral.length; index++) {
      const particle = spiral[index];
      const flutter = Math.sin(index * 0.8) * vibrato * 0.55;
      particle.y += flutter * 10;
      particle.vy += flutter;
      particle.vx *= breathFlow;
      particle.vy *= breathFlow;
      particle.gravity = -0.006 * breathFlow;
      particle.decay /= 0.58 + phraseLength * 0.32;
    }
    const breath = aimBeam(
      P.beam(bellX, bellY, Math.round(6 + phraseLength * 5), 36 + breathFlow * 46, { shape: 4, hue: [42, 70] }),
      dir(vel),
      0.22 + vibrato * 0.11,
      0.9 + breathFlow * 0.82,
    );
    const rings = P.ringWave(bellX, bellY, Math.round(8 + phraseLength * 5), 18 + noteSpiral * 14, 1.1 + vibrato * 0.62, { shape: 3, hue: [40, 75] });
    for (const particle of rings) particle.decay /= 0.62 + phraseLength * 0.34;
    return cap([
      spiral,
      breath,
      rings,
      P.flare(bellX, bellY, Math.round(3 + brassGlow * 3), 16 + brassGlow * 22, { shape: 6, hue: [38, 60] }),
      P.spark(bellX, bellY, Math.round(8 + bellBurst * 7), 2, 4 + bellBurst * 4, { shape: 5, gravity: -0.008, hue: [42, 78] }),
    ]);
  },
};

const groove: EffectPreset = {
  id: 'groove',
  sprite: (t, _vel, params) => { const spin = first(params, ['discSpin'], 1); return { dx: Math.cos(t * TAU * 2.2 * spin) * 50, dy: Math.sin(t * TAU * 2.2 * spin) * 50, scale: 0.9 + Math.sin(t * TAU * 4) * 0.08 * first(params, ['wowFlutter', 'needleBounce', 'wobble'], 1), rot: t * TAU * 3.6 * spin, alpha: fade(t, 0.86) }; },
  emit: (cx, cy, vel, params) => {
    const discSpin = num(params, 'discSpin', 1);
    const groovePulse = num(params, 'groovePulse', 1);
    const needleBounce = num(params, 'needleBounce', 0.5);
    const waveOrbit = num(params, 'waveOrbit', 1);
    const dustFlicker = num(params, 'dustFlicker', 0.7);
    const wowFlutter = num(params, 'wowFlutter', 0.35);
    const grooves = P.spiral(cx, cy, Math.round(20 + waveOrbit * 10), 0.8 + discSpin * 1.55, 62 + waveOrbit * 36, { shape: 4, hue: [28, 66] });
    for (let index = 0; index < grooves.length; index++) {
      const particle = grooves[index];
      const wobble = Math.sin(index * 0.74) * wowFlutter;
      particle.x += wobble * 8;
      particle.y += Math.cos(index * 0.74) * wowFlutter * 8;
      particle.vx *= discSpin;
      particle.vy *= discSpin;
      particle.angle += wobble * 0.16;
      particle.decay = 0.013 + 0.006 / Math.max(0.35, groovePulse);
    }
    const pulses = P.ringWave(cx, cy, Math.round(12 + groovePulse * 7), 18 + waveOrbit * 14, 0.9 + groovePulse * speed(vel), { shape: 3, hue: [26, 64] });
    for (const particle of pulses) particle.decay /= 0.72 + waveOrbit * 0.28;
    const needle = P.spark(cx + 34, cy - needleBounce * 20, Math.round(3 + needleBounce * 7), 1, 3 + needleBounce * 4, { shape: 5, gravity: 0.06, hue: [38, 60] });
    for (const particle of needle) {
      particle.vy -= needleBounce * 1.2;
      particle.angle = -Math.PI / 2 + (particle.angle - Math.PI) * 0.14;
    }
    const dust = P.burst(cx, cy, Math.round(4 + dustFlicker * 10), 0.35, 1.2 + dustFlicker * 1.6, { shape: 0, gravity: 0.01, hue: [176, 208] });
    for (let index = 0; index < dust.length; index++) {
      const particle = dust[index];
      particle.decay = 0.025 + (index % 3) * 0.008 / Math.max(0.3, dustFlicker);
      particle.size *= 0.42 + dustFlicker * 0.18;
      particle.vx += Math.sin(index) * wowFlutter * 0.5;
    }
    return cap([grooves, pulses, needle, dust]);
  },
};

const fireworks: EffectPreset = {
  id: 'fireworks',
  sprite: (t, vel, params) => { const d = dir(vel); const rise = first(params, ['shellRise'], 1); if (t < 0.42) return { dx: Math.cos(d) * t * 105, dy: Math.sin(d) * t * 105 - t * 130 * rise, scale: 0.68 + t * 0.25, rot: d, alpha: 1 }; const p = (t - 0.42) / 0.58; const radius = first(params, ['burstRadius', 'radius'], 1); return { dx: Math.cos(t * TAU * 2.5) * p * 230 * radius, dy: Math.sin(t * TAU * 2.5) * p * 230 * radius - p * p * 30 * first(params, ['gravityArc'], 1), scale: 1.15 - p * 0.58, rot: t * TAU, alpha: fade(t, 0.82) }; },
  emit: (cx, cy, vel, params) => {
    const shellRise = num(params, 'shellRise', 1);
    const burstRadius = num(params, 'burstRadius', 1);
    const starCount = num(params, 'starCount', 1);
    const colorTrails = num(params, 'colorTrails', 1);
    const gravityArc = num(params, 'gravityArc', 1);
    const afterglow = num(params, 'afterglow', 1);
    const apexX = cx + Math.cos(dir(vel)) * 20;
    const apexY = cy - 74 * shellRise;
    const shell = P.pillar(cx, cy + 56, 18, 116 * shellRise, { shape: 5, hue: [24, 58] });
    for (const particle of shell) {
      particle.vy -= shellRise * 1.1;
      particle.gravity = -0.045 * shellRise;
      particle.size *= 0.7 + shellRise * 0.16;
    }
    const stars = P.burst(
      apexX,
      apexY,
      Math.round(28 + starCount * 12),
      2.8,
      8.5 * burstRadius * speed(vel),
      { shape: 5, gravity: 0.025 * gravityArc, hue: [4, clamp(24 + colorTrails * 96, 40, 330)] },
    );
    for (const particle of stars) {
      particle.gravity = 0.025 * gravityArc;
      particle.decay = 0.011 + 0.004 / Math.max(0.3, colorTrails);
      particle.size *= 0.75 + starCount * 0.08;
    }
    const trails = P.beam(apexX, apexY, Math.round(5 + colorTrails * 5), 20 + burstRadius * 20, { shape: 4, hue: [16, clamp(34 + colorTrails * 112, 48, 350)] });
    for (let index = 0; index < trails.length; index++) {
      const particle = trails[index];
      particle.angle = index / Math.max(1, trails.length) * TAU;
      particle.vx = Math.cos(particle.angle) * (1.4 + burstRadius);
      particle.vy = Math.sin(particle.angle) * (1.4 + burstRadius);
      particle.gravity = 0.018 * gravityArc;
      particle.decay = 0.015 / Math.max(0.32, afterglow);
    }
    const glow = P.flare(apexX, apexY, Math.round(2 + afterglow * 3), 20 + burstRadius * 14 + afterglow * 14, { shape: 6, hue: [38, 72] });
    for (const particle of glow) particle.decay = 0.02 / Math.max(0.35, afterglow);
    return cap([shell, stars, trails, glow]);
  },
};

const singularity: EffectPreset = {
  id: 'singularity',
  sprite: (t, _vel, params) => { const r = 156 * (1 - t) * first(params, ['gravityPull', 'eventHorizon'], 1); const a = t * TAU * 2.8 * first(params, ['accretionSpin', 'spin'], 1); return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, scale: 1.2 - t * 0.66, rot: a + Math.PI / 2, alpha: fade(t, 0.8) }; },
  emit: (cx, cy, _vel, params) => {
    const accretionSpin = num(params, 'accretionSpin', 1);
    const lensingStrength = num(params, 'lensingStrength', 1);
    const gravityPull = num(params, 'gravityPull', 1);
    const eventHorizon = num(params, 'eventHorizon', 1);
    const jetPower = num(params, 'jetPower', 1);
    const timeDilation = num(params, 'timeDilation', 1);
    const disk = P.spiral(cx, cy, 36, 1 + accretionSpin * 1.4, 112 * eventHorizon, { shape: 1, hue: [252, 328] });
    for (const particle of disk) {
      const radialX = particle.x - cx;
      const radialY = particle.y - cy;
      const tangentX = -radialY * 0.038 * accretionSpin;
      const tangentY = radialX * 0.038 * accretionSpin;
      particle.vx = tangentX - radialX * 0.018 * gravityPull;
      particle.vy = tangentY - radialY * 0.018 * gravityPull;
      particle.decay = 0.016 * timeDilation;
      particle.size *= 0.7 + eventHorizon * 0.18;
    }
    const lens = P.ringWave(cx, cy, Math.round(12 + lensingStrength * 6), 42 + lensingStrength * 44, 0.75 + 0.8 / Math.max(0.35, timeDilation), { shape: 3, hue: [260, 336] });
    for (const particle of lens) particle.decay = 0.014 * timeDilation;
    const jets = P.beam(cx, cy, Math.round(2 + jetPower * 3), 42 + jetPower * 56, { shape: 4, hue: [276, 338] });
    for (let index = 0; index < jets.length; index++) {
      const particle = jets[index];
      particle.angle = index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
      particle.vx = 0;
      particle.vy = Math.sin(particle.angle) * (1.1 + jetPower * 0.8);
      particle.decay = 0.016 * timeDilation;
    }
    const horizon = P.flare(cx, cy, Math.round(2 + eventHorizon * 2), 18 + eventHorizon * 28, { shape: 6, hue: [278, 338] });
    for (const particle of horizon) particle.decay = 0.018 * timeDilation;
    return cap([disk, lens, jets, horizon]);
  },
};

const drumBeat: EffectPreset = {
  id: 'drum-beat',
  sprite: (t, vel, params) => ({ dx: Math.cos(dir(vel)) * Math.sin(t * TAU * 4) * 12, dy: Math.sin(dir(vel)) * Math.sin(t * TAU * 4) * 12, scale: 0.9 + Math.abs(Math.sin(t * TAU * 8)) * 0.34 * num(params, 'bass', 1), rot: dir(vel), alpha: fade(t, 0.84) }),
  emit: (cx, cy, vel, params) => cap([
    P.ringWave(cx, cy, 34, 20, 4.5 * speed(vel) * num(params, 'bass', 1), { shape: 3, hue: [8, 40] }),
    P.shockRing(cx, cy, 26, 14, 30, { shape: 5, gravity: 0, hue: [18, 55] }),
    P.flare(cx, cy, 4, 32, { shape: 6, hue: [30, 65] }),
  ]),
};

export const FAMILY_PRESETS: EffectPreset[] = [
  tornado, downpour, wildfire, gunshot, glassBreak, boxing, whipCrack,
  noteDance, groove, fireworks, singularity, drumBeat,
];
