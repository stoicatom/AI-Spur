import type { Particle } from './particles';

const TAU = Math.PI * 2;

/** 绘制 Canvas 回退路径中的扩展粒子形状（ring、beam、spark、flare、glyph）。 */
export function drawExtendedParticleShapes(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  count: number,
): void {
  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 3) continue;
    const radius = particle.size + (1 - particle.life) * 90;
    ctx.save();
    ctx.globalAlpha = particle.life * 0.7;
    ctx.strokeStyle = `hsl(${particle.hue},100%,70%)`;
    ctx.lineWidth = 3 * particle.life;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 4) continue;
    const length = particle.size * particle.life;
    ctx.save();
    ctx.globalAlpha = particle.life * 0.5;
    ctx.strokeStyle = `hsl(${particle.hue},100%,70%)`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(particle.x, particle.y);
    ctx.lineTo(
      particle.x + Math.cos(particle.angle) * length,
      particle.y + Math.sin(particle.angle) * length,
    );
    ctx.stroke();
    ctx.restore();
  }

  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 5) continue;
    const size = particle.size * particle.life + 1;
    ctx.save();
    ctx.globalAlpha = particle.life;
    ctx.translate(particle.x, particle.y);
    ctx.strokeStyle = `hsl(${particle.hue},100%,72%)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.lineTo(size, 0);
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.stroke();
    ctx.restore();
  }

  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 6) continue;
    const radius = particle.size * particle.life + 2;
    ctx.save();
    ctx.globalAlpha = particle.life * 0.6;
    const gradient = typeof ctx.createRadialGradient === 'function'
      ? ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        radius,
      )
      : null;
    if (!gradient) {
      ctx.fillStyle = `hsl(${particle.hue},100%,75%)`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
      continue;
    }
    gradient.addColorStop(0, `hsl(${particle.hue},100%,75%)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let index = 0; index < count; index++) {
    const particle = particles[index];
    if ((particle.delay ?? 0) > 0) continue;
    if (particle.shape !== 7) continue;
    ctx.globalAlpha = particle.life;
    ctx.fillStyle = `hsl(${particle.hue},100%,70%)`;
    ctx.font = `700 ${particle.size * particle.life + 8}px 'Chakra Petch', sans-serif`;
    ctx.fillText(String(particle.data ?? '!'), particle.x, particle.y);
  }
  ctx.restore();
}
