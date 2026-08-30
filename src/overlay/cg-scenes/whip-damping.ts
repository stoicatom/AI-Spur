/**
 * 场景 37 bullwhip 的签名机制②：**阻尼摆动的指数衰减**（全库唯一）。
 *
 * 音爆之后鞭身不会立刻静止，而是绕甩出方向来回摆，幅度**指数**衰减。
 * 可测内涵是「连续几个摆动峰的幅度比恒定」——这是指数衰减的判别式：
 *
 *   |A(n+1)| / |A(n)| = exp(-Δs / τ)，与 n 无关。
 *
 * 线性递减（`1 - s/τ`）的相邻峰值比会随 n 变化（越往后比值越小），
 * 因此把衰减改成线性，这条断言立刻红。
 *
 * 与其他场景的分野：thunder 的余震、tornado 的气柱抖动都是**单向衰减包络**
 * （无过零摆动），本场景是**振荡 + 包络**的完整阻尼系统——摆动峰交替
 * 出现在两侧，且峰位可闭式解出。
 *
 * 末态：趋于静止但不突然归零。exp 永不到 0，幕末仍有约 1.5% 的残余摆幅，
 * 于是不会出现「鞭身某一帧突然定住」的断裂感。
 */

/** 衰减时间常数（秒）：每过 τ 幅度衰到 1/e。 */
export const DECAY_TAU_S = 0.17;

/** 摆动频率（Hz）：音爆后鞭身来回摆的快慢。 */
export const SWAY_HZ = 6.4;

/** 摆动峰值角幅（弧度）：音爆刚过时的最大偏摆。 */
export const SWAY_AMPLITUDE = 0.42;

const OMEGA = 2 * Math.PI * SWAY_HZ;

/**
 * 阻尼摆动的角偏移（弧度）。
 *
 * `s` 是**音爆之后**经过的秒数；s ≤ 0 时（音爆前）没有摆动。
 *
 * @param s 音爆后经过的秒数
 */
export function swayAngle(s: number): number {
  if (s <= 0) return 0;
  return SWAY_AMPLITUDE * Math.exp(-s / DECAY_TAU_S) * Math.sin(OMEGA * s);
}

/**
 * 衰减包络（不含振荡项）——摆动幅度的上界。
 *
 * @param s 音爆后经过的秒数
 */
export function swayEnvelope(s: number): number {
  if (s <= 0) return SWAY_AMPLITUDE;
  return SWAY_AMPLITUDE * Math.exp(-s / DECAY_TAU_S);
}

/**
 * 第 n 个摆动峰的时刻（秒，闭式解）。
 *
 * 对 `exp(-s/τ)·sin(ωs)` 求导置零得 `tan(ωs) = ωτ`，
 * 首峰在 `atan(ωτ)/ω`，之后每隔半周期出现一个（左右交替）。
 *
 * @param n 峰序（0 = 首峰）
 */
export function swayExtremumTime(n: number): number {
  return Math.atan(OMEGA * DECAY_TAU_S) / OMEGA + n / (2 * SWAY_HZ);
}

/**
 * 相邻摆动峰的幅度比（常数，指数衰减的特征值）。
 *
 * 摆动峰每隔半周期出现，故比值 = exp(-(1/(2f))/τ)，与峰序无关。
 */
export function swayDecayRatio(): number {
  return Math.exp(-1 / (2 * SWAY_HZ) / DECAY_TAU_S);
}
