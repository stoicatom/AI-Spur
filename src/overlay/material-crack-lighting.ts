const TAU = Math.PI * 2;

/** Canvas 回退路径的中心爆闪、体积光晕与扩散冲击波。 */
export function drawCrackLighting(
  ctx: CanvasRenderingContext2D,
  progress: number,
  x: number,
  y: number,
  hue: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = Math.sin(progress * Math.PI);
  const radius = 24 + progress * 180;
  const glow = typeof ctx.createRadialGradient === 'function'
    ? ctx.createRadialGradient(x, y, 0, x, y, radius)
    : null;
  if (glow) {
    glow.addColorStop(0, `hsla(${hue},100%,92%,${0.55 * pulse})`);
    glow.addColorStop(0.18, `hsla(${hue},100%,70%,${0.25 * pulse})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = glow ?? `hsla(${hue},100%,70%,${0.25 * pulse})`;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = Math.max(0, 1 - progress) * 0.8;
  ctx.strokeStyle = `hsl(${hue},100%,78%)`;
  ctx.lineWidth = 1.5 + 3 * (1 - progress);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
