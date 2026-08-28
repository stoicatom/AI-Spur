import type { Particle } from './particles';
import { drawExtendedParticleShapes } from './material-particle-shapes';

const TAU = Math.PI * 2;
const HSL_DOT_CACHE: string[] = [];
const HSL_STREAK_CACHE: string[] = [];
const HSL_SHARD_CACHE: string[] = [];

for (let hue = 0; hue < 360; hue++) {
  HSL_DOT_CACHE[hue] = `hsl(${hue},100%,62%)`;
  HSL_STREAK_CACHE[hue] = `hsl(${hue},100%,66%)`;
  HSL_SHARD_CACHE[hue] = `hsl(${hue},90%,58%)`;
}

const REFERENCE_STEP = 1 / 60;
const canvasRemainders = new WeakMap<Particle[], number>();

function advanceReferenceStep(particles: Particle[]): number {
  const damping = 0.98;
  let write = 0;
  for (let index = 0; index < particles.length; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) {
      const remainingDelay = (particle.delay ?? 0) - REFERENCE_STEP;
      particle.delay = remainingDelay > 1e-9 ? remainingDelay : 0;
      if (write !== index) particles[write] = particle;
      write++;
      continue;
    }
    const oldVx = particle.vx; const oldVy = particle.vy;
    particle.vy += particle.gravity;
    particle.vx *= damping;
    particle.vy *= damping;
    particle.x += (oldVx + particle.vx) * 0.5;
    particle.y += (oldVy + particle.vy) * 0.5;
    particle.life -= particle.decay;
    if (particle.life <= 0) continue;
    if (write !== index) particles[write] = particle;
    write++;
  }
  particles.length = write;
  return write;
}

export function advanceCanvasParticles(particles: Particle[], dt = REFERENCE_STEP): number {
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : REFERENCE_STEP;
  const total = (canvasRemainders.get(particles) ?? 0) + elapsed;
  const steps = Math.floor((total + Number.EPSILON) / REFERENCE_STEP);
  canvasRemainders.set(particles, Math.max(0, total - steps * REFERENCE_STEP));
  let count = particles.length;
  for (let step = 0; step < steps; step++) count = advanceReferenceStep(particles);
  return count;
}

/** 推进粒子物理，并按 shape 批量绘制；粒子数组始终原地压缩。 */
export function advanceAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  now: number,
  particleHue: number,
  dt = REFERENCE_STEP,
): void {
  const count = advanceCanvasParticles(particles, dt);
  ctx.save();

  ctx.beginPath();
  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 0) continue;
    const size = particle.size * particle.life;
    ctx.moveTo(particle.x + size, particle.y);
    ctx.arc(particle.x, particle.y, size, 0, TAU);
  }
  ctx.fillStyle = HSL_DOT_CACHE[particleHue % 360];
  ctx.globalAlpha = 1;
  ctx.fill();

  ctx.lineCap = 'round';
  let lastHue = -1;
  ctx.beginPath();
  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 1) continue;
    const hue = particle.hue;
    if (hue !== lastHue) {
      if (lastHue >= 0) {
        ctx.strokeStyle = HSL_STREAK_CACHE[lastHue];
        ctx.stroke();
        ctx.beginPath();
      }
      lastHue = hue;
    }
    ctx.globalAlpha = Math.min(1, particle.life * 1.4);
    ctx.lineWidth = particle.size * particle.life;
    const length = 10 + particle.life * 14;
    const angle = Math.atan2(particle.vy, particle.vx);
    ctx.moveTo(particle.x, particle.y);
    ctx.lineTo(
      particle.x - Math.cos(angle) * length,
      particle.y - Math.sin(angle) * length,
    );
  }
  if (lastHue >= 0) {
    ctx.strokeStyle = HSL_STREAK_CACHE[lastHue];
    ctx.stroke();
  }

  ctx.beginPath();
  lastHue = -1;
  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 2) continue;
    const hue = particle.hue;
    if (hue !== lastHue) {
      if (lastHue >= 0) {
        ctx.fillStyle = HSL_SHARD_CACHE[lastHue];
        ctx.fill();
        ctx.beginPath();
      }
      lastHue = hue;
    }
    ctx.globalAlpha = Math.min(1, particle.life * 1.4);
    const size = particle.size * particle.life;
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.angle + now * 0.01);
    ctx.fillRect(-size, -size * 0.5, size * 2, size);
    ctx.restore();
  }
  if (lastHue >= 0) {
    ctx.fillStyle = HSL_SHARD_CACHE[lastHue];
    ctx.fill();
  }

  drawExtendedParticleShapes(ctx, particles, count);
  ctx.restore();
}
