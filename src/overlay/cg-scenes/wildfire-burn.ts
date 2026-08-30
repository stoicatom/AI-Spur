/**
 * 场景 33 wildfire 的燃烧包络（纯标量，不碰 THREE 对象）。
 *
 * 与 ./wildfire-front 的分工：那边定义**火线走到哪、什么时候点着**
 * （签名的运动学），这边定义**点着之后烧成什么样**。两者都靠
 * `igniteAt` 咬合——每簇火与它脚下那块地的状态，都是「它的横坐标决定
 * 它的点燃时刻」这一条的下游。
 *
 * 本模块里最要紧的一条是 `charLevel` 的**单调不减**：烧过的地方不会
 * 愈合。它封住了「用一根来回扫的火柱冒充蔓延」——往回扫要求已焦的
 * 草重新变绿。规格把「地面余烬」列为独立元素，正是因为这层不可逆的
 * 痕迹是二维推进的证据，而不只是装饰。
 */
import { WILDFIRE_ACT1_END, WILDFIRE_ACT2_END, igniteAt } from './wildfire-front';

/**
 * 一簇火的燃烧强度（0→1，纯函数）。
 *
 * 点燃后快速起势（`pow 0.5`，草本燃料几乎一点就着），烧完燃料后退去。
 * 每簇各自走完这条曲线，整体读起来就是一条推进的火线——**不是**整片
 * 同时明暗。
 *
 * @param t 整幕归一化进度
 * @param x 该簇的横坐标（屏宽比例）
 */
export function clumpBurn(t: number, x: number): number {
  const ignite = igniteAt(x);
  const age = t - ignite;
  if (age <= 0) return 0;
  // 草本燃料的燃尽时长（归一化幕）：够短才让火线读作一条带，而不是
  // 一整片越烧越亮的面。
  const span = 0.34;
  const k = age / span;
  if (k >= 1) return 0;
  // 起势快、退得慢：明焰过去后还有一段将熄的火苗。
  return Math.pow(Math.min(1, k / 0.22), 0.5) * Math.pow(1 - k, 0.7);
}

/**
 * 地面焦黑程度（0→1，纯函数，规格元素⑧的不可逆性本体）。
 *
 * **对 t 单调不减**：草一旦烧焦就不会变回绿的。这条断言封住了「用一根
 * 来回扫的火柱冒充推进」——往回扫要求已焦处重新变绿，与单调性冲突。
 *
 * @param t 整幕归一化进度
 * @param x 该处横坐标（屏宽比例）
 */
export function charLevel(t: number, x: number): number {
  const ignite = igniteAt(x);
  const age = t - ignite;
  if (age <= 0) return 0;
  // 炭化在点燃后约 0.18 幕内完成，之后永久保持（不愈合）。
  return Math.min(1, age / 0.18);
}

/**
 * 烟柱高度（0→1，纯函数，规格元素⑤）。
 *
 * 与火线同行：烟柱长在**当前火线**上方，随火势起落。整幕保持在高位
 * （野火的烟是持续生成的），第三幕火退后仍有余烟。
 *
 * @param t 整幕归一化进度
 */
export function smokeColumn(t: number): number {
  if (t <= 0) return 0;
  const rise = Math.min(1, t / WILDFIRE_ACT1_END);
  if (t <= WILDFIRE_ACT2_END) return rise;
  // 第三幕：明焰退去，烟柱塌散但不归零（余烬还在冒烟）。
  const k = (t - WILDFIRE_ACT2_END) / (1 - WILDFIRE_ACT2_END);
  return 1 - k * 0.55;
}

/**
 * 热浪扭曲强度（0→1，纯函数，规格元素④）。
 *
 * 与火势同源但**滞后**：热空气要先积累。用时间平移的闭式近似。
 *
 * @param t 整幕归一化进度
 */
export function heatDistortion(t: number): number {
  const lag = 0.05;
  return smokeColumn(Math.max(0, t - lag)) * 0.9;
}
