/** 物理绑定速度向量：爆裂方向 = vx/vy，强度 = speed。缺失时调用方回退默认。 */
export type WhipVel = { vx: number; vy: number; speed: number; dir: number };

export type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  size: number; hue: number;
  gravity: number;
  shape: 0 | 1 | 2;   // 0=dot 1=streak 2=shard
  angle: number;
};

/**
 * 52 素材 → 专属主题色相。来自 spec §4/§5 逐素材色相。
 * 索引缺失：本轮选中的素材必须在此注册；未知回退 28。
 */
export const MATERIAL_HUE: Record<string, number> = {
  whip: 28, classic: 205, rocket: 26, lightning: 55, flame: 20,
  star: 45, meteor: 30, skull: 90, crown: 45, sword: 204,
  bow: 33, shield: 215, bomb: 15, hammer: 220, scepter: 285,
  amulet: 270, dagger: 200, boomerang: 25, spear: 200, axe: 210,
  scythe: 280, trident: 205, flail: 20, chakram: 215, halberd: 210,
  slingshot: 25, blowgun: 120, tessen: 30, chain: 220, wind: 175,
  snow: 210, rain: 215, water: 205, tornado: 185, aurora: 140,
  earthquake: 25, volcano: 20, guitar: 35, drum: 25, bell: 40,
  horn: 48, flute: 195, harp: 45, football: 110, tennis: 80,
  boxing: 0, fireworks: 350, crystal: 270, bamboo: 110, lotus: 310,
  dragonfly: 140,
  archery: 350,
};

/** 默认 WhipVel：物理绑定缺失时（测试/兜底）用水平中速。 */
export const DEFAULT_VEL: WhipVel = { vx: 1, vy: 0, speed: 1, dir: 0 };

/** 冲击增强全局参数（spec §6）。 */
export const IMPACT = {
  maxPx: 96,                                  // 精灵基座最长边（原 56 → 96）
  ringRadius(speed: number): number {         // 光环扩散半径 ∝ 速度
    return 90 + speed * 70;                   // 慢 ≈160，快 ≈300
  },
  flashAlpha(speed: number): number {         // 中心闪光强度 ∝ 速度
    return Math.min(1, 0.5 + speed * 0.16);
  },
};

/** 把任意速度向量归一化为 WhipVel（dir = 方位角）。 */
export function toWhipVel(vx: number, vy: number, speed: number): WhipVel {
  const m = Math.hypot(vx, vy) || 1;
  return { vx: vx / m, vy: vy / m, speed, dir: Math.atan2(vy, vx) };
}

// ============================================================================
// 粒子发射原语库
// ============================================================================

const TAU = Math.PI * 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** 粒子参数常量：统一管理速度、衰减、尺寸等 magic numbers */
const PARTICLE_PARAMS = {
  // 速度范围
  SPEED: {
    ARC_SWEEP: { min: 5, max: 12 },
    PARABOLA: { min: 1, max: 3 },
    SHOCK_RING: { min: 3, max: 8 },
    SHOCK_RING_WITH_GRAVITY: 3,
    SPIRAL: 2,
    PILLAR_BASE: 2,
    PILLAR_MULTIPLIER: 3,
    NOTES: 3,
  },
  // 衰减率范围
  DECAY: {
    DOT: { min: 0.015, max: 0.028 },
    SHARD: { min: 0.02, max: 0.035 },
    SHOCK_RING: { min: 0.012, max: 0.02 },
    SPIRAL: { min: 0.018, max: 0.03 },
    NOTES: { min: 0.015, max: 0.025 },
  },
  // 尺寸范围
  SIZE: {
    DEFAULT: { min: 2, max: 5 },
    SHOCK_RING: { min: 3, max: 7 },
    SPIRAL: { min: 2, max: 4 },
    NOTES: { min: 3, max: 6 },
  },
  // 重力值
  GRAVITY: {
    DOT: 0.05,
    SHARD: 0.1,
    PARABOLA: 0.05,
    PILLAR: -0.03,
    NOTES: 0.08,
    NONE: 0,
  },
  // 角度偏移
  ANGLE: {
    BURST_JITTER: { min: -0.15, max: 0.15 },
  },
  // 几何参数
  GEOMETRY: {
    PILLAR_SPREAD: 20,
    PILLAR_SIZE_BASE: 0.6,
    PARABOLA_Y_MULT: 2,
    PARABOLA_Y_OFFSET: 0.3,
    NOTES_WIDTH: 160,
    NOTES_HEIGHT: 40,
    NOTES_JITTER: { min: -4, max: 4 },
    PILLAR_VX_RANGE: { min: -1, max: 1 },
  },
};

type Opts = Partial<{ decay:[number,number]; size:[number,number]; hue:[number,number]; gravity:number; shape:0|1|2; angleLo:number; angleHi:number }>;
function base(shape: 0|1|2): { decay:[number,number]; size:[number,number]; gravity:number } {
  return shape === 2
    ? { decay:[PARTICLE_PARAMS.DECAY.SHARD.min, PARTICLE_PARAMS.DECAY.SHARD.max], size:[PARTICLE_PARAMS.SIZE.DEFAULT.min, PARTICLE_PARAMS.SIZE.DEFAULT.max], gravity: PARTICLE_PARAMS.GRAVITY.SHARD }
    : { decay:[PARTICLE_PARAMS.DECAY.DOT.min, PARTICLE_PARAMS.DECAY.DOT.max], size:[PARTICLE_PARAMS.SIZE.DEFAULT.min, PARTICLE_PARAMS.SIZE.DEFAULT.max], gravity: PARTICLE_PARAMS.GRAVITY.DOT };
}

export const P = {
  /** 弧线残影：沿 cx,cy 起点的角 A→B 半径 radius 的弧布点，速度沿切线。 */
  arcSweep(cx: number, cy: number, count: number, angA: number, angB: number, radius: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const d = base(o.shape ?? 1);
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const ang = angA + (angB - angA) * f;
      const r = radius * f * f;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const tan = ang + Math.PI / 2;
      const sp = rand(PARTICLE_PARAMS.SPEED.ARC_SWEEP.min, PARTICLE_PARAMS.SPEED.ARC_SWEEP.max);
      out.push({ x, y, vx: Math.cos(tan) * sp, vy: Math.sin(tan) * sp,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? d.gravity, shape: o.shape ?? 1, angle: tan });
    }
    return out;
  },

  /** 抛物线：count 点沿弧线分布（x 展宽 dx，y 拱起 dz）。 */
  parabola(cx: number, cy: number, count: number, dx: number, dz: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const d = base(o.shape ?? 1);
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + f * dx;
      const y = cy - Math.sin(f * Math.PI) * dz;
      const sp = rand(PARTICLE_PARAMS.SPEED.PARABOLA.min, PARTICLE_PARAMS.SPEED.PARABOLA.max);
      out.push({ x, y, vx: sp, vy: (Math.cos(f * Math.PI) - PARTICLE_PARAMS.GEOMETRY.PARABOLA_Y_OFFSET) * PARTICLE_PARAMS.GEOMETRY.PARABOLA_Y_MULT,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? PARTICLE_PARAMS.GRAVITY.PARABOLA, shape: o.shape ?? 1, angle: 0 });
    }
    return out;
  },

  /** 扩散圆环：一圈 streak 垂直半径方向，模拟冲击波。 */
  shockRing(cx: number, cy: number, count: number, radiusLo: number, radiusHi: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU;
      const r = rand(radiusLo, radiusHi);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const sp = (o.gravity ?? PARTICLE_PARAMS.GRAVITY.NONE) === PARTICLE_PARAMS.GRAVITY.NONE
        ? rand(PARTICLE_PARAMS.SPEED.SHOCK_RING.min, PARTICLE_PARAMS.SPEED.SHOCK_RING.max)
        : PARTICLE_PARAMS.SPEED.SHOCK_RING_WITH_GRAVITY;
      out.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(PARTICLE_PARAMS.DECAY.SHOCK_RING.min, PARTICLE_PARAMS.DECAY.SHOCK_RING.max),
        size: rand(PARTICLE_PARAMS.SIZE.SHOCK_RING.min, PARTICLE_PARAMS.SIZE.SHOCK_RING.max),
        hue: rand(...hue), gravity: o.gravity ?? PARTICLE_PARAMS.GRAVITY.NONE, shape: 1, angle: ang + Math.PI / 2 });
    }
    return out;
  },

  /** 螺旋：turns 圈从中心旋出。 */
  spiral(cx: number, cy: number, count: number, turns: number, radius: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const ang = f * turns * TAU;
      const r = radius * f;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const tan = ang + Math.PI / 2;
      out.push({ x, y, vx: Math.cos(tan) * PARTICLE_PARAMS.SPEED.SPIRAL, vy: Math.sin(tan) * PARTICLE_PARAMS.SPEED.SPIRAL,
        life: 1, decay: rand(PARTICLE_PARAMS.DECAY.SPIRAL.min, PARTICLE_PARAMS.DECAY.SPIRAL.max),
        size: rand(PARTICLE_PARAMS.SIZE.SPIRAL.min, PARTICLE_PARAMS.SIZE.SPIRAL.max),
        hue: rand(...hue), gravity: o.gravity ?? PARTICLE_PARAMS.GRAVITY.NONE, shape: 1, angle: tan });
    }
    return out;
  },

  /** 竖直光柱/腾升：由下往上，越靠上越散。 */
  pillar(cx: number, cy: number, count: number, height: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + rand(PARTICLE_PARAMS.GEOMETRY.PILLAR_VX_RANGE.min, PARTICLE_PARAMS.GEOMETRY.PILLAR_VX_RANGE.max) * f * PARTICLE_PARAMS.GEOMETRY.PILLAR_SPREAD;
      const y = cy - f * height;
      out.push({ x, y, vx: rand(PARTICLE_PARAMS.GEOMETRY.PILLAR_VX_RANGE.min, PARTICLE_PARAMS.GEOMETRY.PILLAR_VX_RANGE.max) * f, vy: -PARTICLE_PARAMS.SPEED.PILLAR_BASE - f * PARTICLE_PARAMS.SPEED.PILLAR_MULTIPLIER,
        life: 1, decay: rand(PARTICLE_PARAMS.DECAY.SHARD.min, PARTICLE_PARAMS.DECAY.SHARD.max),
        size: rand(PARTICLE_PARAMS.SIZE.DEFAULT.min, PARTICLE_PARAMS.SIZE.DEFAULT.max) * (PARTICLE_PARAMS.GEOMETRY.PILLAR_SIZE_BASE + f),
        hue: rand(...hue), gravity: PARTICLE_PARAMS.GRAVITY.PILLAR, shape: o.shape ?? 0, angle: 0 });
    }
    return out;
  },

  /** 碎屑四散：shard 为主，受明显重力。 */
  shards(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o: Opts = {}): Particle[] {
    return P.burst(cx, cy, count, speedLo, speedHi, { ...o, shape: o.shape ?? 2 });
  },

  /** 点状爆散：dot 均匀四散。 */
  burst(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const d = base(o.shape ?? 0);
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU + rand(PARTICLE_PARAMS.ANGLE.BURST_JITTER.min, PARTICLE_PARAMS.ANGLE.BURST_JITTER.max);
      const sp = rand(speedLo, speedHi);
      out.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? d.gravity, shape: o.shape ?? 0, angle: ang });
    }
    return out;
  },

  /** 音符：小方块(?即 shard)排成一行弹跳曲线，供乐器素材使用。 */
  notes(cx: number, cy: number, count: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + f * PARTICLE_PARAMS.GEOMETRY.NOTES_WIDTH + rand(PARTICLE_PARAMS.GEOMETRY.NOTES_JITTER.min, PARTICLE_PARAMS.GEOMETRY.NOTES_JITTER.max);
      const y = cy - Math.abs(Math.sin(f * Math.PI * 2)) * PARTICLE_PARAMS.GEOMETRY.NOTES_HEIGHT;
      out.push({ x, y, vx: PARTICLE_PARAMS.SPEED.NOTES, vy: -Math.cos(f * Math.PI * 2) * PARTICLE_PARAMS.SPEED.PILLAR_BASE,
        life: 1, decay: rand(PARTICLE_PARAMS.DECAY.NOTES.min, PARTICLE_PARAMS.DECAY.NOTES.max),
        size: rand(PARTICLE_PARAMS.SIZE.NOTES.min, PARTICLE_PARAMS.SIZE.NOTES.max),
        hue: rand(...hue), gravity: PARTICLE_PARAMS.GRAVITY.NOTES, shape: 2, angle: 0 });
    }
    return out;
  },
};

/** 绘制横切的冲击光环 + 中心闪光。全屏覆盖，方向无关，只随速度缩放。 */
export function drawImpact(ctx: CanvasRenderingContext2D, _now: number, cx: number, cy: number, vel: WhipVel, t: number): void {
  if (t >= 0.35) return;                       // 冲击只在起爆前半程
  const R = IMPACT.ringRadius(vel.speed);
  const ease = t / 0.35;
  const r = ease * R;
  const alpha = (1 - ease) * 0.55;
  const hue = 42;                              // 暖金冲击光（与素材 hue 不同源，横切全局）

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `hsl(${hue},100%,66%)`;
  ctx.lineWidth = 6 * (1 - ease) + 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();

  // 中心闪光：起爆 0–0.15 最亮，之后衰减
  if (t < 0.15) {
    const fa = IMPACT.flashAlpha(vel.speed) * (1 - t / 0.15);
    ctx.globalAlpha = fa;
    ctx.fillStyle = '#FFF6D8';
    ctx.beginPath();
    ctx.arc(cx, cy, 26 * (1 - t / 0.15) + 8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
