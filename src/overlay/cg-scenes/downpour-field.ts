/**
 * 场景 32 downpour 的风场与水面响应：**纯标量数学**，不碰 THREE 对象。
 *
 * 本场景的独立签名是「一个风场同时驱动两种介质」：
 * 同一个 `windAngle` / `windSpeed` 既决定**空气里**雨滴的入射角，
 * 又决定**水面上**涟漪的椭圆形状与长轴朝向。
 *
 * 与 ice 的区别在这里划清：ice 的签名是「同一风场 × 两个 parallax 系数」
 * ——一种介质（雪）、两种速度；downpour 是「同一风场 → 两种介质响应」
 * ——雨（空气动力学）与水（表面波几何）。因此 downpour 的 ④雨幕深浅
 * 走**大气透视**（远层更淡更短）而不是速度差，不去和 ice 抢那条签名。
 *
 * 涟漪为什么会变椭圆：斜射的雨滴带着水平动量砸进水面，冠状水花沿水平
 * 速度方向铺开，环因此在**顺风方向**被拉长。垂直下落（无风）才是正圆。
 * 这条「斜射越强 → 越扁」的关系是签名最可测的真值。
 */

/** 场景总时长（秒）。规格 §4.2 场景 32 为 1900ms。 */
export const DOWNPOUR_DURATION_S = 1.9;
/** 第一幕结束点（400/1900）：雨至。 */
export const DOWNPOUR_ACT1_END = 400 / 1900;
/** 第二幕结束点（1450/1900）：雨帘+涟漪+远处闪。 */
export const DOWNPOUR_ACT2_END = 1450 / 1900;

/** 雨的终端速度系数（× 短边/秒）：约 0.35s 掠过全屏高，是暴雨的量级。 */
const FALL_RATE = 2.9;
/** 风速峰值系数（× 短边/秒）。 */
const WIND_PEAK = 0.95;
/** 风速基准系数：雨至之前就有风，不是雨来了风才起。 */
const WIND_BASE = 0.22;
/**
 * 斜射拉长系数：`flatten = 1/(1 + K·sin θ)`。
 *
 * 取 2.6 让 18° 的驻风斜射把环压到 0.55 左右——肉眼能看出是椭圆，
 * 又不会扁成一条线（真实雨滴冠状水花的长短轴比大致在 1.4–2 之间）。
 */
const FLATTEN_GAIN = 2.6;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 风向（弧度，地面平面内）。
 *
 * 「风摆」不是匀速转动：阵风来去有回摆，所以主项之外叠一个反向的
 * 二次谐波。整幕摆过约 0.9 rad，足以让涟漪长轴的转动被肉眼看见。
 *
 * @param t 归一化总进度
 */
export function windAngle(t: number): number {
  const k = clamp01(t);
  return 0.28 + k * 0.62 + Math.sin(k * Math.PI * 2) * 0.16;
}

/**
 * 风速（世界单位/秒）。
 *
 * @param t 归一化总进度
 * @param short 画面短边（像素），风速的量纲基准
 */
export function windSpeed(t: number, short: number): number {
  const k = clamp01(t);
  // 阵风在第二幕中段最猛（sin 半周期峰值落在 t≈0.5），两端回落到基准。
  const gust = Math.sin(k * Math.PI) ** 1.4;
  return short * (WIND_BASE + WIND_PEAK * gust);
}

/**
 * 雨滴下落速率（世界单位/秒，向下为正）。
 *
 * 雨滴的 drag 身份是 0.999（阻尼 0.001），几乎无空气阻力——
 * 这正是雨与雪的分野：雪被阻力主导所以飘，雨接近弹道所以直。
 * 因此终端速度只随雨强轻微变化，不随风摆变化。
 *
 * @param t 归一化总进度
 * @param short 画面短边（像素）
 */
export function rainFallSpeed(t: number, short: number): number {
  // 雨至阶段速度略低（雨头还没压下来），主幕满速。
  const ramp = 0.62 + 0.38 * clamp01(t / DOWNPOUR_ACT1_END);
  return short * FALL_RATE * ramp;
}

/**
 * 雨的入射角（弧度，偏离竖直）。
 *
 * = atan(水平风速 / 竖直落速)。这是**空气介质**对风场的响应。
 *
 * @param t 归一化总进度
 * @param short 画面短边（像素）
 */
export function rainIncidence(t: number, short: number): number {
  return Math.atan2(windSpeed(t, short), rainFallSpeed(t, short));
}

/**
 * 涟漪椭圆的压扁比 = 短轴/长轴（1 为正圆）。
 *
 * 这是**水介质**对同一风场的响应：入射角进来，形状出去。
 * 与 `rainIncidence` 共用 `windSpeed` 这一个源，
 * 所以「改风 → 雨向与环形同时变」是数学上的必然而非两处各自写死。
 *
 * @param t 归一化总进度
 * @param short 画面短边（像素）
 */
export function rippleFlatten(t: number, short: number): number {
  const theta = rainIncidence(t, short);
  return 1 / (1 + FLATTEN_GAIN * Math.abs(Math.sin(theta)));
}

/**
 * 涟漪长轴朝向（弧度）。
 *
 * 与风向同向：水花沿水平速度方向铺开。椭圆长轴以 π 为周期，
 * 但这里直接沿用风向本身，让「环随风转」与「雨随风斜」读出同一个角。
 *
 * @param t 归一化总进度
 */
export function rippleAxisAngle(t: number): number {
  return windAngle(t);
}

/**
 * 涟漪长半轴（世界单位）。
 *
 * 表面张力波的早期扩散近似 r ∝ √age，随后被黏性耗散封顶。
 * 用闭式而非逐帧累加：场景 update 会被以任意 t 调用。
 *
 * @param age 该环自溅起以来的秒数
 * @param short 画面短边（像素）
 */
export function rippleRadius(age: number, short: number): number {
  const a = Math.max(0, age);
  const cap = short * 0.115;
  return cap * Math.min(1, Math.sqrt(a / 0.5));
}

/**
 * 涟漪不透明度：起时最亮，随扩散淡去（能量摊到更长的环周上）。
 *
 * @param age 该环自溅起以来的秒数
 */
export function rippleFade(age: number): number {
  const a = Math.max(0, age);
  if (a < 0) return 0;
  return Math.max(0, 1 - a / 0.62) ** 1.6;
}

/**
 * 雨强包络（0–1）：雨至 → 满雨 → 渐止。
 *
 * @param t 归一化总进度
 */
export function rainDensity(t: number): number {
  const k = clamp01(t);
  if (k < DOWNPOUR_ACT1_END) return (k / DOWNPOUR_ACT1_END) ** 0.7;
  if (k < DOWNPOUR_ACT2_END) return 1;
  const tail = (k - DOWNPOUR_ACT2_END) / (1 - DOWNPOUR_ACT2_END);
  return Math.max(0, 1 - tail) ** 0.85;
}

/**
 * 溅点强度（0–1，间歇）。
 *
 * 「间歇」是规格明写的：暴雨的地面雨舞不是均匀白噪，
 * 而是一阵一阵。用两个不成整数比的频率相乘制造无周期的忽强忽弱。
 *
 * @param t 归一化总进度
 */
export function splashPulse(t: number): number {
  const k = clamp01(t);
  const envelope = rainDensity(k);
  const beat = 0.55 + 0.45 * Math.sin(k * Math.PI * 11.3) * Math.sin(k * Math.PI * 4.1);
  return envelope * Math.max(0, beat);
}

/**
 * 积水覆盖度（0–1）：雨积起来慢，第三幕「积水退」也慢。
 *
 * 积水是雨强的**积分**而非瞬时值——雨停了水还在，这是它与
 * `rainDensity` 必须分开的原因。
 *
 * @param t 归一化总进度
 */
export function puddleLevel(t: number): number {
  const k = clamp01(t);
  // 上涨段：雨强的近似积分（t^1.3 的形状），主幕末达峰。
  const rise = Math.min(1, (k / DOWNPOUR_ACT2_END) ** 1.3);
  if (k <= DOWNPOUR_ACT2_END) return rise;
  const drain = (k - DOWNPOUR_ACT2_END) / (1 - DOWNPOUR_ACT2_END);
  // 退水只退掉四成：一场倾盆过后地面仍是湿的。
  return 1 - drain * 0.4;
}

/**
 * 远处闪电亮度（0–1）：只在第二幕里闪两次，且都很弱（「间隙亮光」）。
 *
 * @param t 归一化总进度
 */
export function farFlash(t: number): number {
  const k = clamp01(t);
  if (k < DOWNPOUR_ACT1_END || k > DOWNPOUR_ACT2_END) return 0;
  const span = DOWNPOUR_ACT2_END - DOWNPOUR_ACT1_END;
  const local = (k - DOWNPOUR_ACT1_END) / span;
  // 两次短闪，各自快升慢落。
  let out = 0;
  for (const at of [0.24, 0.68]) {
    const d = local - at;
    if (d < 0) continue;
    out = Math.max(out, Math.exp(-d * 42));
  }
  return out * 0.5;
}
