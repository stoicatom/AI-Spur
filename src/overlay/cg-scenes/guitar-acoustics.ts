/**
 * 场景 19 guitar 的签名机制：弦→音孔→环的层级传导。
 *
 * 全库唯一之处在于本场景的能量有**三段串联的传导链**：
 * 拨片先激励一根弦（弦振），弦振经琴桥汇入琴腔（共鸣），
 * 琴腔再把声能辐射成音浪环。每一段都比上一段**滞后一个固定延时**，
 * 且下一段的幅度由上一段驱动——不是三层各跑一条正弦。
 *
 * 写成纯函数是为了让「层级传导」可以直接验收：验收只要检查
 * 三段的峰值时刻依次滞后、且切断上游会让下游归零。
 */

/** 弦振→琴腔的传导延时（整幕归一化）。声速在木材里很快，延时很短。 */
export const BRIDGE_DELAY = 0.045;
/** 琴腔→音浪环的辐射延时（整幕归一化）。 */
export const RADIATE_DELAY = 0.07;

/** 弦的衰减时间常数：拨弦后振幅按 exp 衰减。 */
const STRING_DECAY = 3.1;

export type AcousticChain = {
  /** 弦振幅度（0–1）。 */
  readonly string: number;
  /** 琴腔共鸣幅度（0–1），滞后弦振 BRIDGE_DELAY。 */
  readonly body: number;
  /** 音浪射幅度（0–1），再滞后 RADIATE_DELAY。 */
  readonly radiate: number;
};

/**
 * 单根弦被拨后的振幅包络（纯函数）。
 *
 * 起振极快（拨片离弦瞬间达峰），随后 exp 衰减——这是拨弦乐器的
 * 典型包络，与 bell 的「撞击后长余韵」和 drum 的「一击即散」不同。
 *
 * @param t 整幕归一化进度
 * @param pluckAt 该弦被拨的时刻
 */
export function stringEnvelope(t: number, pluckAt: number): number {
  const since = t - pluckAt;
  if (since < 0) return 0;
  // 起振段占 1.5% 幕长：足够快到看着像"拨"，又不至于在稀疏采样下被跳过。
  const attack = Math.min(1, since / 0.015);
  return attack * Math.exp(-since * STRING_DECAY);
}

/**
 * 三段传导链在某一时刻的状态（纯函数，签名的可验收核心）。
 *
 * 下游取上游**滞后后的值**，因此上游为零时下游必然为零，
 * 峰值时刻也必然依次后移。系数 <1 表示每级传导都有损耗。
 *
 * @param t 整幕归一化进度
 * @param pluckAt 拨弦时刻
 */
export function acousticChain(t: number, pluckAt: number): AcousticChain {
  const string = stringEnvelope(t, pluckAt);
  // 琴腔听到的是 BRIDGE_DELAY 之前的弦振。
  const body = stringEnvelope(t - BRIDGE_DELAY, pluckAt) * 0.82;
  // 环辐射的是再滞后 RADIATE_DELAY 的琴腔能量。
  const radiate = stringEnvelope(t - BRIDGE_DELAY - RADIATE_DELAY, pluckAt) * 0.7;
  return { string, body, radiate };
}

/**
 * 弦上某点的横向位移（纯函数）。
 *
 * 驻波：位移 = 包络 × sin(nπx) × cos(ωt)。n 是谐波次数，
 * 端点（x=0 与 x=1）恒为零——这是「两端固定」的物理约束，
 * 也是与 harp（单端固定的拨片）区分的地方。
 *
 * @param x 沿弦的归一化位置（0–1）
 * @param t 整幕归一化进度
 * @param pluckAt 拨弦时刻
 * @param harmonic 谐波次数（1 = 基频）
 * @param omega 角频率（rad / 归一化幕）
 */
export function stringDisplacement(
  x: number,
  t: number,
  pluckAt: number,
  harmonic: number,
  omega: number,
): number {
  const env = stringEnvelope(t, pluckAt);
  if (env <= 0) return 0;
  const mode = Math.sin(harmonic * Math.PI * Math.min(1, Math.max(0, x)));
  return env * mode * Math.cos((t - pluckAt) * omega);
}

/**
 * 泛音点位置：第 n 次谐波的波节所在（纯函数）。
 *
 * n 次谐波有 n-1 个内部波节，位于 k/n（k=1..n-1）。
 * 泛音点闪烁在波节上才是物理正确的——那里弦几乎不动，
 * 能量集中在附近的波腹。
 *
 * @param harmonic 谐波次数
 */
export function harmonicNodes(harmonic: number): number[] {
  const out: number[] = [];
  for (let k = 1; k < harmonic; k += 1) out.push(k / harmonic);
  return out;
}
