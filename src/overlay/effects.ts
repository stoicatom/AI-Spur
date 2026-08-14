/**
 * Canvas visual effects for the AI-Spur overlay.
 *
 * Interaction model:
 *   1. Hotkey → overlay appears, mouse cursor becomes the effect icon
 *   2. User moves mouse → icon follows (custom cursor)
 *   3. Click → icon explodes into the effect animation → sends prompt
 *   4. Effect ends → overlay hides
 *
 * Effects are user-configurable via config (not random).
 * Supports programmatic effects (rocket, explosion, etc.) and custom image+sound combos.
 */

export type EffectKind =
  | 'rocket'
  | 'explosion'
  | 'sparkle'
  | 'starburst'
  | 'firework';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;     // 0 = dead, 1 = just born
  decay: number;     // life units to subtract per frame
  size: number;
  color: string;
  gravity: number;
  rotation: number;
  rotSpeed: number;
  shape: 'circle' | 'square' | 'star' | 'line';
}

export interface EffectState {
  kind: EffectKind;
  t0: number;
  alive: boolean;
  cx: number;
  cy: number;
  particles: Particle[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    else ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
}

// ── Emit helpers ──────────────────────────────────────────────────────────

function emitRocket(out: Particle[], cx: number, cy: number) {
  const hue = rand(20, 50);
  for (let i = 0; i < 50; i++) {
    const angle = rand(0, TAU);
    const speed = rand(2, 10);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 1, decay: rand(0.015, 0.035),
      size: rand(2, 5),
      color: hsl(hue + rand(-10, 10), 100, rand(50, 70)),
      gravity: 0.12, rotation: 0, rotSpeed: rand(-3, 3), shape: 'circle',
    });
  }
}

function emitExplosion(out: Particle[], cx: number, cy: number) {
  for (let i = 0; i < 80; i++) {
    const angle = rand(0, TAU);
    const speed = rand(3, 14);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, decay: rand(0.01, 0.03),
      size: rand(1.5, 4),
      color: hsl(rand(0, 40), 100, rand(45, 70)),
      gravity: 0.1, rotation: rand(0, 360), rotSpeed: rand(-4, 4),
      shape: i % 3 === 0 ? 'square' : 'circle',
    });
  }
}

function emitFirework(out: Particle[], cx: number, cy: number) {
  const palette = [hsl(350, 100, 60), hsl(20, 100, 55), hsl(45, 100, 65), hsl(60, 100, 70)];
  for (let i = 0; i < 60; i++) {
    const angle = rand(0, TAU);
    const speed = rand(2, 12);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, decay: rand(0.012, 0.028),
      size: rand(1.5, 3.5),
      color: palette[i % palette.length],
      gravity: 0.08, rotation: rand(0, 360), rotSpeed: 0,
      shape: i % 5 === 0 ? 'star' : 'circle',
    });
  }
}

function emitSparkle(out: Particle[], cx: number, cy: number) {
  for (let i = 0; i < 40; i++) {
    const angle = rand(0, TAU);
    const speed = rand(1, 6);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1, decay: rand(0.01, 0.02),
      size: rand(1, 3),
      color: hsl(rand(45, 65), 100, rand(75, 95)),
      gravity: -0.04, rotation: rand(0, 360), rotSpeed: rand(-2, 2),
      shape: 'star',
    });
  }
}

function emitStarburst(out: Particle[], cx: number, cy: number) {
  const arms = 8;
  for (let arm = 0; arm < arms; arm++) {
    const base = (arm / arms) * TAU;
    for (let j = 0; j < 8; j++) {
      const angle = base + rand(-0.15, 0.15);
      const speed = rand(4, 12) * (1 - j / 10);
      const armHue = (arm * 45) % 360;
      out.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, decay: rand(0.015, 0.03),
        size: rand(2, 5),
        color: hsl(armHue, 100, 60),
        gravity: 0.06, rotation: (angle * 180) / Math.PI, rotSpeed: 0,
        shape: 'line',
      });
    }
  }
}

// ── Create / Update / Draw ────────────────────────────────────────────────

export function createEffect(kind: EffectKind, cx: number, cy: number): EffectState {
  return { kind, t0: performance.now(), alive: true, cx, cy, particles: [] };
}

export function updateEffect(effect: EffectState, now: number): void {
  if (!effect.alive) return;

  // Spawn particles on first update
  if (effect.particles.length === 0) {
    switch (effect.kind) {
      case 'rocket':   emitRocket(effect.particles, effect.cx, effect.cy); break;
      case 'explosion': emitExplosion(effect.particles, effect.cx, effect.cy); break;
      case 'sparkle':  emitSparkle(effect.particles, effect.cx, effect.cy); break;
      case 'starburst': emitStarburst(effect.particles, effect.cx, effect.cy); break;
      case 'firework': emitFirework(effect.particles, effect.cx, effect.cy); break;
    }
  }

  for (const p of effect.particles) {
    if (p.life <= 0) continue;
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotSpeed;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= p.decay;
    if (p.life < 0) p.life = 0;
  }

  effect.particles = effect.particles.filter((p) => p.life > 0);

  if (now - effect.t0 > 2000) effect.alive = false;
}

export function drawEffect(ctx: CanvasRenderingContext2D, effect: EffectState): void {
  for (const p of effect.particles) {
    if (p.life <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life * 1.5);
    ctx.translate(p.x, p.y);
    const sz = p.size * p.life;

    switch (p.shape) {
      case 'circle':
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, sz, 0, TAU);
        ctx.fill();
        break;
      case 'square':
        ctx.fillStyle = p.color;
        ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
        break;
      case 'star':
        ctx.fillStyle = p.color;
        drawStar(ctx, 0, 0, sz, sz * 0.4, 4);
        ctx.fill();
        break;
      case 'line':
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(-sz * 2, 0);
        ctx.lineTo(sz * 2, 0);
        ctx.stroke();
        break;
    }

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ── Cursor icon drawing ───────────────────────────────────────────────────
// These are the small icons shown at the mouse cursor before clicking.

/** Draw the cursor icon for a given effect kind at (cx, cy). */
export function drawCursorIcon(ctx: CanvasRenderingContext2D, kind: EffectKind, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  switch (kind) {
    case 'rocket': {
      // Small rocket silhouette pointing up
      ctx.fillStyle = '#FF6B35';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-3, 2);
      ctx.lineTo(3, 2);
      ctx.lineTo(5, 0);
      ctx.closePath();
      ctx.fill();
      // Flame
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath();
      ctx.moveTo(-3, 2);
      ctx.lineTo(0, 6);
      ctx.lineTo(3, 2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'explosion': {
      // Spiky burst shape
      ctx.fillStyle = '#FF4444';
      drawStar(ctx, 0, 0, 10, 5, 6);
      ctx.fill();
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
      break;
    }
    case 'sparkle': {
      // 4-pointed star
      ctx.fillStyle = '#FFD700';
      drawStar(ctx, 0, 0, 11, 4, 4);
      ctx.fill();
      break;
    }
    case 'starburst': {
      // Diamond
      ctx.fillStyle = '#FF69B4';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'firework': {
      // Circle with ring
      ctx.strokeStyle = '#4FC3F7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}
