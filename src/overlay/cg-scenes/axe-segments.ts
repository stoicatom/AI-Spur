/**
 * 场景 26 axe 的**分离后木段运动学**：张开、翻滚、断口发光、松脂星点
 * （纯标量数学，不碰 THREE 对象）。
 *
 * 本模块的四条曲线共用同一个时间原点：`segmentSplitAt(i)`——**每段各自的
 * 分离时刻**，而不是一个全局时刻。这是签名「原木分段分离」落到可观测量上
 * 的地方：六段的张开、翻滚、断口亮、松脂渗出各自错峰，读得出是一条裂纹
 * **依次**窜过整根木料；若共用一个全局原点，就退化成「整根一起断一下」，
 * 与任何碎裂场景无从区分。
 *
 * 与 katana（场景 06，切面滑过）的分野在 `segmentOpen` 上落到位移方向：
 * 布被切开后沿**切向**（斩击轴方向）滑走，劈开的木段沿**法向**（垂直于
 * 裂纹推进方向）被楔子推开。
 */
import { AXE_SEGMENT_COUNT, segmentSeat, segmentSplitAt } from './axe-split';

/** 张开速率（原木厚度/幕）：楔力把两半推开的匀速分量。 */
const OPEN_KICK = 1.55;
/** 张开速率随轴距的衰减：近端吃到的楔力更足，开得更快。 */
const OPEN_FALLOFF = 0.45;
/** 自由段重力（原木厚度/幕²）：脱离木料的木段开始下坠。 */
const OPEN_GRAVITY = 7;
/** 翻滚速率（弧度/幕）：近端翻得更急，同源于楔力的轴向衰减。 */
const SPIN_RATE = 3.4;

/** 断口发光的上冲时长（归一化幕）：14ms，纤维撕断是一瞬。 */
const GLOW_RISE_T = 0.012;
/** 断口发光的衰减常数：热与新鲜纤维的荧光都退得快。 */
const GLOW_TAU = 0.16;

/** 松脂渗出的滞后（归一化幕）：42ms 后才在断面上聚成亮点。 */
const RESIN_LAG_T = 0.035;
/** 松脂星点的上冲时长：比断口发光钝得多，液体聚拢需要时间。 */
const RESIN_RISE_T = 0.05;
/** 松脂星点的衰减常数：树脂挂在断面上，整幕都还亮着。 */
const RESIN_TAU = 0.45;


/**
 * 第 i 段沿**裂面法向**的张开量（以原木厚度为单位，纯函数）。
 *
 * 与 katana 的分野在这里落到位移上：布被切开后沿**切向**（斩击轴方向）
 * 滑走，而劈开的木段沿**法向**（垂直于裂纹推进方向）被楔子推开。
 *
 * 两段相加：楔力的匀速推开 + 脱离后的自由下坠。近端吃到的楔力更足
 * （`1 - seat·0.45`），所以张口是个**楔形**而非平行缝——这正是斧作用于
 * 木料的形状。
 *
 * @param i 段序号
 * @param t 整幕归一化进度
 * @param count 总段数
 */
export function segmentOpen(i: number, t: number, count: number = AXE_SEGMENT_COUNT): number {
  const splitAt = segmentSplitAt(i, count);
  if (!Number.isFinite(splitAt) || t <= splitAt) return 0;
  const age = t - splitAt;
  const seat = segmentSeat(i, count);
  const kick = OPEN_KICK * (1 - seat * OPEN_FALLOFF);
  return kick * age + 0.5 * OPEN_GRAVITY * age * age;
}

/**
 * 第 i 段脱离后的翻滚角（弧度，纯函数）。
 *
 * 分离前严格为 0：还连在木料上的段不会自己转。近端翻得更急，与
 * `segmentOpen` 的轴向衰减同源——同一份楔力的两个表现。
 *
 * @param i 段序号
 * @param t 整幕归一化进度
 * @param count 总段数
 */
/**
 * 第 i 段落在裂面的哪一侧（+1 上半 / -1 下半，纯函数）。
 *
 * 「劈成两半」的唯一定义。抽成导出函数是因为它同时决定**翻滚方向**
 * （本模块 `segmentSpin`）与**张开方向**（场景层的位移符号）——两处各写
 * 一份 `i % 2` 时，改一处而漏另一处会让木段一边往上翻、一边往下走，
 * 而两处都「看起来对」。
 *
 * @param i 段序号
 */
export function segmentSide(i: number): number {
  return i % 2 === 0 ? 1 : -1;
}

export function segmentSpin(i: number, t: number, count: number = AXE_SEGMENT_COUNT): number {
  const splitAt = segmentSplitAt(i, count);
  if (!Number.isFinite(splitAt) || t <= splitAt) return 0;
  const seat = segmentSeat(i, count);
  // 奇偶分侧：裂纹上下两侧的木段朝相反方向翻。
  const side = segmentSide(i);
  return side * SPIN_RATE * (1 - seat * OPEN_FALLOFF) * (t - splitAt);
}

/**
 * 第 i 段断口的发光强度（0–1，纯函数，互动②「分离时断口发光」）。
 *
 * 断口亮不是一个装饰：木材撕裂时纤维断裂放热、新鲜断面的树脂在紫外下
 * 发荧光，两者都从**撕裂那一刻**起算并迅速退去。所以它的时间原点是
 * `segmentSplitAt(i)`——每段各自的分离时刻，而不是一个全局时刻。这条
 * 「各段各亮」的性质是互动②与「整根一起闪一下」的分野。
 *
 * @param i 段序号
 * @param t 整幕归一化进度
 * @param count 总段数
 */
export function segmentGlow(i: number, t: number, count: number = AXE_SEGMENT_COUNT): number {
  const splitAt = segmentSplitAt(i, count);
  if (!Number.isFinite(splitAt) || t <= splitAt) return 0;
  const age = t - splitAt;
  if (age < GLOW_RISE_T) return age / GLOW_RISE_T;
  return Math.exp(-(age - GLOW_RISE_T) / GLOW_TAU);
}

/**
 * 第 i 段断面松脂星点的亮度（0–1，纯函数，规格元素⑧）。
 *
 * 比断口发光**更晚起、更慢退**：树脂要先从导管里渗出来才聚成亮点，而
 * 一旦挂上断面就整幕都在。同样以各段自己的分离时刻为原点——松脂只可能
 * 出现在已经断开的断面上。
 *
 * @param i 段序号
 * @param t 整幕归一化进度
 * @param count 总段数
 */
export function segmentResin(i: number, t: number, count: number = AXE_SEGMENT_COUNT): number {
  const splitAt = segmentSplitAt(i, count);
  if (!Number.isFinite(splitAt)) return 0;
  const age = t - splitAt - RESIN_LAG_T;
  if (age <= 0) return 0;
  const rise = Math.min(1, age / RESIN_RISE_T);
  return rise * Math.exp(-Math.max(0, age - RESIN_RISE_T) / RESIN_TAU);
}
