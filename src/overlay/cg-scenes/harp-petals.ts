/**
 * 场景 22 harp 的签名机制：竖列弦的空间扫描 + 花瓣形音波轨迹。
 *
 * 与 guitar 的关键区别在**扫描的驱动量**：guitar 的六弦按各自的
 * `pluckAt` 时刻错峰响（时间驱动），harp 的竖列弦由一道**自上而下
 * 移动的闪光带**照亮（空间驱动）——弦亮不亮取决于闪光带此刻的高度
 * 是否扫到这根弦，而不是它自己的计时器。把判据写成纯函数后，
 * 「逐列扫描」可以直接验收，且改成「齐亮」必然让断言转红。
 */

/** 闪光带自上而下扫完全程所占的幕比例（第一幕内完成）。 */
export const SWEEP_SPAN = 0.3;
/** 闪光带的半宽（归一化弦列坐标），决定同时被照亮的弦数。 */
export const BEAM_HALF_WIDTH = 0.12;

/**
 * 闪光带此刻的位置（纯函数）。
 *
 * 返回归一化坐标 0（最上）→1（最下）。超出扫描窗口后返回 >1，
 * 表示已扫完全部弦列。
 *
 * @param t 整幕归一化进度
 */
export function beamPosition(t: number): number {
  const k = Math.max(0, t) / SWEEP_SPAN;
  // 缓入缓出：起手慢、中段快、收势慢，像手指划过弦列。
  if (k >= 1) return 1 + (k - 1);
  return k * k * (3 - 2 * k);
}

/**
 * 某根弦被闪光带照亮的强度（纯函数，签名的可验收核心）。
 *
 * 只有闪光带位置落在该弦附近的窄带内才亮。因此「闪光没到就不亮、
 * 扫过就暗下」是曲线本身的性质，不靠调用方按顺序调用来保证。
 *
 * @param beam 闪光带当前位置（beamPosition 的返回值）
 * @param stringPos 该弦在弦列中的归一化位置（0–1，从上到下）
 */
export function beamLight(beam: number, stringPos: number): number {
  const gap = Math.abs(beam - stringPos);
  if (gap >= BEAM_HALF_WIDTH) return 0;
  const k = 1 - gap / BEAM_HALF_WIDTH;
  // 平方让中心更锐：闪光带是一道亮线而非一片渐变。
  return k * k;
}

/**
 * 弦被照亮后的余振包络（纯函数）。
 *
 * 竖琴弦被拨后余振比吉他长（琴弦更长、张力更低），因此衰减常数更小。
 * 与 guitar 的 STRING_DECAY=3.1 刻意区分，让两个弦乐场景不趋同。
 *
 * @param t 整幕归一化进度
 * @param litAt 该弦被闪光带扫到的时刻
 */
export function stringRing(t: number, litAt: number): number {
  const since = t - litAt;
  if (since < 0) return 0;
  const attack = Math.min(1, since / 0.02);
  return attack * Math.exp(-since * 1.7);
}

export type PetalPoint = {
  /** 相对起点的横向偏移（像素）。 */
  readonly x: number;
  /** 相对起点的纵向偏移（像素，向下为负）。 */
  readonly y: number;
  /** 当前朝向（弧度），花瓣自旋用。 */
  readonly angle: number;
};

/**
 * 花瓣音波的轨迹点（纯函数，签名「花瓣波」的形状来源）。
 *
 * 真实花瓣飘落不是直线也不是抛物线，而是**边旋边侧摆**的螺旋下坠：
 * 空气阻力让它在两个方向间来回翻转，轨迹在水平方向呈正弦摆动、
 * 竖直方向近匀速（阻力与重力平衡后的终端速度）。
 *
 * 这个「侧摆幅度随下落深度增大」的形态是花瓣与雨滴/碎片的区别，
 * 也是本场景与 water（抛物线水珠）、bomb（径向碎片）的机制区分。
 *
 * @param progress 该花瓣的下落进度（0–1）
 * @param fall 总下落距离（像素）
 * @param swayAmp 侧摆幅度（像素）
 * @param swayPhase 侧摆初相，让每片花瓣路径不同
 * @param spin 自旋圈数
 */
export function petalPath(
  progress: number,
  fall: number,
  swayAmp: number,
  swayPhase: number,
  spin: number,
): PetalPoint {
  const p = Math.min(1, Math.max(0, progress));
  // 竖直：终端速度下近匀速，起始略有加速段。
  const y = -fall * (p * 0.88 + p * p * 0.12);
  // 水平：正弦摆动，幅度随下落深度增大（越往下摆得越开）。
  const sway = Math.sin(swayPhase + p * Math.PI * 3.2);
  const x = sway * swayAmp * (0.35 + p * 0.65);
  // 自旋：与侧摆同相位——花瓣翻面的瞬间也是它换向的瞬间。
  const angle = swayPhase + p * Math.PI * 2 * spin;
  return { x, y, angle };
}
