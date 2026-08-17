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
