/**
 * 场景 33 wildfire 的签名数学：**蔓延式火势**（纯标量，不碰 THREE 对象）。
 *
 * 与 flame（场景 09）刻意划清。两者素材身份同为 fire/combustion，观感
 * 差别必须落在**运动学**上：flame 的火驻留在柴堆一点，横向只有摆动、
 * 净位移严格为零（那边的断言是 `Math.abs(x) < 1e-6`）；本场景的火是一条
 * 沿地面**横向推进**的火线，整幕跨过大半个屏宽。
 *
 * 但「横向位移」本身还不足以定义蔓延——一根来回摆动的火柱也有位移，
 * 一排同时点着的火也能整体平移。蔓延的**唯一可测内涵**是：
 *
 *   **每一簇火的点燃时刻是它横坐标的函数**（`igniteAt`）。
 *
 * 火不是「整体亮起来」，而是「从左边一簇一簇烧过去」。由此派生出三条
 * 彼此咬合的必然结果，构成本场景的可验收签名：
 *
 * 1. **火线单调推进**：`spreadProgress` 的导数恒正（速率 = 基础 + 风助，
 *    风助项非负），所以永不回退——摆动的火柱冒充不了。
 * 2. **火星是水平传播的引燃信使**：落点领先火线一个 `EMBER_LEAD`，
 *    下一簇的点燃时刻严格晚于火星到达该处的时刻（`emberArrivalT`）。
 *    flame 那边的火星是竖直脱落的浮力产物，不参与引燃因果。
 * 3. **烧过的地方不可逆**：`charLevel` 对 t 单调不减，草地状态一旦变焦
 *    就不会愈合。这条让「推进」不可能用一个来回扫的火柱糊过去——
 *    往回扫会要求已焦的地方重新变绿。
 *
 * 「风助火力」是**同源耦合**：`windGust` 同时决定推进速率
 * （`spreadRate`）与火舌倾角（`flameLean`）。风大时火跑得快**且**倒得
 * 厉害，是一个量的两个表现，不是两处各自调参。
 *
 * 全部为纯函数：update 会被以任意稀疏 t 调用，闭式求值才能保证同一 t
 * 永远画出同一帧。火线位置尤其不能逐帧累加——本项目 ice/meteor/wind
 * 都踩过这个坑（稀疏验收下缺陷不暴露，实机逐帧才错）。
 */

/** 整幕时长（毫秒）：规格 §4.2 场景 33。 */
export const WILDFIRE_DURATION_MS = 1750;

/** 第一幕结束（300/1750）：起火——第一簇燃起，火线尚在左端。 */
export const WILDFIRE_ACT1_END = 300 / 1750;
/** 第二幕结束（1300/1750）：蔓延——火线跨屏推进，烟柱与余烬拉出纵深。 */
export const WILDFIRE_ACT2_END = 1300 / 1750;

/** 火线起点（屏宽比例，负为左）。 */
export const FRONT_X_START = -0.4;
/** 火线终点（屏宽比例）：整幕净推进 0.84 屏宽，与 flame 的零位移对照。 */
export const FRONT_X_END = 0.44;

/** 阵风频率（周期/幕）：整幕约 1.7 次起落，读作阵风而非匀速风。 */
const GUST_HZ = 1.7;
/** 阵风初相：让 t=0 处已有一定风力（火不是在真空里点着的）。 */
const GUST_PHASE = 0.9;

/** 无风时的基础推进速率（进度/幕）。 */
const BASE_RATE = 0.55;
/**
 * 风助推进的耦合系数（进度/幕）。
 *
 * 与 `LEAN_MAX` 共读 `windGust`——这就是「风助火力」的同源出口。
 * 恒非负，所以推进速率恒正、火线永不回退。
 */
const WIND_COUPLING = 0.9;

/** 满风时的火舌倾角（弧度，约 26°）。 */
const LEAN_MAX = 0.46;

/**
 * 火势涌进项的幅度（进度/幕）。
 *
 * 三幕的形状来源：起火幕火还没抓住燃料、烧尽幕燃料将尽，两头都慢；
 * 蔓延幕最快。取 sin²(πt) 是因为它两端归零、中段满值，且有初等原函数
 * ——推进距离必须闭式可求（见 `gustIntegral` 上方的说明）。
 *
 * 只影响速率大小，恒非负，所以不破坏单调推进。
 */
const SURGE = 1.15;

/**
 * 火势涌进形状（0→1，两端归零、中段满值）。
 *
 * sin²(πt) = (1 − cos 2πt)/2。
 *
 * @param t 整幕归一化进度
 */
function surgeShape(t: number): number {
  return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
}

/**
 * 阵风强度（0→1，纯函数）。
 *
 * **签名的耦合枢纽**：推进速率与火舌倾角都只读这一个量。把它拆成两个
 * 各自计算的量，「风同时影响速度与倾角」就退化成两处凑参数。
 *
 * @param t 整幕归一化进度
 */
export function windGust(t: number): number {
  return 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * GUST_HZ + GUST_PHASE);
}

/**
 * 火线推进速率（进度/幕，纯函数）。
 *
 * = 基础速率 + 风助项 + 涌进项。三项皆非负 ⇒ 速率恒正 ⇒ 火线单调
 * 推进。涌进项给出三幕形状（起火慢 / 蔓延快 / 烧尽减速），风助项给出
 * 阵风起落——两者叠加，所以瞬时速率会随风波动，但每一幕的**平均**速率
 * 仍呈慢-快-慢。
 *
 * @param t 整幕归一化进度
 */
export function spreadRate(t: number): number {
  return BASE_RATE + WIND_COUPLING * windGust(t) + SURGE * surgeShape(t);
}

/**
 * 火舌倾角（弧度，纯函数）。
 *
 * 与 `spreadRate` 同读 `windGust`：风大时火跑得快**且**倒得厉害。
 *
 * @param t 整幕归一化进度
 */
export function flameLean(t: number): number {
  return LEAN_MAX * windGust(t);
}

/**
 * `windGust` 的解析原函数（∫₀ᵗ gust）。
 *
 * 推进距离要的是速率的积分。逐帧累加会让稀疏 update 与密集 update 在
 * 同一 t 画出不同帧，所以这里给闭式：
 * ∫(0.5 + 0.5·sin(ωt+φ)) dt = 0.5t − (0.5/ω)(cos(ωt+φ) − cos φ)。
 *
 * @param t 整幕归一化进度
 */
function gustIntegral(t: number): number {
  const w = Math.PI * 2 * GUST_HZ;
  return 0.5 * t - (0.5 / w) * (Math.cos(t * w + GUST_PHASE) - Math.cos(GUST_PHASE));
}

/**
 * `surgeShape` 的解析原函数（∫₀ᵗ sin²(πτ)dτ）。
 *
 * = t/2 − sin(2πt)/(4π)。
 */
function surgeIntegral(t: number): number {
  return 0.5 * t - Math.sin(t * Math.PI * 2) / (4 * Math.PI);
}

/** 未归一化的推进距离（速率的闭式积分，三项逐项解析）。 */
function rawDistance(t: number): number {
  return BASE_RATE * t + WIND_COUPLING * gustIntegral(t) + SURGE * surgeIntegral(t);
}

/** 整幕总距离，用于把进度归一到 [0,1]。 */
const TOTAL_DISTANCE = rawDistance(1);

/**
 * 火线推进进度（t=0 处 0，t=1 处 1，纯函数）。
 *
 * **严格单调增**（导数 = spreadRate/TOTAL > 0）。这是「蔓延」区别于
 * 「摆动」的第一道闸：一个来回摆的火柱在这条曲线上必然出现回退。
 * t 允许 >1：火星落点要领先火线，会问到幕外的进度。
 *
 * @param t 整幕归一化进度
 */
export function spreadProgress(t: number): number {
  if (t <= 0) return 0;
  return rawDistance(t) / TOTAL_DISTANCE;
}

/**
 * 火线当前横坐标（屏宽比例，纯函数）。
 *
 * 从 `FRONT_X_START` 单调推进到 `FRONT_X_END`，净位移 0.84 屏宽。
 * **这是与 flame 的分野本体**：那边火舌横坐标整场 `|x| < 1e-6`。
 *
 * @param t 整幕归一化进度
 */
export function frontX(t: number): number {
  return FRONT_X_START + (FRONT_X_END - FRONT_X_START) * spreadProgress(t);
}

/**
 * 火线到达某横坐标的时刻（`frontX` 的数值反解，纯函数）。
 *
 * **这是「点燃时刻是横坐标的函数」的实现本体**（规格签名）。一簇火在
 * 哪一刻点着，完全由它站在哪里决定——不是查一张固定时间表。把它换成
 * 「第 i 簇在 i·0.1 点着」，火线的推进曲线与点燃次序就脱钩了：改推进
 * 速率不再影响点燃时刻，蔓延退化成「一排火按预定节拍依次亮起」。
 *
 * 用二分而非解析反演：`spreadProgress` 含 sin 项，无初等反函数。单调性
 * 保证二分收敛唯一。
 *
 * @param x 目标横坐标（屏宽比例）
 * @returns 点燃时刻（归一化）；x 在起点之前返回 0，超出终点返回 >1 的外推值
 */
export function igniteAt(x: number): number {
  if (x <= FRONT_X_START) return 0;
  const target = (x - FRONT_X_START) / (FRONT_X_END - FRONT_X_START);
  // 终点之外按幕末速率线性外推：屏右边缘的草簇也要有一个确定的点燃时刻，
  // 否则它们会在 t=1 处一起点着（又变回固定时间表）。
  if (target >= 1) return 1 + (target - 1) * TOTAL_DISTANCE / spreadRate(1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (spreadProgress(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/**
 * 火星落点领先火线的距离（屏宽比例）。
 *
 * 火星被风吹到火线**前方**落地，在那里点起新的一簇——这是野火的实际
 * 蔓延机制（spotting）。领先量是「信使」身份的量纲证据：领先为 0 的话
 * 火星就只是火线自己的装饰，不再是引燃的因。
 */
export const EMBER_LEAD = 0.1;

/**
 * 火星落点横坐标（屏宽比例，纯函数）。
 *
 * 恒**领先**火线 `EMBER_LEAD`。与 flame 的火星（竖直脱落、只在原地上升）
 * 构成分野：这里的火星是**水平传播的引燃信使**。
 *
 * @param t 整幕归一化进度
 */
export function emberLandingX(t: number): number {
  return frontX(t) + EMBER_LEAD * (FRONT_X_END - FRONT_X_START);
}

/**
 * 火星飞抵某横坐标的时刻（纯函数）。
 *
 * 由 `emberLandingX` 反解。因为落点恒领先火线，同一个 x 必然**先**被
 * 火星够到、**后**被火线烧到——`emberArrivalT(x) < igniteAt(x)` 于是是
 * 数学后果，不是调参凑出来的先后。
 *
 * @param x 目标横坐标（屏宽比例）
 */
export function emberArrivalT(x: number): number {
  return igniteAt(x - EMBER_LEAD * (FRONT_X_END - FRONT_X_START));
}

