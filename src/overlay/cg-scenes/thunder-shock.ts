/**
 * 场景 11 thunder 的签名机制：**贴地环波**的纯数学。
 *
 * 全库唯一之处是这里的波是**沿地面横扫的一圈**，不是横贯天穹的一道弧
 * （与 lightning 的「天穹电弧」构成天地对照）。整个场景的因果都挂在
 * 一个量上——环波前沿半径 `shockRadius`：
 *
 * - 碎石在**环波前沿抵达自己所在半径**的那一刻被抛起（不是定时起跳）；
 * - 扬尘发射点半径**等于**当帧前沿半径（尘跟着环走）；
 * - 冷凝雾带半径是前沿的**滞后解**（波后低压带）；
 * - 回响尾迹是前沿撞上谷壁后**向内回传**的那一支。
 *
 * 写成纯函数（无副作用、无 DOM、无刚体）是为了让「贴地环波」可以被直接
 * 验收，也让物理层能在固定步长的追赶循环里**逐步采样**这个时变场——
 * 取一次快照会让所有碎石在同一步起跳，稀疏 update 下立刻暴露。
 */

/** 第一幕（蓄雷）结束点：200/1200。 */
export const THUNDER_ACT1_END = 200 / 1200;
/** 第二幕（地裂+冲击波+碎石）结束点：800/1200。 */
export const THUNDER_ACT2_END = 800 / 1200;
/** 整幕时长（秒），物理时间由它与归一化进度折算。 */
export const THUNDER_DURATION_S = 1.2;

/**
 * 贴地压扁系数：环在屏幕上的竖直半轴 / 水平半轴。
 *
 * 这一个数就是「贴地」与「空中光圈」的分界——0.26 读作一圈躺在地面上
 * 沿透视压扁的椭圆；取 1 就变成悬在空中的正圆光环，场景签名当即失效。
 */
export const THUNDER_GROUND_FLATTEN = 0.26;

/** 环层数：规格写明「多层环 mesh 贴地扩散」。 */
export const SHOCK_LAYERS = 4;
/** 层间发出间隔（整幕归一化）：多层环错峰追出，不是一圈粗环。 */
export const SHOCK_STAGGER = 0.05;

/** 天空暗闪的整幕周期数（高频频闪，与 lightning 的三相慢节奏相反）。 */
const STROBE_CYCLES = 17;

/** 屏幕中心到最远缘的参考距离：规格「扩散到全屏四缘」的判据尺度。 */
export function shockReach(width: number, height: number): number {
  return Math.max(width, height) * 0.5;
}

/**
 * 声速（像素 / 整幕归一化时间）。
 *
 * 由三幕反解：第一幕末起爆、**第二幕末前沿正好抵达谷壁**（屏缘），
 * 于是第三幕自然成为它撞壁回传的回响幕。速度因此是**常量**——
 * 环线性外扩，不会越走越快（那会读作光圈在放大而非波在传播）。
 * 到整幕末，前沿已走到 1.67 倍屏缘半径，四角也早已扫过。
 */
export function shockSpeedFor(width: number, height: number): number {
  return shockReach(width, height) / (THUNDER_ACT2_END - THUNDER_ACT1_END);
}

/** 第 index 层环的起爆时刻。 */
export function shockLaunchAt(index: number): number {
  return THUNDER_ACT1_END + index * SHOCK_STAGGER;
}

/**
 * 第 index 层环的当前半径（像素，纯函数）。
 *
 * 起爆前恒为 0，起爆后 `半径 = 经过时间 × 声速`——严格线性。
 * 不用 -1 表示「未发出」：半径要对 t 单调不减，验收才能直接量单调性，
 * 可见性交给透明度而不是半径的哨兵值。
 */
export function shockRadius(t: number, index: number, speed: number): number {
  const since = t - shockLaunchAt(index);
  return since <= 0 ? 0 : since * speed;
}

/**
 * 环波前沿抵达某半径的时刻（`shockRadius` 的反函数）。
 *
 * 碎石的起跳时刻必须落在这个解上——验收据此判定「冲击波扫过碎石将其
 * 抛起」是真因果，而不是各演各的定时器。
 */
export function ringArrivalT(radius: number, speed: number): number {
  return shockLaunchAt(0) + radius / speed;
}

/**
 * 前沿过后的超压（0–1，纯函数）。
 *
 * 波前未到 → 0（石头不该提前动）；刚过 → 1；再往后按带宽线性泄压。
 * 这是施加给碎石的**时变场**：追赶循环每一步都要按该步时刻重新采样。
 *
 * @param front 当帧前沿半径
 * @param radius 碎石所在半径
 * @param band 超压带宽（像素）
 */
export function frontOverpressure(front: number, radius: number, band: number): number {
  const gap = front - radius;
  if (gap < 0) return 0;
  return Math.max(0, 1 - gap / band);
}

/**
 * 冲击波在距离 radius 处的衰减（0–1）。
 *
 * 球面波能量按距离摊开，远处的碎石被抛得低——因此外圈碎石既晚起跳、
 * 又跳得矮，落回地面也更早，这是同一条衰减律的三个可见后果。
 */
export function rubbleAttenuation(radius: number, reach: number): number {
  return 1 / (1 + (radius / Math.max(1, reach)) * 1.4);
}

/**
 * 回响：前沿撞上谷壁后**向内回传**的那一支（像素，-1 表示尚未产生）。
 *
 * 山谷回响不是第二圈外扩的环，而是同一道波被谷壁反射后往回收。
 * 因此它的半径随时间**递减**——与外扩的主环方向相反，这是「回响」
 * 而非「又一圈冲击波」的判据。
 */
export function echoRadius(front: number, reach: number): number {
  if (front <= reach) return -1;
  const back = 2 * reach - front;
  return back > 0 ? back : -1;
}

/**
 * 天空暗闪强度（0–1，纯函数）。
 *
 * 高频频闪：整幕 17 个周期，蓄雷幕最烈、第二幕随能量泄尽衰减、末幕熄。
 * 与 lightning 的「三相先导-暗闪-落雷」慢节奏相反——那边整幕只有三次
 * 放电，这边是十几次抖动的云背光。
 */
export function skyStrobe(t: number): number {
  const carrier = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * STROBE_CYCLES)), 3);
  let envelope: number;
  if (t <= THUNDER_ACT1_END) {
    envelope = 0.4 + 0.6 * (t / THUNDER_ACT1_END);
  } else if (t <= THUNDER_ACT2_END) {
    envelope = 0.9 * (1 - (t - THUNDER_ACT1_END) / (THUNDER_ACT2_END - THUNDER_ACT1_END));
  } else {
    envelope = 0;
  }
  return carrier * envelope;
}

/** 地面线（局部坐标 y）：环心、碎石、地裂、雾带全部落在这条线上。 */
export function groundYFor(height: number): number {
  return -height * 0.34;
}

/**
 * 地裂的展开比例（0–1）。
 *
 * 岩体撕裂比空气冲击波快（岩石里的断裂速度远高于空气声速），
 * 所以地裂先撕开、环波随后追出——CRACK_SPEED_RATIO > 1 表达这一点。
 */
export function crackReveal(t: number, speed: number, maxLength: number): number {
  const since = t - shockLaunchAt(0);
  if (since <= 0) return 0;
  return Math.min(1, (since * speed * 1.45) / Math.max(1, maxLength));
}

/** 把归一化进度折算成物理秒：刚体步进由场景时间轴驱动，不吃 frameDelta。 */
export function progressToSeconds(t: number): number {
  return Math.max(0, t) * THUNDER_DURATION_S;
}

/** 物理秒折回归一化进度：追赶循环内按该步时刻重采样时变场要用。 */
export function secondsToProgress(seconds: number): number {
  return seconds / THUNDER_DURATION_S;
}
