/**
 * 场景 12 water 的纯标量数学：时间轴映射、柱体形态曲线、弹道闭式解。
 *
 * 从搭建/编排代码里分出来（同 ice-wind 的理由）：这些函数不碰 THREE、
 * 不碰 cannon、不改任何缓冲区，可被单独推理和验证；
 * 而 water-parts / water-droplets 的其余部分全是「逐帧改写对象状态」的副作用代码。
 * 两类混在一处，读者读不出哪部分是可信的数学基座。
 *
 * 关键设计：水珠轨迹用**闭式弹道**而非逐帧累加。场景 update 会被以任意 t 调用
 * （测试跳着调），累加式积分的结果依赖调用历史，同一 t 会画出不同的帧。
 * 闭式解让 t 唯一决定画面，同时满足 R-PERF-001 的确定性要求。
 */

/** 场景总时长（ms），三幕切点由它换算。 */
export const WATER_TOTAL_MS = 1200;
/** 第一幕结束点（250/1200）：涌起结束。 */
export const WATER_ACT1_END = 250 / WATER_TOTAL_MS;
/** 第二幕结束点（850/1200）：崩散结束。 */
export const WATER_ACT2_END = 850 / WATER_TOTAL_MS;
/**
 * 物理时间跨度（秒）：第二三幕的归一化进度线性映射到这段真实秒数。
 *
 * 物理量纲必须绑在秒上而不是绑在 t 上——重力是 px/s²，
 * 若直接拿 t 当时间，1200ms 的场景与 600ms 的场景会画出不同的抛物线。
 */
export const WATER_PHYSICS_SPAN_S = 1.6;
/** 一圈涟漪从生成到摊平的秒数。 */
export const WATER_RIPPLE_LIFE_S = 0.62;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 三幕幕内进度（各自 0→1）。本地实现以保持本模块零依赖。 */
export function waterActs(t: number): [number, number, number] {
  const a1 = clamp01(t / WATER_ACT1_END);
  const a2 = t <= WATER_ACT1_END
    ? 0
    : clamp01((t - WATER_ACT1_END) / (WATER_ACT2_END - WATER_ACT1_END));
  const a3 = t <= WATER_ACT2_END ? 0 : clamp01((t - WATER_ACT2_END) / (1 - WATER_ACT2_END));
  return [a1, a2, a3];
}

/** 归一化总进度 → 物理秒数（第一幕内恒为 0：水柱还没崩，无自由体）。 */
export function progressToTau(t: number): number {
  return clamp01((t - WATER_ACT1_END) / (1 - WATER_ACT1_END)) * WATER_PHYSICS_SPAN_S;
}

/** 物理秒数 → 归一化总进度（水珠出膛时要取当帧柱顶高度，需要反向映射）。 */
export function tauToProgress(tau: number): number {
  return WATER_ACT1_END + clamp01(tau / WATER_PHYSICS_SPAN_S) * (1 - WATER_ACT1_END);
}

/**
 * 水柱高度系数（0→1，乘以场景尺度得像素高度）。
 *
 * 三段形态即规格三幕，且**先涌起再崩散**——这是本场景签名与 downpour
 * 「雨帘」的分野：雨是从天而降的独立细线，水柱是从水面长出来的连续柱体，
 * 高度先单调增到峰值，再自顶端解体回落。
 *
 * - 涌起（act1）：`a1^0.62` 单调增，前段猛、后段收——水被顶起来时是减速的。
 * - 崩散（act2）：柱身溃落，乘一个单调减因子；水量转成水珠飞出去了。
 * - 静复（act3）：残柱抹平回水面。
 */
export function columnRise(t: number): number {
  const [a1, a2, a3] = waterActs(t);
  const surge = Math.pow(a1, 0.62);
  const collapse = 1 - Math.pow(a2, 1.35) * 0.82;
  const settle = 1 - a3 * 0.86;
  return surge * collapse * settle;
}

/** 柱体失稳程度（0→1）：分缕、变瘦、透明度衰减都挂在它上面。 */
export function columnBreak(t: number): number {
  const [, a2, a3] = waterActs(t);
  return Math.min(1, Math.pow(a2, 0.8) + a3 * 0.2);
}

/**
 * 弹道竖直位置的闭式解：y(s) = y0 + vy·s − ½g·s²。
 *
 * @param y0 出膛高度
 * @param vy 出膛竖直速度（向上为正）
 * @param g 重力加速度（正值，px/s²）
 * @param s 出膛后经过的秒数
 */
export function ballisticY(y0: number, vy: number, g: number, s: number): number {
  const k = Math.max(0, s);
  return y0 + vy * k - 0.5 * g * k * k;
}

/**
 * 触底时刻的闭式解：解 y(s) = targetY 的正根。
 *
 * 涟漪的启动时刻取自这里——它是**水珠自身弹道**的解，不是定时器：
 * 改重力、改出膛速度、改水面高度，触底时刻与涟漪起点会一起变。
 * 重力为 0（或永远到不了水面）时返回 Infinity：那颗水珠永不触底，
 * 挂在它上面的涟漪也就永不启动。
 *
 * @returns 出膛后到触底的秒数；永不触底时为 Infinity
 */
export function ballisticImpactTime(
  y0: number, vy: number, g: number, targetY: number,
): number {
  const drop = y0 - targetY;
  if (g <= 0) return Infinity;
  const disc = vy * vy + 2 * g * drop;
  if (disc <= 0) return Infinity;
  return (vy + Math.sqrt(disc)) / g;
}

/**
 * 涟漪半径（归一化 0→1）。
 *
 * 次线性（0.62 次幂）：浅水重力波的波前在展开中变慢，
 * 线性外扩看着像一个匀速放大的圆环贴图。
 *
 * @param elapsed 自触底起的秒数；负值表示还没被激起
 */
export function rippleRadius(elapsed: number): number {
  if (elapsed <= 0) return 0;
  return Math.min(1, Math.pow(elapsed / WATER_RIPPLE_LIFE_S, 0.62));
}

/** 伪随机：同一 (i, salt) 每次构建一致，水珠散布与卵石摆位因此可重现。 */
export function waterRand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}
