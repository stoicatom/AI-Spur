/**
 * 场景 21 bell 的签名机制之一：**泛音分层**（多分音以不同速率衰减）。
 *
 * 与 guitar（场景 19）的关键区别在数学上而非美术上：
 * - guitar 是**拨弦**——单条 exp 包络，起振极快后一路单调衰减；
 *   全部谐波共享同一条 `stringEnvelope`。
 * - bell 是**撞击后的长余韵**——钟体有一组**非谐**分音（嗡音、基音、
 *   三度、五度、名义音），每个分音有**自己的衰减时间常数**，
 *   且高频分音衰减得更快。结果是：
 *   ① 音色随时间变暗（谱心单调下降），
 *   ② 嗡音余韵远长于拨弦包络，
 *   ③ 每个分音因钟体不完全轴对称而**裂成双分音**（doublet），
 *      两个相近频率相干叠加，合成包络出现**拍频**——振幅有起伏，
 *      不是单调下降。
 *
 * 这三条都是纯函数的性质，因此可以直接验收：
 * 若实现退化成「一条 exp 曲线」，谱心会变常量、拍频会消失。
 */

/** 撞击起振时长（整幕归一化）。金属受击起振极快。 */
export const BELL_ATTACK = 0.01;

/** 嗡音角频率（rad / 归一化幕）。1200ms 幕长下约合 119Hz，大钟嗡音的量级。 */
export const HUM_OMEGA = 900;

/**
 * 波前分层基准（整幕归一化）。
 *
 * 每个分音的波前在其自身振荡周期完成后离开钟体，故延时 ∝ 1/频率比；
 * 真实周期只有毫秒量级，这里按同一比例放大到肉眼可辨的尺度，
 * 保留「高频先出、低频后出」的次序关系。
 */
export const LAYER_BASE = 0.18;

/** 撞击 → 钟体驻波建立的延时（青铜刚度高，延时极短）。 */
export const BODY_DELAY = 0.012;
/** 钟体 → 空气辐射的延时。 */
export const AIR_DELAY = 0.055;
/** 钟体级传导损耗。 */
export const BODY_GAIN = 0.88;
/** 空气辐射级传导损耗。 */
export const AIR_GAIN = 0.72;
/** 撞击脉冲的衰减率：一记短促的「咔」。 */
export const STRIKE_DECAY = 46;

/** 钟面环向弯曲波速（rad / 归一化幕）：驻波从撞击点铺开的速度。 */
export const BELL_WAVE_SPEED = 90;

export type BellPartial = {
  /** 分音名（钟学传统命名）。 */
  readonly name: string;
  /** 相对嗡音的频率比（非谐：2.4 的小三度是钟的特征）。 */
  readonly ratio: number;
  /** 角频率（rad / 归一化幕）。 */
  readonly omega: number;
  /** 衰减率（1/归一化幕）：**随频率递增**，这是本场景签名的核心。 */
  readonly decay: number;
  /** 撞击瞬间的激励幅度（硬物撞击是宽带激励，高分音也被激起）。 */
  readonly amp: number;
  /** 双分音失谐比：钟体不完全轴对称使每个分音裂成两条相近频率。 */
  readonly detune: number;
  /** 拍频角频率 = omega × detune。 */
  readonly beatOmega: number;
  /** 钟面环向节径数：频率越高节径越密（空间上的泛音分层）。 */
  readonly mode: number;
  /** 该分音波前离开钟体的分层延时。 */
  readonly layerLag: number;
};

function definePartial(
  name: string, ratio: number, decay: number,
  amp: number, detune: number, mode: number,
): BellPartial {
  const omega = HUM_OMEGA * ratio;
  return {
    name, ratio, omega, decay, amp, detune, mode,
    beatOmega: omega * detune,
    layerLag: LAYER_BASE / ratio,
  };
}

/**
 * 青铜钟的五个主分音。
 *
 * `decay` 随 `ratio` **严格递增**——高频先死、嗡音最后走，
 * 这是钟与拨弦乐器最本质的差别。若把这一列改成同一个数，
 * 谱心会变成常量、余韵会整体同步淡出，验收会红。
 */
export const BELL_PARTIALS: readonly BellPartial[] = [
  definePartial('hum', 1.0, 0.65, 1.0, 0.04, 2),
  definePartial('prime', 2.0, 1.9, 0.85, 0.026, 3),
  definePartial('tierce', 2.4, 2.9, 0.7, 0.02, 4),
  definePartial('quint', 3.0, 4.2, 0.55, 0.014, 5),
  definePartial('nominal', 4.0, 6.0, 0.45, 0.011, 6),
];

/** 全部分音的激励幅度之和，用于把合成量归一化到 0–1。 */
export const PARTIAL_AMP_SUM = BELL_PARTIALS.reduce((sum, p) => sum + p.amp, 0);

/** 取一个分音；越界直接抛，避免 undefined 沿数学链默默传播。 */
export function partialAt(index: number): BellPartial {
  const p = BELL_PARTIALS[index];
  if (!p) throw new Error(`bell partial 越界: ${index}`);
  return p;
}

/** 撞击起振：0 → 1 的极短斜坡（纯函数）。 */
export function bellAttack(since: number): number {
  if (since <= 0) return 0;
  return Math.min(1, since / BELL_ATTACK);
}

/**
 * 单个分音的**幅度包络**（不含双分音拍频，纯函数）。
 *
 * 起振后按该分音自己的 `decay` 指数衰减。这是「泛音分层」的本体：
 * 同一时刻各分音的幅度比例随时间改变。
 *
 * @param t 整幕归一化进度
 * @param index 分音序号
 * @param strikeAt 撞击时刻
 */
export function partialAmplitude(t: number, index: number, strikeAt: number): number {
  const p = partialAt(index);
  const since = t - strikeAt;
  if (since <= 0) return 0;
  return p.amp * bellAttack(since) * Math.exp(-since * p.decay);
}

/**
 * 单个分音的**可见包络**（含双分音拍频，纯函数）。
 *
 * cos(ωs) + cos(ω(1+d)s) = 2·cos(ω(1+d/2)s)·cos(ωd·s/2)，
 * 故两条相近频率相干叠加后的包络为 |cos(beatOmega·s/2)|——
 * 周期 2π/beatOmega 的**起伏**。这正是钟声的颤音（warble），
 * 也是「余韵不是单调下降」的数学来源。
 */
export function partialEnvelope(t: number, index: number, strikeAt: number): number {
  const p = partialAt(index);
  const since = t - strikeAt;
  if (since <= 0) return 0;
  return partialAmplitude(t, index, strikeAt) * Math.abs(Math.cos((p.beatOmega * since) / 2));
}

/** 某分音的拍频周期（整幕归一化）。 */
export function beatPeriod(index: number): number {
  return (Math.PI * 2) / partialAt(index).beatOmega;
}

/** 某分音幅度衰减到一半所需时长（整幕归一化）。 */
export function decayHalfLife(index: number): number {
  return Math.LN2 / partialAt(index).decay;
}

/**
 * 合成余韵包络（0–1，纯函数）。
 *
 * 各分音的可见包络之和。分音间的差频高达数十赫兹（听觉上是音高、
 * 视觉上会走样），因此这里按分音**非相干**求和，只保留每个分音内部
 * 双分音的慢拍频——那才是眼睛看得见的起伏。
 */
export function resonanceEnvelope(t: number, strikeAt: number): number {
  let sum = 0;
  for (let i = 0; i < BELL_PARTIALS.length; i += 1) sum += partialEnvelope(t, i, strikeAt);
  return sum / PARTIAL_AMP_SUM;
}

/**
 * 谱心（当前各分音的加权平均频率比，纯函数）。
 *
 * 高分音衰减快 → 谱心随时间**单调下降** → 音色越来越暗。
 * 若所有分音同衰减率，本量恒为常数（起振斜坡在比值中约掉）。
 */
export function spectralCentroid(t: number, strikeAt: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
    const a = partialAmplitude(t, i, strikeAt);
    num += partialAt(i).ratio * a;
    den += a;
  }
  return den <= 0 ? 0 : num / den;
}

/**
 * 撞击脉冲（0–1，纯函数）。
 *
 * 与分音**共用同一条起振斜坡**，因此峰值时刻同为 `strikeAt + BELL_ATTACK`，
 * 下游各段的滞后量可以直接由峰值时刻相减得到。
 * 末项把峰值归一化到 1：斜坡尚在爬升时衰减已经开始，
 * 不归一化的话峰值会停在 exp(−A·k) 而非 1。
 */
export function strikeImpulse(t: number, strikeAt: number): number {
  const since = t - strikeAt;
  if (since <= 0) return 0;
  const peak = Math.exp(-BELL_ATTACK * STRIKE_DECAY);
  return (bellAttack(since) * Math.exp(-since * STRIKE_DECAY)) / peak;
}

export type EchoChain = {
  /** 撞击脉冲（0–1）。 */
  readonly strike: number;
  /** 钟体驻波幅度，滞后撞击 BODY_DELAY。 */
  readonly body: number;
  /** 空气辐射幅度，再滞后 AIR_DELAY。 */
  readonly air: number;
};

/**
 * 撞击 → 钟体 → 空气三段**串联**传导（纯函数，因果链的本体）。
 *
 * 下游取上游**滞后后的值**，不是各跑一条曲线：
 * 因此 `air(t) ≡ body(t − AIR_DELAY) × AIR_GAIN / BODY_GAIN` 恒等成立，
 * 峰值时刻必然依次后移，撞击未发生时三段必然同时为零。
 */
export function echoChain(t: number, strikeAt: number): EchoChain {
  return {
    strike: strikeImpulse(t, strikeAt),
    body: resonanceEnvelope(t - BODY_DELAY, strikeAt) * BODY_GAIN,
    air: resonanceEnvelope(t - BODY_DELAY - AIR_DELAY, strikeAt) * AIR_GAIN,
  };
}
