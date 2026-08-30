/**
 * 场景 23 trumpet 的签名机制：定向号口发声。
 *
 * 与 bell 的分界在**发声的方向性**：bell 是四面扩散的同心球面波，
 * trumpet 的号口把声能约束在一个朝向轴的扇形里——号口对着哪边，
 * 波就往哪边走，背面几乎无声。这个约束写成纯函数后，「定向」可以
 * 直接验收：同一半径上，轴向的能量必须显著高于背向。
 *
 * 三个按键的按下时刻也在这里，因为「按键同步号口环波加强」这条互动
 * 的因果本体就是「按键激励 → 环波幅度」，而不是两条各自的曲线。
 */

/** 号口朝向：向右上方 30°（与画面构图配合）。 */
export const HORN_AXIS = Math.PI * 0.16;
/** 号口张角的半角：超出这个角度声能急剧衰减。 */
export const HORN_HALF_ANGLE = 0.85;

/** 三个按键的按下时刻（整幕归一化）。 */
export const VALVE_PRESSES = [0.3, 0.48, 0.66] as const;
/** 单次按键的激励持续时长。 */
export const VALVE_SPAN = 0.14;

/**
 * 号口方向增益（纯函数，签名的可验收核心）。
 *
 * 轴向为 1，偏离轴向按余弦幂衰减，超出张角后只剩很小的漏声——
 * 真实号口不会完全无背向辐射，但差距必须是数量级的。
 *
 * @param angle 该方位与场景坐标 +x 轴的夹角（弧度）
 */
export function hornGain(angle: number): number {
  // 与轴向的夹角，取最短弧。
  const two = Math.PI * 2;
  const raw = (((angle - HORN_AXIS) % two) + two) % two;
  const off = Math.min(raw, two - raw);
  // 主瓣内（off < 半角）：cos 幂，轴向为 1，边缘降到 0.06。
  // 主瓣外：继续单调衰减到背向 0.008，而不是钳成常量——钳死会让
  // 「增益随偏离单调下降」在半角之外失效（变成一条水平线），
  // 也不符合真实号口仍有旁瓣辐射的事实。
  if (off < HORN_HALF_ANGLE) {
    const lobe = Math.cos((off / HORN_HALF_ANGLE) * (Math.PI / 2));
    // 幂次让主瓣中心平坦；末端补 0.06 与主瓣外的起点接上。
    return 0.06 + Math.pow(Math.max(0, lobe), 2.6) * 0.94;
  }
  const k = (off - HORN_HALF_ANGLE) / (Math.PI - HORN_HALF_ANGLE);
  // 余弦尾：半角处 0.06 平滑降到 π 处 0.008。
  return 0.008 + 0.052 * (1 + Math.cos(Math.PI * Math.min(1, k))) * 0.5;
}

/**
 * 单个按键的激励强度（纯函数）。
 *
 * 按下时快速起、松开时稍慢落——铜管按键是机械动作，不是瞬时脉冲。
 *
 * @param t 整幕归一化进度
 * @param index 按键序号（0–2）
 */
export function valveExcite(t: number, index: number): number {
  const at = VALVE_PRESSES[index];
  if (at === undefined) return 0;
  const since = t - at;
  if (since < 0 || since > VALVE_SPAN) return 0;
  const k = since / VALVE_SPAN;
  // 前 25% 起、后 75% 落：按下快、抬起慢。
  return k < 0.25
    ? k / 0.25
    : Math.pow(1 - (k - 0.25) / 0.75, 1.4);
}

/**
 * 三个按键的激励总量（纯函数，互动①的驱动量）。
 *
 * 号口环波的幅度由它推高——按键不按，环波只剩吹奏底噪。
 * 这让「按键同步环波加强」是同一个量的两个出口，而不是两条曲线。
 *
 * @param t 整幕归一化进度
 */
export function valveEnergy(t: number): number {
  let sum = 0;
  for (let i = 0; i < VALVE_PRESSES.length; i += 1) sum += valveExcite(t, i);
  return Math.min(1, sum);
}

/** 一圈号口环波的发出间隔（整幕归一化）。规格写明「号口环波×3」。 */
export const HORN_RING_INTERVAL = 0.19;
/** 一圈环从号口铺到屏缘所需的时长。 */
export const HORN_RING_TRAVEL = 0.46;
/** 第一圈的发出时刻（第一幕吹奏起音之后）。 */
export const HORN_RING_FIRST = 0.22;

/**
 * 第 index 圈号口环波的当前半径（UV 尺度，纯函数）。
 *
 * 返回 -1 表示尚未发出或已越出画面。线性外扩：声速恒定。
 *
 * @param t 整幕归一化进度
 * @param index 环序号
 */
export function hornRingRadius(t: number, index: number): number {
  const since = t - (HORN_RING_FIRST + index * HORN_RING_INTERVAL);
  if (since < 0 || since > HORN_RING_TRAVEL) return -1;
  return (since / HORN_RING_TRAVEL) * 0.82;
}

/**
 * 音符粒子从环波上剥离的位置（纯函数，互动②的因果本体）。
 *
 * 粒子不是随机撒出，而是**从某圈环的波前上剥离**——所以它的初始
 * 半径等于那圈环此刻的半径，方位落在号口主瓣内。
 *
 * @param ringRadius 该圈环当前半径（UV 尺度）
 * @param spread 在主瓣内的偏移比例（-1..1）
 */
export function noteDetachAngle(spread: number): number {
  return HORN_AXIS + spread * HORN_HALF_ANGLE * 0.7;
}
