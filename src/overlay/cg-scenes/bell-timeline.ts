/**
 * 场景 21 bell 的时间轴纯函数：撞球飞入、波前上行、泛音环分层扩散。
 *
 * 全部写成纯函数有两个理由：
 * 1. 「按频率分层扩散」与「撞击后波沿钟身传播」是可验收的因果本体，
 *    验收直接对函数取值，不必绕过渲染层；
 * 2. 规避本项目的**稀疏 update 陷阱**——验收在稀疏 t 上调 update
 *    （一次跨几百毫秒），运行时每帧密集调用。凡按调用频率推进的
 *    状态（相位累加器）在两种模式下结果不同，且只有验收会红。
 *    这里一切都由场景时间轴 t 直接算出，两种调用密度下完全一致。
 */
import { BELL_WAVE_SPEED, partialAt } from './bell-partials';

/** 第一幕结束点（200/1200）。 */
export const BELL_ACT1_END = 200 / 1200;
/** 第二幕结束点（700/1200）。 */
export const BELL_ACT2_END = 700 / 1200;
/** 撞击时刻（整幕归一化）：撞球飞入占第一幕的大半。 */
export const STRIKE_AT = 150 / 1200;
/** 一圈泛音环从钟体扩到屏缘所需时长（整幕归一化，基频基准）。 */
export const RING_TRAVEL = 0.5;

/** 钟舌残影之间的时间间隔（整幕归一化）。 */
export const GHOST_SPACING = 0.028;

/**
 * 撞球飞入进度（0→1）。
 *
 * 摆动飞入：`1 − cos` 让**速度随时间递增**——重力摆的切向速度峰值
 * 出现在最低点，也就是撞击瞬间。写成 `sin` 会得到相反的减速段
 * （越接近钟体越慢），那是抛物线抛物而非摆动。
 * 撞击后返回 1（贴在钟面上）。
 */
export function strikerApproach(t: number): number {
  if (t >= STRIKE_AT) return 1;
  if (t <= 0) return 0;
  return 1 - Math.cos((t / STRIKE_AT) * (Math.PI / 2));
}

/**
 * 第 index 个分音的光环当前半径（UV 尺度）。
 *
 * 互动②「按频率分层扩散」的本体：
 * - **发出延时** = 该分音的 `layerLag`（∝ 1/频率比）：高分音的波前
 *   先离开钟体（振荡周期短），低分音后走；
 * - **扩散速度** ∝ 频率比的平方根：高频波前推得更快。
 *
 * 返回 -1 表示尚未发出或已越出画面——「环没发出就不该亮」因此是
 * 曲线自身的性质，不依赖调用方按顺序调用。
 */
export function partialRingRadius(t: number, index: number): number {
  const p = partialAt(index);
  const since = t - STRIKE_AT - p.layerLag;
  const travel = RING_TRAVEL / Math.sqrt(p.ratio);
  if (since < 0 || since > travel) return -1;
  // 0 → 0.8：贴片是 1.5 倍屏幕，UV 0.5 即屏缘，0.8 已远超屏缘。
  return (since / travel) * 0.8;
}

/**
 * 钟面弯曲波的波前高度（钟体 uv 尺度）。
 *
 * 互动①：撞击点在钟口附近，弯曲波沿钟体往上传。撞击前返回 -1
 * （波前尚在钟口以下，驻波层整层不可见）。
 */
export function bendingWaveFront(t: number): number {
  const since = t - STRIKE_AT;
  if (since <= 0) return -1;
  return Math.min(1.4, since * BELL_WAVE_SPEED * 0.012);
}

/**
 * 第 index 个分音的驻波时间相位。
 *
 * 由 t 直接算出而非累加：见本文件顶部的稀疏 update 说明。
 */
export function partialPhase(t: number, index: number): number {
  const since = t - STRIKE_AT;
  if (since <= 0) return 0;
  return since * partialAt(index).omega;
}
