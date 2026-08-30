/**
 * 场景 30 aurora 的签名机制：时空绸带。
 *
 * 与 dragon 的分界在**媒介**：dragon 是实体生物蜿蜒（身段有固定长度、
 * 关节间距守恒），极光是等离子体幕——它没有实体，带面的起伏是**沿带
 * 传播的行波**，可以任意拉伸、翻卷、局部增亮。
 *
 * 把带的中轴与起伏都写成纯函数，「翻卷」因此可以直接验收：
 * 同一相位点随时间沿带移动（行波），而不是整条带一起上下（驻波）。
 */

/** 带的采样段数：沿带取样，够画出多重翻卷。 */
export const RIBBON_SEGMENTS = 40;

/** 带面起伏的行波波数与相速（每幕跑过的相位）。 */
const WAVE_NUMBER = 3.1;
const PHASE_SPEED = 4.6;

/**
 * 带中轴在某处的高度（纯函数）。
 *
 * 中轴本身是一条缓弯：极光挂在磁层上，整体呈弧形。
 *
 * @param u 沿带的归一化位置（0=左端，1=右端）
 * @param height 画面高度
 */
export function ribbonAxisY(u: number, height: number): number {
  // 中央略高、两端垂下的缓弧。
  const arch = Math.sin(u * Math.PI);
  return height * (0.12 + arch * 0.14);
}

/**
 * 带面起伏量（纯函数，签名「翻卷」的可验收核心）。
 *
 * 这是**行波**：相位 = 空间项 − 时间项，因此同一相位点随时间沿带
 * 移动。若写成 `sin(kx)·sin(ωt)`（驻波），整条带会一起上下，
 * 波节永远不动——验收会红。
 *
 * @param u 沿带的归一化位置
 * @param t 整幕归一化进度
 */
export function ribbonFold(u: number, t: number): number {
  // 两列不同波数的行波叠加，让翻卷不至于呆板地周期重复。
  const a = Math.sin(u * Math.PI * 2 * WAVE_NUMBER - t * PHASE_SPEED * Math.PI * 2);
  const b = Math.sin(u * Math.PI * 2 * (WAVE_NUMBER * 0.57) - t * PHASE_SPEED * 0.8 * Math.PI * 2 + 1.7);
  return a * 0.62 + b * 0.38;
}

/**
 * 行波上某个固定相位的空间位置（纯函数）。
 *
 * 验收「行波而非驻波」用它：同一相位在不同时刻的 u 必须不同，
 * 且移动方向一致。
 *
 * @param phase 目标相位（弧度）
 * @param t 整幕归一化进度
 */
export function foldPhasePosition(phase: number, t: number): number {
  // 解 u·2π·k − t·speed·2π = phase 得 u。
  const u = (phase + t * PHASE_SPEED * Math.PI * 2) / (Math.PI * 2 * WAVE_NUMBER);
  // 落回 [0,1) 区间。
  return ((u % 1) + 1) % 1;
}

/** 爆发点在带上的位置（沿带归一化）。 */
export const BURST_U = 0.62;
/** 爆发时刻与持续时长（整幕归一化）。 */
export const BURST_AT = 0.5;
export const BURST_SPAN = 0.2;

/**
 * 爆发强度（纯函数，互动②的驱动量）。
 *
 * 整带亮度由它提升——爆发不发生，带就只有基础亮度。
 *
 * @param t 整幕归一化进度
 */
export function burstEnergy(t: number): number {
  const since = t - BURST_AT;
  if (since < 0 || since > BURST_SPAN) return 0;
  const k = since / BURST_SPAN;
  // 前 20% 骤亮、后 80% 缓落：极光爆发（substorm onset）的典型形态。
  return k < 0.2 ? k / 0.2 : Math.pow(1 - (k - 0.2) / 0.8, 1.6);
}

/**
 * 流光在带上的位置（纯函数）。
 *
 * 流光沿带**流动**（u 随时间推进）而非直线飞过——这是「沿带」的含义。
 * 每颗流光有自己的初始位置与速度。
 *
 * @param t 整幕归一化进度
 * @param u0 初始沿带位置
 * @param speed 流动速度（沿带位置/幕）
 */
export function glowFlowU(t: number, u0: number, speed: number): number {
  return ((u0 + t * speed) % 1 + 1) % 1;
}

/**
 * 带面在某处的**局部亮度**（互动①的因果本体，纯函数）。
 *
 * 流光照亮带面的**起伏峰**而非谷：亮度由 |fold| 与流光的接近度共同
 * 决定，所以「流光照亮峰谷」是两个量的乘积，不是各自一条曲线。
 *
 * @param u 沿带位置
 * @param t 整幕归一化进度
 * @param glowUs 全部流光的当前沿带位置
 */
export function ribbonLocalGain(u: number, t: number, glowUs: readonly number[]): number {
  // 起伏峰（|fold| 大处）更容易被点亮：等离子体密度在峰处高。
  const crest = Math.abs(ribbonFold(u, t));
  let near = 0;
  for (const gu of glowUs) {
    // 沿带的环形距离。
    const d = Math.min(Math.abs(u - gu), 1 - Math.abs(u - gu));
    near = Math.max(near, Math.max(0, 1 - d / 0.08));
  }
  return crest * near;
}
