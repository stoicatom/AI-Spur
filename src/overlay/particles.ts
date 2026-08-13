/**
 * Particle system for visual effects on the whip overlay.
 *
 * Emits and animates particles (sparks, stars, lightning) driven by the
 * `particleEffect` field in skin manifests. Uses an object pool to avoid
 * allocations during animation.
 */

export type ParticleType = 'sparks' | 'stars' | 'lightning';

interface Particle {
  x: number;
  y: number;
  vx: number; // velocity pixels/frame
  vy: number;
  life: number; // 0..1, decays over time (1 = just born, 0 = dead)
  maxLife: number; // frames until death
  age: number; // frames since birth
  type: ParticleType;
  color: string; // hex color for rendering
}

/**
 * Manages a pool of reusable particles. Emits bursts on demand and updates
 * all active particles each frame.
 */
export class ParticleSystem {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private readonly poolSize = 200;
  private readonly gravity = 0.3; // pixels/frame²

  constructor() {
    // Pre-allocate particle pool
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      age: 0,
      type: 'sparks',
      color: '#ff6b35',
    };
  }

  /**
   * Emit a burst of particles at the given position.
   *
   * @param x - X coordinate (canvas space)
   * @param y - Y coordinate (canvas space)
   * @param type - Particle effect type
   * @param count - Number of particles to emit (clamped to available pool)
   * @param color - Hex color for the particles
   */
  emit(x: number, y: number, type: ParticleType, count: number, color: string = '#ff6b35'): void {
    const available = Math.min(count, this.pool.length);
    for (let i = 0; i < available; i++) {
      const p = this.pool.pop()!;
      this.initParticle(p, x, y, type, color);
      this.active.push(p);
    }
  }

  private initParticle(p: Particle, x: number, y: number, type: ParticleType, color: string): void {
    p.x = x;
    p.y = y;
    p.type = type;
    p.color = color;
    p.age = 0;

    switch (type) {
      case 'sparks': {
        // Emit sparks in random directions, slight upward bias
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 1; // upward bias
        p.maxLife = 15 + Math.random() * 15; // 15-30 frames (~0.25-0.5s at 60fps)
        p.life = 1;
        break;
      }
      case 'stars': {
        // Stars drift slowly with rotation
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = (Math.random() - 0.5) * 0.5;
        p.maxLife = 30 + Math.random() * 30; // 30-60 frames
        p.life = 1;
        break;
      }
      case 'lightning': {
        // Lightning traces along the whip path (simplified: linear fade)
        p.vx = 0;
        p.vy = 0;
        p.maxLife = 6 + Math.random() * 6; // 6-12 frames (~0.1-0.2s)
        p.life = 1;
        break;
      }
    }
  }

  /**
   * Update all active particles. Called once per frame in the RAF loop.
   *
   * @param dt - Delta time in seconds (unused for now, assumes 60fps)
   */
  update(_dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age++;
      p.life = Math.max(0, 1 - p.age / p.maxLife);

      if (p.life <= 0) {
        // Return to pool
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }

      // Physics update
      p.x += p.vx;
      p.y += p.vy;

      if (p.type === 'sparks') {
        p.vy += this.gravity; // apply gravity to sparks
      }
    }
  }

  /**
   * Render all active particles to the canvas.
   *
   * @param ctx - Canvas 2D context
   */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.active) {
      const alpha = p.life; // fade out as life decays
      ctx.globalAlpha = alpha;

      switch (p.type) {
        case 'sparks': {
          // Draw as short line segments (motion trail)
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
          ctx.stroke();
          break;
        }
        case 'stars': {
          // Draw as 4-pointed star
          this.drawStar(ctx, p.x, p.y, 3, p.color);
          break;
        }
        case 'lightning': {
          // Draw as glowing circle (placeholder for jagged line)
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }

    ctx.globalAlpha = 1; // reset
  }

  private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    // 4-pointed star (diamond + cross)
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.3);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.3);
    ctx.lineTo(cx - r, cy);
    ctx.lineTo(cx - r * 0.3, cy - r * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  /** Returns the number of currently active particles. */
  get activeCount(): number {
    return this.active.length;
  }

  /** Clear all active particles (useful for hot reload). */
  clear(): void {
    this.pool.push(...this.active);
    this.active.length = 0;
  }
}
