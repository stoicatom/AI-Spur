/**
 * 场景 14 star 的签名机制与时间轴（纯函数层）。
 *
 * 规格 §4.2 场景 14 的签名有两半，两半都在这里成为可验收的曲线：
 *
 * 1. **五轴对称**——`axisAngle` 严格等分 2π，`axisLength` **不接受轴索引**，
 *    因此「五条轨同角距、同长度」是函数签名本身的性质，不靠调用方自觉。
 *    想破坏对称必须改这里的常量或给 axisLength 加参数，改动一眼可见。
 * 2. **随机单帧变色彩蛋**——彩蛋落在整幕的**帧格**上（1200ms @ 60fps = 72 格），
 *    由确定性种子定位。绝不用 `Math.random()`：验收要能复现同一帧；
 *    也绝不按 update 调用次数计数：验收在稀疏 t 上调用，按次数会落在别处。
 *
 * 环波半径同样写成纯函数：互动②「环波推散星屑」的因果是
 * 「波前半径扫到星屑所在半径」，只有把半径写成可独立验收的函数，
 * 「写成定时推散」和「半径写成常量」才会在验收里各自转红。
 */

/** 第一幕结束点（200/1200）：星体凝聚完成。 */
export const STAR_ACT1_END = 200 / 1200;
/** 第二幕结束点（800/1200）：星芒伸展到位。 */
export const STAR_ACT2_END = 800 / 1200;
/** 整幕时长（秒）：物理步进与帧格都以它换算。 */
export const STAR_DURATION_S = 1.2;

/** 星芒轴数：五芒星 ⇒ 5 条主轴。 */
export const AXIS_COUNT = 5;
/** 第 0 轴指向正上方（尖端朝天，五芒星的规范朝向）。 */
export const AXIS_BASE_ANGLE = Math.PI / 2;
/** 相邻两轴的夹角：2π/5 = 72°。对称性的唯一来源。 */
export const AXIS_STEP = (Math.PI * 2) / AXIS_COUNT;

/** 第 index 轴的方向角（弧度）。 */
export function axisAngle(index: number): number {
  return AXIS_BASE_ANGLE + index * AXIS_STEP;
}

/** 第 index 轴的单位方向向量（省得场景层到处写三角函数）。 */
export function axisDirection(index: number): { x: number; y: number } {
  const a = axisAngle(index);
  return { x: Math.cos(a), y: Math.sin(a) };
}

/**
 * 星芒伸展半径（像素）。
 *
 * 取短边比例：五轴按 72° 铺开时，x 跨度约 1.9R、y 跨度约 1.81R，
 * 因此 0.56 倍短边即可让五方都探到屏缘（规格「全屏五方伸展」）。
 */
export function starReach(width: number, height: number): number {
  return Math.min(width, height) * 0.56;
}

/** 场景长度尺度（像素）：星体大小、星屑尺寸、重力都以它为基准。 */
export function starScale(width: number, height: number): number {
  return Math.min(width, height) * 0.06;
}

/**
 * 爆发进度（纯函数）：第一幕为 0（还在凝聚），第二幕 0→1 伸展，第三幕维持 1。
 *
 * 用 pow<1：爆发是冲击——出膛极快、末段趋缓，匀速生长读不出「炸开」。
 */
export function burstProgress(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k <= STAR_ACT1_END) return 0;
  const u = Math.min(1, (k - STAR_ACT1_END) / (STAR_ACT2_END - STAR_ACT1_END));
  return Math.pow(u, 0.62);
}

/**
 * 星轨长度（像素）。
 *
 * **签名核心：形参里没有轴索引**——五条轨只能同长。任何「让某一轴更长」
 * 的写法都得绕过本函数，验收的「五轨长度同量级」会立刻抓到。
 */
export function axisLength(reach: number, burst: number): number {
  return reach * burst;
}

/** 环波圈数（规格⑥「环状波」，三圈错峰）。 */
export const HOOP_COUNT = 3;
/** 一圈环波从星心扩到全屏所需时长（整幕归一化）。 */
export const HOOP_TRAVEL = 0.36;
/** 相邻两圈的发出间隔（整幕归一化）。 */
export const HOOP_INTERVAL = 0.09;
/** 第一圈的发出时刻：星芒已经出膛，环波随后追上来。 */
export const HOOP_LAUNCH = 0.3;

/**
 * 第 index 圈环波的当前半径（像素，纯函数）。
 *
 * 返回 -1 表示尚未发出或已越出画面。半径**线性**外扩：波前速度恒定，
 * 因此「环波扫到星屑」的时刻由半径与星屑位置共同决定，不是写死的时点。
 *
 * @param t 整幕归一化进度
 * @param index 圈序号
 * @param reach 全屏参考半径（像素）
 */
export function hoopRadius(t: number, index: number, reach: number): number {
  const since = t - (HOOP_LAUNCH + index * HOOP_INTERVAL);
  if (since < 0 || since > HOOP_TRAVEL) return -1;
  return (since / HOOP_TRAVEL) * reach;
}

/** 三圈环波在某时刻的半径数组（-1 表示该圈不在场）。 */
export function hoopRadii(t: number, reach: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < HOOP_COUNT; i += 1) out.push(hoopRadius(t, i, reach));
  return out;
}

/** 整幕名义帧数：1200ms @ 60fps。彩蛋按帧格定位，与实际调用频率无关。 */
export const FRAME_COUNT = 72;

/** t 落在第几帧格。 */
export function frameIndex(t: number): number {
  return Math.min(FRAME_COUNT - 1, Math.max(0, Math.floor(t * FRAME_COUNT)));
}

/**
 * 确定性种子（FNV-1a，归一到 0–1）。
 *
 * 「随机」只能是**看起来随机**：同一素材同一屏幕必须永远得到同一彩蛋帧，
 * 否则验收无法复现，用户也会觉得特效在闪烁不定。
 */
export function chromaSeed(text: string): number {
  let h = 2166136261;
  for (const char of text) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** 彩蛋帧号：锁在第二幕的爆发段内（星芒最盛时突变才看得见）。 */
export function chromaFrame(seed: number): number {
  const from = Math.round(FRAME_COUNT * STAR_ACT1_END) + 2;
  const to = Math.round(FRAME_COUNT * STAR_ACT2_END) - 2;
  return from + Math.floor(Math.min(0.999999, Math.max(0, seed)) * (to - from));
}

/** 当前帧是否是彩蛋帧（整幕**恰好一帧**为真）。 */
export function isChromaFrame(t: number, seed: number): boolean {
  return frameIndex(t) === chromaFrame(seed);
}

/** 彩蛋的色相位移量：近似补色，一帧之内整场换色。 */
export const CHROMA_HUE_SHIFT = 0.44;
