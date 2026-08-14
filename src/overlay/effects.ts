/**
 * 12种预设特效 + 自定义特效系统
 *
 * 每种特效包含：
 * - 光标图标（drawCursorIcon）：热键后鼠标显示的矢量图形
 * - 粒子发射器（emitParticles）：点击后的爆炸动画
 * - 音效类型：对应音效文件的前缀
 */

export type EffectKind =
  | 'rocket'        // 火箭发射
  | 'explosion'     // 爆炸冲击
  | 'sparkle'       // 闪烁星光
  | 'starburst'     // 星芒绽放
  | 'firework'      // 烟花绽放
  | 'lightning'     // 闪电劈裂
  | 'butterfly'     // 蝴蝶飞舞
  | 'flower'        // 花朵绽放
  | 'snowflake'     // 雪花飘落
  | 'meteor'        // 流星划过
  | 'heart'         // 爱心飞出
  | 'spiral'        // 螺旋舞动
  | 'custom';       // 用户自定义

export const EFFECT_LIST: { kind: EffectKind; name: string; emoji: string }[] = [
  { kind: 'rocket', name: '火箭发射', emoji: '🚀' },
  { kind: 'explosion', name: '爆炸冲击', emoji: '💥' },
  { kind: 'sparkle', name: '闪烁星光', emoji: '✨' },
  { kind: 'starburst', name: '星芒绽放', emoji: '🌟' },
  { kind: 'firework', name: '烟花绽放', emoji: '🎆' },
  { kind: 'lightning', name: '闪电劈裂', emoji: '⚡' },
  { kind: 'butterfly', name: '蝴蝶飞舞', emoji: '🦋' },
  { kind: 'flower', name: '花朵绽放', emoji: '🌸' },
  { kind: 'snowflake', name: '雪花飘落', emoji: '❄️' },
  { kind: 'meteor', name: '流星划过', emoji: '🌠' },
  { kind: 'heart', name: '爱心飞出', emoji: '❤️' },
  { kind: 'spiral', name: '螺旋舞动', emoji: '🌀' },
];

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  size: number; color: string;
  gravity: number;
  rotation: number; rotSpeed: number;
  shape: 'circle' | 'square' | 'star' | 'line' | 'diamond' | 'heart' | 'hexagon';
}

export interface EffectState {
  kind: EffectKind;
  t0: number;
  alive: boolean;
  cx: number; cy: number;
  particles: Particle[];
}

// ── Utility ───────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    else ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  const topY = cy - size * 0.4;
  ctx.moveTo(cx, cy + size * 0.6);
  ctx.bezierCurveTo(cx - size, cy - size * 0.2, cx - size * 0.5, topY - size * 0.5, cx, topY);
  ctx.bezierCurveTo(cx + size * 0.5, topY - size * 0.5, cx + size, cy - size * 0.2, cx, cy + size * 0.6);
  ctx.closePath();
}

function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * TAU) / 6 - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    else ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
}

function drawButterfly(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  // Body
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 2, size * 0.6, 0, 0, TAU);
  ctx.fill();
  // Left wing
  ctx.fillStyle = 'hsl(280, 80%, 60%)';
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.6, cy - size * 0.3, size * 0.5, size * 0.7, -0.3, 0, TAU);
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.6, cy - size * 0.3, size * 0.5, size * 0.7, 0.3, 0, TAU);
  ctx.fill();
}

function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const petals = 6;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * TAU;
    const px = cx + Math.cos(angle) * size * 0.5;
    const py = cy + Math.sin(angle) * size * 0.5;
    ctx.fillStyle = `hsl(${330 + i * 15}, 80%, 70%)`;
    ctx.beginPath();
    ctx.ellipse(px, py, size * 0.35, size * 0.2, angle, 0, TAU);
    ctx.fill();
  }
  // Center
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.15, 0, TAU);
  ctx.fill();
}

function drawSnowflake(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.strokeStyle = '#E0F7FA';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const angle = (i * TAU) / 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
    ctx.stroke();
    // Branches
    const bx = cx + Math.cos(angle) * size * 0.6;
    const by = cy + Math.sin(angle) * size * 0.6;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(angle + 0.5) * size * 0.3, by + Math.sin(angle + 0.5) * size * 0.3);
    ctx.stroke();
  }
}

// ── Cursor Icons ──────────────────────────────────────────────────────────

export function drawCursorIcon(ctx: CanvasRenderingContext2D, kind: EffectKind, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  switch (kind) {
    case 'rocket':
      ctx.fillStyle = '#FF6B35';
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(-6, 0); ctx.lineTo(-4, 3); ctx.lineTo(4, 3); ctx.lineTo(6, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath();
      ctx.moveTo(-3, 3); ctx.lineTo(0, 8); ctx.lineTo(3, 3);
      ctx.closePath(); ctx.fill();
      break;

    case 'explosion':
      ctx.fillStyle = '#FF4444';
      drawStar(ctx, 0, 0, 12, 6, 8); ctx.fill();
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      break;

    case 'sparkle':
      ctx.fillStyle = '#FFD700';
      drawStar(ctx, 0, 0, 12, 4, 4); ctx.fill();
      break;

    case 'starburst':
      ctx.fillStyle = '#FF69B4';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(0, 12); ctx.lineTo(-7, 0);
      ctx.closePath(); ctx.fill();
      break;

    case 'firework':
      ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      break;

    case 'lightning':
      ctx.strokeStyle = '#FFEB3B'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3, -12); ctx.lineTo(2, -3); ctx.lineTo(-2, -2);
      ctx.lineTo(4, 8); ctx.lineTo(-1, 3); ctx.lineTo(3, 12);
      ctx.stroke();
      break;

    case 'butterfly':
      drawButterfly(ctx, 0, 0, 10);
      break;

    case 'flower':
      drawFlower(ctx, 0, 0, 10);
      break;

    case 'snowflake':
      drawSnowflake(ctx, 0, 0, 10);
      break;

    case 'meteor':
      ctx.fillStyle = '#FF8C00';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,0,0.6)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-15, 15); ctx.stroke();
      break;

    case 'heart':
      ctx.fillStyle = '#FF1744';
      drawHeart(ctx, 0, 0, 10); ctx.fill();
      break;

    case 'spiral':
      ctx.strokeStyle = '#7C4DFF'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 720; i++) {
        const angle = (i / 180) * Math.PI;
        const r = (i / 720) * 10;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;

    case 'custom':
      // Custom uses uploaded image — draw a default diamond
      ctx.fillStyle = '#9C27B0';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 12); ctx.lineTo(-8, 0);
      ctx.closePath(); ctx.fill();
      break;
  }

  ctx.restore();
}

// ── Particle Emitters ─────────────────────────────────────────────────────

function emitParticles(out: Particle[], cx: number, cy: number, kind: EffectKind) {
  switch (kind) {
    case 'rocket': {
      const hue = rand(20, 50);
      for (let i = 0; i < 50; i++) {
        const angle = rand(0, TAU), speed = rand(2, 10);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
          life: 1, decay: rand(0.015, 0.035), size: rand(2, 5), color: hsl(hue + rand(-10, 10), 100, rand(50, 70)),
          gravity: 0.12, rotation: 0, rotSpeed: rand(-3, 3), shape: 'circle' });
      }
      break;
    }
    case 'explosion': {
      for (let i = 0; i < 80; i++) {
        const angle = rand(0, TAU), speed = rand(3, 14);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: rand(0.01, 0.03), size: rand(1.5, 4), color: hsl(rand(0, 40), 100, rand(45, 70)),
          gravity: 0.1, rotation: rand(0, 360), rotSpeed: rand(-4, 4), shape: i % 3 === 0 ? 'square' : 'circle' });
      }
      break;
    }
    case 'sparkle': {
      for (let i = 0; i < 40; i++) {
        const angle = rand(0, TAU), speed = rand(1, 6);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
          life: 1, decay: rand(0.01, 0.02), size: rand(1, 3), color: hsl(rand(45, 65), 100, rand(75, 95)),
          gravity: -0.04, rotation: rand(0, 360), rotSpeed: rand(-2, 2), shape: 'star' });
      }
      break;
    }
    case 'starburst': {
      for (let arm = 0; arm < 8; arm++) {
        const base = (arm / 8) * TAU;
        for (let j = 0; j < 8; j++) {
          const angle = base + rand(-0.15, 0.15), speed = rand(4, 12) * (1 - j / 10);
          out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 1, decay: rand(0.015, 0.03), size: rand(2, 5), color: hsl((arm * 45) % 360, 100, 60),
            gravity: 0.06, rotation: (angle * 180) / Math.PI, rotSpeed: 0, shape: 'line' });
        }
      }
      break;
    }
    case 'firework': {
      const palette = [hsl(350, 100, 60), hsl(20, 100, 55), hsl(45, 100, 65), hsl(60, 100, 70)];
      for (let i = 0; i < 60; i++) {
        const angle = rand(0, TAU), speed = rand(2, 12);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: rand(0.012, 0.028), size: rand(1.5, 3.5), color: palette[i % palette.length],
          gravity: 0.08, rotation: rand(0, 360), rotSpeed: 0, shape: i % 5 === 0 ? 'star' : 'circle' });
      }
      break;
    }
    case 'lightning': {
      for (let i = 0; i < 60; i++) {
        const angle = rand(0, TAU), speed = rand(1, 8);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: rand(0.02, 0.05), size: rand(1, 3), color: hsl(55, 100, rand(60, 90)),
          gravity: 0.05, rotation: rand(0, 360), rotSpeed: rand(-10, 10), shape: 'line' });
      }
      break;
    }
    case 'butterfly': {
      for (let i = 0; i < 20; i++) {
        const angle = rand(0, TAU), speed = rand(0.5, 3);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
          life: 1, decay: rand(0.005, 0.01), size: rand(3, 6), color: hsl(rand(260, 320), 80, rand(50, 80)),
          gravity: -0.02, rotation: rand(0, 360), rotSpeed: rand(-2, 2), shape: 'diamond' });
      }
      break;
    }
    case 'flower': {
      for (let i = 0; i < 30; i++) {
        const angle = rand(0, TAU), speed = rand(0.5, 4);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
          life: 1, decay: rand(0.008, 0.015), size: rand(3, 7), color: hsl(rand(300, 360), 80, rand(60, 85)),
          gravity: -0.03, rotation: rand(0, 360), rotSpeed: rand(-1, 1), shape: 'circle' });
      }
      break;
    }
    case 'snowflake': {
      for (let i = 0; i < 50; i++) {
        const angle = rand(-0.5, 0.5) + Math.PI / 2, speed = rand(0.5, 3);
        out.push({ x: cx + rand(-60, 60), y: cy + rand(-40, 0),
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: rand(0.004, 0.008), size: rand(2, 5), color: hsl(195, 70, rand(80, 95)),
          gravity: 0.02, rotation: rand(0, 360), rotSpeed: rand(-1, 1), shape: 'hexagon' });
      }
      break;
    }
    case 'meteor': {
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        out.push({ x: cx - t * 100, y: cy + t * 100,
          vx: rand(-1, 1), vy: rand(-0.5, 0.5),
          life: 1 - t * 0.5, decay: rand(0.01, 0.02), size: rand(1, 4), color: hsl(rand(20, 40), 100, rand(50, 80)),
          gravity: 0, rotation: 0, rotSpeed: 0, shape: 'circle' });
      }
      break;
    }
    case 'heart': {
      for (let i = 0; i < 25; i++) {
        const angle = rand(0, TAU), speed = rand(1, 5);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
          life: 1, decay: rand(0.008, 0.015), size: rand(3, 7), color: hsl(rand(340, 360), 100, rand(50, 70)),
          gravity: -0.03, rotation: rand(0, 360), rotSpeed: rand(-1, 1), shape: 'heart' });
      }
      break;
    }
    case 'spiral': {
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * TAU * 3, r = (i / 40) * 50;
        out.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
          vx: Math.cos(angle + Math.PI / 2) * 2, vy: Math.sin(angle + Math.PI / 2) * 2,
          life: 1, decay: rand(0.008, 0.015), size: rand(1.5, 3), color: hsl(rand(250, 280), 100, rand(60, 80)),
          gravity: 0, rotation: rand(0, 360), rotSpeed: rand(-3, 3), shape: 'circle' });
      }
      break;
    }
    case 'custom': {
      // Fallback for custom effects without uploaded assets
      for (let i = 0; i < 40; i++) {
        const angle = rand(0, TAU), speed = rand(2, 10);
        out.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: rand(0.01, 0.03), size: rand(2, 5), color: hsl(rand(0, 360), 100, rand(50, 70)),
          gravity: 0.1, rotation: rand(0, 360), rotSpeed: rand(-3, 3), shape: 'star' });
      }
      break;
    }
  }
}

// ── Create / Update / Draw ────────────────────────────────────────────────

export function createEffect(kind: EffectKind, cx: number, cy: number): EffectState {
  return { kind, t0: performance.now(), alive: true, cx, cy, particles: [] };
}

export function updateEffect(effect: EffectState, now: number): void {
  if (!effect.alive) return;

  if (effect.particles.length === 0) {
    emitParticles(effect.particles, effect.cx, effect.cy, effect.kind);
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
        ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fill();
        break;
      case 'square':
        ctx.fillStyle = p.color;
        ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
        break;
      case 'star':
        ctx.fillStyle = p.color;
        drawStar(ctx, 0, 0, sz, sz * 0.4, 4); ctx.fill();
        break;
      case 'line':
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.beginPath(); ctx.moveTo(-sz * 2, 0); ctx.lineTo(sz * 2, 0); ctx.stroke();
        break;
      case 'diamond':
        ctx.fillStyle = p.color;
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.6, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.6, 0);
        ctx.closePath(); ctx.fill();
        break;
      case 'heart':
        ctx.fillStyle = p.color;
        drawHeart(ctx, 0, 0, sz); ctx.fill();
        break;
      case 'hexagon':
        ctx.fillStyle = p.color;
        drawHexagon(ctx, 0, 0, sz); ctx.fill();
        break;
    }

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
