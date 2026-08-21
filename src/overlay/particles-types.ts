/** 物理绑定速度向量：爆裂方向 = vx/vy，强度 = speed。缺失时调用方回退默认。 */
export type WhipVel = { vx: number; vy: number; speed: number; dir: number };

export type ParticleShape = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  hue: number;
  gravity: number;
  shape: ParticleShape;
  angle: number;
  /** Delay in seconds before the particle joins the simulation and render pass. */
  delay?: number;
  /** 附加数据：glyph 字符 / 环形半径 / 光束长度等 */
  data?: string | number;
};

export type ParticleRange = [number, number];

export type ParticleOptions = Partial<{
  decay: ParticleRange;
  size: ParticleRange;
  hue: ParticleRange;
  gravity: number;
  shape: ParticleShape;
  angleLo: number;
  angleHi: number;
}>;

/** 粒子工厂类型：所有发射原语统一签名（部分参数可选）。 */
export interface ParticleFactory {
  arcSweep(cx: number, cy: number, count: number, angA: number, angB: number, radius: number, o?: ParticleOptions): Particle[];
  parabola(cx: number, cy: number, count: number, dx: number, dz: number, o?: ParticleOptions): Particle[];
  shockRing(cx: number, cy: number, count: number, radiusLo: number, radiusHi: number, o?: ParticleOptions): Particle[];
  spiral(cx: number, cy: number, count: number, turns: number, radius: number, o?: ParticleOptions): Particle[];
  pillar(cx: number, cy: number, count: number, height: number, o?: ParticleOptions): Particle[];
  shards(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o?: ParticleOptions): Particle[];
  burst(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o?: ParticleOptions): Particle[];
  notes(cx: number, cy: number, count: number, o?: ParticleOptions): Particle[];
  ringWave(cx: number, cy: number, count: number, radius: number, speed: number, o?: ParticleOptions): Particle[];
  spark(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o?: ParticleOptions): Particle[];
  beam(cx: number, cy: number, count: number, length: number, o?: ParticleOptions): Particle[];
  flare(cx: number, cy: number, count: number, radius: number, o?: ParticleOptions): Particle[];
  glyph(cx: number, cy: number, count: number, chars: string[], o?: ParticleOptions): Particle[];
}

/** 默认 WhipVel：物理绑定缺失（测试/兜底）用水平中速。 */
export const DEFAULT_VEL: WhipVel = { vx: 1, vy: 0, speed: 1, dir: 0 };

/** 把任意速度向量归一化为 WhipVel（dir = 方位角）。 */
export function toWhipVel(vx: number, vy: number, speed: number): WhipVel {
  const magnitude = Math.hypot(vx, vy) || 1;
  return {
    vx: vx / magnitude,
    vy: vy / magnitude,
    speed,
    dir: Math.atan2(vy, vx),
  };
}
