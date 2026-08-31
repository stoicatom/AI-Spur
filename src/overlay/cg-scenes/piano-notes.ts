/**
 * 场景 38 piano 的音符轨迹：**跃动而非飘升**。
 *
 * 这是签名的第二条可验收内涵，也是与场景 39 saxophone 的分野所在。
 * saxophone 的音符是**摇曳**：水平左右振荡、竖向严格单调光滑上升，
 * 没有拍点。piano 的音符是**跃动**：竖向轨迹由抛物线段拼接而成，
 * 每段有明确的起跳与落点，竖向速度在落点处**换号**——所以它有拍点，
 * 而拍点正是「连击」这件事在音符侧的投影。
 *
 * 配对关系与击键时刻在 ./piano-melody，本模块只管音符自己怎么走。
 */
import { KEY_STRIKE_COUNT, STAFF_LINE_COUNT, noteBornAt, pedalGlow } from './piano-melody';

/** 每个音符在谱上跳几次。 */
export const NOTE_HOP_COUNT = 3;
/** 单跳时长（整幕归一化）。 */
const HOP_SPAN = 0.075;

/**
 * 音符 n 在时刻 t 已完成的跳数（含当前跳的小数部分）。
 *
 * 返回 0 表示还没起跳。上界为 NOTE_HOP_COUNT：跳完就坠落成尘。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function noteHopPhase(n: number, t: number, count = KEY_STRIKE_COUNT): number {
  const born = noteBornAt(n, count);
  if (!Number.isFinite(born) || t <= born) return 0;
  return Math.min(NOTE_HOP_COUNT, (t - born) / HOP_SPAN);
}

/**
 * 音符 n 的竖向高度（0 = 键面，1 = 上半屏顶）。
 *
 * **签名第二条内涵**：跃动而非飘升。整条轨迹是 NOTE_HOP_COUNT 段抛物线
 * 的拼接——每段内 `4p(1-p)` 给出升—顶—落，段与段之间基线抬升。所以
 * 竖向速度在每个落点处**换号**，这与 saxophone 的严格单调上升相反。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function noteHeight(n: number, t: number, count = KEY_STRIKE_COUNT): number {
  const phase = noteHopPhase(n, t, count);
  if (phase <= 0) return 0;
  const hop = Math.min(NOTE_HOP_COUNT - 1, Math.floor(phase));
  const p = phase - hop;
  // 段内抛物线：p=0 在基线，p=0.5 到顶，p=1 回到下一段基线。
  const arc = 4 * p * (1 - p);
  // 基线逐跳抬升：跳完三跳到达上半屏。跳幅随高度递减（力气在耗尽）。
  const base = hop / NOTE_HOP_COUNT;
  const amp = 0.34 * (1 - hop * 0.22);
  return Math.min(1, base + arc * amp);
}

/**
 * 音符 n 的水平位置（0 = 左缘，1 = 右缘）。
 *
 * 音符沿五线谱**向右**行进：这是乐谱的阅读方向，也让「铺满上半屏」
 * 成为一串横向展开的音符而不是一柱烟。起点随序号错开，所以七个音符
 * 在谱上是一排而非重叠。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function noteX(n: number, t: number, count = KEY_STRIKE_COUNT): number {
  const seat = count === 1 ? 0.5 : 0.12 + (n / (count - 1)) * 0.64;
  const phase = noteHopPhase(n, t, count);
  return Math.min(1, seat + phase * 0.072);
}

/**
 * 音符 n 已跳完、开始坠落成尘的进度（0→1）。
 *
 * 互动①：音符沿五线谱跃动**后**坠落成尘。所以音尘不是与音符同时
 * 出现的装饰，而是音符跳完之后的结果——门控读 `noteHopPhase` 是否
 * 已达上界，改跳数会让音尘时刻跟着动。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function noteDustFall(n: number, t: number, count = KEY_STRIKE_COUNT): number {
  const phase = noteHopPhase(n, t, count);
  if (phase < NOTE_HOP_COUNT) return 0;
  const born = noteBornAt(n, count);
  const doneAt = born + NOTE_HOP_COUNT * HOP_SPAN;
  return Math.min(1, (t - doneAt) / 0.16);
}

/**
 * 五线谱第 j 条线的亮度（0→1）。
 *
 * ④ 五线谱横贯全屏。线的亮度读**当前有音符落在它附近**——谱线是被
 * 音符点亮的，不是一直亮着的背景装饰。这让「音符沿谱跃动」在谱线上
 * 也留下痕迹。
 *
 * @param j 谱线序号（0 = 最低线）
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function staffLineGlow(j: number, t: number, count = KEY_STRIKE_COUNT): number {
  const seat = (j + 0.5) / STAFF_LINE_COUNT;
  let best = 0;
  for (let n = 0; n < count; n += 1) {
    const h = noteHeight(n, t, count);
    if (h <= 0) continue;
    // 距离越近越亮：0.16 是谱线的「感应半径」。
    best = Math.max(best, Math.max(0, 1 - Math.abs(h - seat) / 0.16));
  }
  return best * (0.35 + pedalGlow(t) * 0.65);
}

/** 音符形状种类：八分/十六分/符点（规格 §4.2 元素③）。 */
export const NOTE_SHAPE_COUNT = 3;

/**
 * 音符 n 用哪种形状（八分/十六分/符点）。
 *
 * 三种形状轮转，且**与配对序号同源**：形状是音符身份的一部分，
 * 所以它由序号决定而非随机——同一次演奏重播两次，形状序列必须一致。
 *
 * @param n 音符序号
 */
export function noteShape(n: number): number {
  return ((n % NOTE_SHAPE_COUNT) + NOTE_SHAPE_COUNT) % NOTE_SHAPE_COUNT;
}
