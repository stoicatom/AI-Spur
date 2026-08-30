/**
 * 场景 37 bullwhip 的签名机制：**链段波传播 + 反解出的音爆时刻**。
 *
 * 全库唯一之处有两层，两层都写成闭式纯函数因此可以直接断言：
 *
 * 1. **能量沿链段从手端传到梢端**。第 i 段的转向动作**滞后**于第 i-1 段，
 *    滞后量 `segmentLag(i)` 是段序的严格单增函数——这是「波在传播」而非
 *    「整鞭齐动」的可测内涵。把滞后设成 0，整条鞭会同时转向，
 *    `segmentLag` 的单增断言立刻红。
 *    与 aurora 的行波分野：那边是**带面起伏**的行波（媒介无实体、可拉伸），
 *    这里是**刚性链段的转角**依次触发，段长严格守恒（前向运动学的构造保证）。
 *
 * 2. **音爆时刻是从梢速曲线反解出来的**，不是硬编码常数。
 *    `crackTime()` 在梢速上升沿上二分求解 `tipSpeed(t) = CRACK_SPEED`。
 *    改鞭鞘参数（扫过角度、锥度、段行程），音爆时刻会跟着动——
 *    写死 `CRACK_AT = 0.42` 就通不过「随参数变化」的断言。
 *
 * **鞭鞘效应**（这是「链段」区别于「一根摆动的棍」的可测内涵）：段行程
 * 沿链递减（`segmentStroke`），同样的转角在越靠梢端的段上用越短的时间
 * 走完，角速度因此逐段放大。实测梢速峰值约为手端的 43 倍，且**每个关节的
 * 速度峰值沿链严格单增**。一根匀质的棍绕手端转动时速度只随半径线性增长，
 * 峰值比等于长度比（本例 24 倍以内且不会出现逐段放大的行程压缩）。
 *
 * 本文件全是纯标量闭式数学：不碰 THREE、不逐帧累加。理由与 spear-flight
 * 相同——闭式解让 update 被任意稀疏调用都画出同一帧（R-PERF-001）。
 * 项目 2D 覆盖层的 `whip-physics` 用的是逐帧积分的质点链，概念一致
 * （链段模型 + 梢速过阈判 crack），但 CG 场景必须闭式，故独立实现。
 */

/** 链段数（鞭身采样段）。签名载体：**任何档位都不得缩减**。 */
export const CHAIN_SEGMENTS = 24;

/** 场景总时长（秒），所有速度量纲的基准（对应 whip-crack 的 1100ms）。 */
export const WHIP_SPAN_S = 1.1;

/** 第一幕结束 = 甩出完成（250/1100）。 */
export const WHIP_ACT1_END = 250 / 1100;
/** 第二幕结束 = 音爆与火花收束（750/1100）。 */
export const WHIP_ACT2_END = 750 / 1100;

/**
 * 波传到梢端所需的归一化时长——滞后量的总跨度。
 *
 * 落在第一幕之后一点：手先甩完，波还在往梢端跑，这正是甩鞭的观感。
 */
export const LAG_SPAN = 0.32;

/**
 * 滞后沿链的锥度。指数型而非线性：真鞭前段粗（惯性大、传得慢），
 * 后段细（传得快），因此靠手端的相邻滞后差最大、靠梢端最小。
 */
const LAG_TAPER = 2.4;

/** 手端段的转向行程（归一化时长）。 */
const STROKE_HAND = 0.24;
/** 梢端段的转向行程。远小于手端 = 鞭鞘效应的来源。 */
const STROKE_TIP = 0.05;

/** 链的起始朝向（弧度）：向后上方扬起。 */
const THETA_START = 2.62;
/** 链扫过的角度（弧度）：负号 = 顺时针扫向前下方。 */
const THETA_SWEEP = -3.02;

/** 手柄自身的前推位移（归一化链长）。 */
const HAND_REACH = 0.07;

/** 音爆阈值（归一化速度）。梢速穿过它的时刻就是音爆时刻。 */
export const CRACK_SPEED = 12;

/** 归一化滞后的分母，使 `segmentLag(CHAIN_SEGMENTS-1)` 恰为 `LAG_SPAN`。 */
const LAG_NORM = 1 - Math.exp(-LAG_TAPER / 2);

/** 单段长度（归一化：整鞭长为 1）。段长恒定是前向运动学的构造保证。 */
export const SEGMENT_LENGTH = 1 / CHAIN_SEGMENTS;

/** 段序归一化（0 = 手端段，1 = 梢端段）。 */
function segU(i: number): number {
  return i / (CHAIN_SEGMENTS - 1);
}

/**
 * 第 i 段转向动作的滞后时刻（归一化幕）——**签名①的核心**。
 *
 * 严格单增：`segmentLag(i) > segmentLag(i-1)` 对所有 i 成立。
 * 相邻差沿链递减（指数锥度），因此波在梢端跑得比手端快。
 *
 * @param i 段序（0 = 手端）
 */
export function segmentLag(i: number): number {
  return (LAG_SPAN * (1 - Math.exp((-LAG_TAPER * segU(i)) / 2))) / LAG_NORM;
}

/**
 * 第 i 段的转向行程（归一化时长）——鞭鞘效应的来源。
 *
 * 沿链递减：梢端段用更短的时间走完同样的转角，角速度因此被放大。
 *
 * @param i 段序
 */
export function segmentStroke(i: number): number {
  return STROKE_HAND + (STROKE_TIP - STROKE_HAND) * segU(i);
}

/** 平滑阶跃（smoothstep）：转向的位置项。 */
function ease(x: number, span: number): number {
  if (x <= 0) return 0;
  if (x >= span) return 1;
  const k = x / span;
  return k * k * (3 - 2 * k);
}

/** 上式对时间的导数：转向的角速度项（闭式，不做帧差分）。 */
function easeRate(x: number, span: number): number {
  if (x <= 0 || x >= span) return 0;
  const k = x / span;
  return (6 * k - 6 * k * k) / span;
}

/**
 * 第 i 段在时刻 t 的朝向（弧度）。
 *
 * @param i 段序
 * @param t 整幕归一化进度
 */
export function segmentAngle(i: number, t: number): number {
  return THETA_START + THETA_SWEEP * ease(t - segmentLag(i), segmentStroke(i));
}

/** 第 i 段的角速度（rad / 归一化幕）。 */
function segmentAngleRate(i: number, t: number): number {
  return THETA_SWEEP * easeRate(t - segmentLag(i), segmentStroke(i));
}

/** 手柄位置（归一化链长坐标）：链的第 0 号关节。 */
function handX(t: number): number {
  return HAND_REACH * ease(t, STROKE_HAND);
}

export type ChainPoint = { readonly x: number; readonly y: number };

/**
 * 第 i 号关节的位置（归一化链长坐标，前向运动学累加段向量）。
 *
 * 关节编号 0..CHAIN_SEGMENTS：0 是手端，CHAIN_SEGMENTS 是梢端。
 * 「累加」是**沿链**的空间累加（闭式），不是沿时间的帧累加。
 *
 * @param i 关节序号
 * @param t 整幕归一化进度
 */
export function segmentPos(i: number, t: number): ChainPoint {
  let x = handX(t);
  let y = 0;
  for (let k = 0; k < i; k += 1) {
    const a = segmentAngle(k, t);
    x += SEGMENT_LENGTH * Math.cos(a);
    y += SEGMENT_LENGTH * Math.sin(a);
  }
  return { x, y };
}

/**
 * 第 i 号关节的速度（归一化链长 / 秒）——解析求导，不做帧差分。
 *
 * @param i 关节序号
 * @param t 整幕归一化进度
 */
export function jointVelocity(i: number, t: number): ChainPoint {
  let vx = HAND_REACH * easeRate(t, STROKE_HAND);
  let vy = 0;
  for (let k = 0; k < i; k += 1) {
    const a = segmentAngle(k, t);
    const r = segmentAngleRate(k, t);
    vx += SEGMENT_LENGTH * -Math.sin(a) * r;
    vy += SEGMENT_LENGTH * Math.cos(a) * r;
  }
  return { x: vx / WHIP_SPAN_S, y: vy / WHIP_SPAN_S };
}

/** 第 i 号关节的速率。 */
export function jointSpeed(i: number, t: number): number {
  const v = jointVelocity(i, t);
  return Math.hypot(v.x, v.y);
}

/** 梢端速率（签名①的被反解量）。 */
export function tipSpeed(t: number): number {
  return jointSpeed(CHAIN_SEGMENTS, t);
}

/** 手端速率（对比基准：鞭鞘效应的分母）。 */
export function handSpeed(t: number): number {
  return jointSpeed(0, t);
}

/** 梢速峰值及其时刻（在整幕上扫描求得，不写死）。 */
function tipPeak(): { readonly value: number; readonly at: number } {
  let value = 0;
  let at = 0;
  const steps = 2000;
  for (let n = 0; n <= steps; n += 1) {
    const t = n / steps;
    const v = tipSpeed(t);
    if (v > value) {
      value = v;
      at = t;
    }
  }
  return { value, at };
}

/** 梢速峰值（鞭鞘效应的分子）。 */
export function tipPeakSpeed(): number {
  return tipPeak().value;
}

/**
 * 音爆时刻——**签名①的反解**：在梢速上升沿二分求解 `tipSpeed(t) = CRACK_SPEED`。
 *
 * 梢速在 [0, 峰值时刻] 上单增，故上升沿内根唯一。
 * 改任何鞭鞘参数（扫角、锥度、行程），返回值会跟着动。
 */
export function crackTime(): number {
  const peak = tipPeak();
  if (peak.value < CRACK_SPEED) return peak.at;
  let lo = 0;
  let hi = peak.at;
  for (let k = 0; k < 60; k += 1) {
    const mid = (lo + hi) / 2;
    if (tipSpeed(mid) < CRACK_SPEED) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 音爆那一刻梢端的位置（音爆环的源点，**不是屏心**）。 */
export function crackOrigin(): ChainPoint {
  return segmentPos(CHAIN_SEGMENTS, crackTime());
}
