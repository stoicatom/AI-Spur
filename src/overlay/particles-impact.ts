import { IMPACT, TAU } from './particles-config';
import type { WhipVel } from './particles-types';

/** 绘制横切的冲击光环 + 中心闪光。全屏覆盖，方向无关，只随速度缩放。 */
export function drawImpact(
  ctx: CanvasRenderingContext2D,
  _now: number,
  cx: number,
  cy: number,
  vel: WhipVel,
  t: number,
): void {
  if (t >= 0.35) return;
  const radiusLimit = IMPACT.ringRadius(vel.speed);
  const ease = t / 0.35;
  const radius = ease * radiusLimit;
  const alpha = (1 - ease) * 0.55;
  const hue = 42;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `hsl(${hue},100%,66%)`;
  ctx.lineWidth = 6 * (1 - ease) + 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();

  if (t < 0.15) {
    const flashAlpha = IMPACT.flashAlpha(vel.speed) * (1 - t / 0.15);
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = '#FFF6D8';
    ctx.beginPath();
    ctx.arc(cx, cy, 26 * (1 - t / 0.15) + 8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
