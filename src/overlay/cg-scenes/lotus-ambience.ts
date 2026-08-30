/**
 * 场景 29 lotus 的 ⑤露珠与⑦萤火数学（纯标量，不碰 THREE 对象）。
 *
 * 两者都挂在层叠签名的因果链上，而不是各自排一条时间线：
 * 露珠的落水时刻锚在 `layerDelay` 上——**该层开了才抖得下来**，
 * 于是互动②「露珠滚落点起小环」与互动①共享同一个层序驱动量。
 * 萤火按规格在第三幕才点亮（花瓣漂散 + 萤火）。
 *
 * 从 ./lotus-bloom 拆出来只是为了守住单文件行数上限，签名核心
 * （层序滞后、开启进度、涟漪耦合）仍然只在 lotus-bloom 一处。
 */
import { LOTUS_ACT2_END, LOTUS_LAYER_COUNT, LAYER_OPEN_SPAN, layerDelay } from './lotus-bloom';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 露珠数（电影级）。 */
export const DEW_COUNT = 8;

/**
 * 第 i 颗露珠落水的时刻（纯函数）。
 *
 * 露珠挂在第 `i % 层数` 层的花瓣上，**该层开了才会被抖下来**——
 * 所以落水时刻锚在 `layerDelay` 上而非独立排期。这让互动②
 * 「露珠滚落点起小环」同样落在层叠因果链上。
 *
 * @param i 露珠序号
 */
export function dewLandAt(i: number): number {
  const layer = i % LOTUS_LAYER_COUNT;
  // 该层开到约六成时露珠滑到瓣尖脱落；同层的两颗再错开一点。
  return layerDelay(layer) + LAYER_OPEN_SPAN * 0.6
    + Math.floor(i / LOTUS_LAYER_COUNT) * 0.055;
}

/**
 * 第 i 颗露珠的滚落进度（0 = 还在花心，1 = 已到瓣尖脱落）。
 *
 * @param t 整幕归一化进度
 * @param i 露珠序号
 */
export function dewRollProgress(t: number, i: number): number {
  const land = dewLandAt(i);
  const start = layerDelay(i % LOTUS_LAYER_COUNT);
  const span = Math.max(1e-6, land - start);
  return clamp01((t - start) / span);
}

/** 露珠溅起的小环生命期（归一化进度）。 */
const DEW_RING_LIFE = 0.16;

/**
 * 露珠溅起的小环半径（纯函数，互动②）。
 *
 * 落水前恒为 0；落水后 √ 扩散并在生命期末封顶。比莲开的大环小一个量级
 * ——规格写的是「小环」。
 *
 * @param t 整幕归一化进度
 * @param i 露珠序号
 * @param short 画面短边（像素）
 */
export function dewRingRadius(t: number, i: number, short: number): number {
  const age = t - dewLandAt(i);
  if (age <= 0) return 0;
  return short * 0.075 * Math.sqrt(Math.min(1, age / DEW_RING_LIFE));
}

/**
 * 露珠小环的亮度（纯函数）：落水瞬间最亮，一个生命期内淡尽。
 *
 * @param t 整幕归一化进度
 * @param i 露珠序号
 */
export function dewRingFade(t: number, i: number): number {
  const age = t - dewLandAt(i);
  if (age <= 0 || age >= DEW_RING_LIFE) return 0;
  return (1 - age / DEW_RING_LIFE) ** 1.4;
}

/** 萤火数（电影级）。 */
export const FIREFLY_COUNT = 14;

export type FireflyPoint = {
  /** 局部坐标（像素）。 */
  readonly x: number;
  readonly y: number;
  /** 亮度（0–1）。 */
  readonly glow: number;
};

/**
 * 第 i 只萤火此刻的位置与亮度（纯函数，闭式）。
 *
 * 环绕花体飞：半径带呼吸、角速度逐只不同，且**第三幕才真正亮起来**
 * （规格三幕：花瓣漂散 + 萤火）。亮度含一个不成整数比的双频闪烁，
 * 免得 14 只同步呼吸像跑马灯。
 *
 * @param t 整幕归一化进度
 * @param i 萤火序号
 * @param short 画面短边（像素）
 */
export function fireflyOrbit(t: number, i: number, short: number): FireflyPoint {
  const seed = ((i * 2.399963) % (Math.PI * 2));
  const omega = 0.9 + ((i * 17) % 100) / 100 * 1.4;
  const angle = seed + t * omega * Math.PI * 2;
  const band = short * (0.24 + ((i * 31) % 100) / 100 * 0.26);
  const breathe = 1 + 0.12 * Math.sin(t * Math.PI * 3.1 + seed);
  // 第三幕点亮：之前只有极弱的底光（萤火在暗处就已经在了，只是没亮）。
  const act3 = clamp01((t - LOTUS_ACT2_END) / (1 - LOTUS_ACT2_END));
  const twinkle = 0.55 + 0.45 * Math.sin(t * Math.PI * 9.3 + seed) * Math.sin(t * Math.PI * 4.1 + seed * 2);
  return {
    x: Math.cos(angle) * band * breathe,
    // 水面视角：纵向压扁，环绕看着是贴水面的椭圆轨道。
    y: Math.sin(angle) * band * breathe * 0.46,
    glow: (0.08 + act3 * 0.92) * Math.max(0, twinkle),
  };
}
