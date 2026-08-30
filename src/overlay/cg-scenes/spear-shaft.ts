/**
 * 场景 27 spear 的杆身驻波与尘云撕裂：两组纯标量数学。
 *
 * 与 spear-flight（弹道与螺旋速率）分家的理由不只是 250 行上限：
 * 那边描述**矛与气流怎么走**，这里描述**被它们激励的介质怎么形变**。
 * 两者的验收方式也不同——前者查曲线形状（加速/收束/断裂），
 * 后者查物理约束（驻波端点为零、裂口不可逆）。
 */
import { HIT_AT, LAUNCH_END } from './spear-flight';

/** 杆身驻波角频率（rad / 归一化幕）。 */
export const SHAFT_OMEGA = 118;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 杆身振铃包络（纯函数）：掷出激励一次，命中**再激励**一次且更强更久。
 *
 * 离手前为 0——不掷不震，这让「震动」是被激励出来的而不是自跑的定时器。
 */
export function shaftRing(t: number): number {
  let amp = 0;
  const sinceLaunch = t - LAUNCH_END;
  if (sinceLaunch >= 0) amp = Math.exp(-sinceLaunch * 9);
  const sinceHit = t - HIT_AT;
  if (sinceHit >= 0) amp = Math.max(amp, Math.exp(-sinceHit * 6.5));
  return amp;
}

/**
 * 杆上某点的横向位移（纯函数，规格元素⑤「杆身驻波」）。
 *
 * **两端固定**的驻波：位移 = 包络 × Σ sin(nπx) × cos(ωt)。
 * 端点恒为零是物理约束——枪头与尾镦的集中质量就是两个波节，
 * 杆身在它们之间做弯曲振动。基频与二次谐波叠加，避免单一正弦的塑料感。
 *
 * @param x 沿杆归一化位置（0 = 枪头端，1 = 尾镦端）
 * @param t 整幕归一化进度
 */
export function shaftDisplacement(x: number, t: number): number {
  const env = shaftRing(t);
  if (env <= 0) return 0;
  const xx = clamp01(x);
  const mode = Math.sin(Math.PI * xx) * 0.72 + Math.sin(2 * Math.PI * xx) * 0.28;
  return env * mode * Math.cos(t * SHAFT_OMEGA);
}

/**
 * 尘云被撕开的裂口宽度（纯函数）。
 *
 * 与 bow 的云缝**相反**：这里撕开后**永不愈合**、只会越撕越宽
 * （气流把云推得更开）。bow 的签名是可逆形变，spear 的尘云是不可逆的。
 *
 * @param t 整幕归一化进度
 * @param passAt 矛经过该处的时刻
 */
export function tearWidth(t: number, passAt: number): number {
  const since = t - passAt;
  if (since < 0) return 0;
  return (1 - Math.exp(-since / 0.055)) * (1 + since * 0.8);
}
