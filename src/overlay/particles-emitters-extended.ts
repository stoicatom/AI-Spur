import { TAU, hueRange, rand } from './particles-config';
import type { Particle, ParticleOptions } from './particles-types';

/** 环形扩散波（shape 3）：一圈线环，随 life 扩张。 */
export function ringWave(
  cx: number,
  cy: number,
  count: number,
  radius: number,
  speed: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(0.01, 0.02),
      size: radius,
      hue: rand(...hue),
      gravity: 0,
      shape: 3,
      angle,
      data: 0,
    });
  }
  return out;
}

/** 火花（shape 5）：短促星芒，爆裂感。 */
export function spark(
  cx: number,
  cy: number,
  count: number,
  speedLo: number,
  speedHi: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rand(-0.12, 0.12);
    const speed = rand(speedLo, speedHi);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(0.02, 0.04),
      size: rand(2, 5),
      hue: rand(...hue),
      gravity: o.gravity ?? 0.06,
      shape: 5,
      angle,
    });
  }
  return out;
}

/** 光束（shape 4）：长条光柱，横扫感。 */
export function beam(
  cx: number,
  cy: number,
  count: number,
  length: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rand(-0.1, 0.1);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * 0.5,
      vy: Math.sin(angle) * 0.5,
      life: 1,
      decay: rand(0.01, 0.02),
      size: length,
      hue: rand(...hue),
      gravity: 0,
      shape: 4,
      angle,
    });
  }
  return out;
}

/** 光晕（shape 6）：中心膨胀的辉光。 */
export function flare(
  cx: number,
  cy: number,
  count: number,
  radius: number,
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * 0.3,
      vy: Math.sin(angle) * 0.3,
      life: 1,
      decay: rand(0.012, 0.025),
      size: radius,
      hue: rand(...hue),
      gravity: 0,
      shape: 6,
      angle,
    });
  }
  return out;
}

/** 文字/符号（shape 7）：惊叹符号等。 */
export function glyph(
  cx: number,
  cy: number,
  count: number,
  chars: string[],
  o: ParticleOptions = {},
): Particle[] {
  const out: Particle[] = [];
  const hue = hueRange(o);
  for (let i = 0; i < count; i++) {
    const angle = rand(0, TAU);
    const speed = rand(0.5, 2);
    out.push({
      x: cx + Math.cos(angle) * 20,
      y: cy + Math.sin(angle) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 1,
      decay: rand(0.015, 0.03),
      size: rand(18, 30),
      hue: rand(...hue),
      gravity: -0.02,
      shape: 7,
      angle: 0,
      data: chars[Math.floor(Math.random() * chars.length)],
    });
  }
  return out;
}
