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
  slingshot: 25, blowgun: 120, tessen: 30, chain: 220, wind: 200,
  snow: 210, rain: 215, water: 205, tornado: 185, aurora: 140,
  earthquake: 25, volcano: 20, guitar: 35, drum: 25, bell: 40,
  horn: 48, flute: 195, harp: 45, football: 110, tennis: 80,
  boxing: 0, fireworks: 350, crystal: 270, bamboo: 110, lotus: 310,
  dragonfly: 140,
  archery: 33,  // 并入 bow（spec 决策1），与 bow 共用色相
};

/** 默认 WhipVel：物理绑定缺失时（测试/兜底）用水平中速。 */
export const DEFAULT_VEL: WhipVel = { vx: 1, vy: 0, speed: 1, dir: 0 };

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

type Opts = Partial<{ decay:[number,number]; size:[number,number]; hue:[number,number]; gravity:number; shape:0|1|2; angleLo:number; angleHi:number }>;
function base(shape: 0|1|2): { decay:[number,number]; size:[number,number]; gravity:number } {
  return shape === 2
    ? { decay:[0.02,0.035], size:[2,5], gravity:0.1 }
    : { decay:[0.015,0.028], size:[2,5], gravity:0.05 };
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
      const sp = rand(5, 12);
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
      const sp = rand(1, 3);
      out.push({ x, y, vx: sp, vy: (Math.cos(f * Math.PI) - 0.3) * 2,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? 0.05, shape: o.shape ?? 1, angle: 0 });
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
      const sp = (o.gravity ?? 0) === 0 ? rand(3, 8) : 3;
      out.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(0.012, 0.02), size: rand(3, 7),
        hue: rand(...hue), gravity: o.gravity ?? 0, shape: 1, angle: ang + Math.PI / 2 });
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
      out.push({ x, y, vx: Math.cos(tan) * 2, vy: Math.sin(tan) * 2,
        life: 1, decay: rand(0.018, 0.03), size: rand(2, 4),
        hue: rand(...hue), gravity: o.gravity ?? 0, shape: 1, angle: tan });
    }
    return out;
  },

  /** 竖直光柱/腾升：由下往上，越靠上越散。 */
  pillar(cx: number, cy: number, count: number, height: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + rand(-1, 1) * f * 20;
      const y = cy - f * height;
      out.push({ x, y, vx: rand(-1, 1) * f, vy: -2 - f * 3,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 5) * (0.6 + f),
        hue: rand(...hue), gravity: -0.03, shape: o.shape ?? 0, angle: 0 });
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
      const ang = (i / count) * TAU + rand(-0.15, 0.15);
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
      const x = cx + f * 160 + rand(-4, 4);
      const y = cy - Math.abs(Math.sin(f * Math.PI * 2)) * 40;
      out.push({ x, y, vx: 3, vy: -Math.cos(f * Math.PI * 2) * 2,
        life: 1, decay: rand(0.015, 0.025), size: rand(3, 6),
        hue: rand(...hue), gravity: 0.08, shape: 2, angle: 0 });
    }
    return out;
  },
};
