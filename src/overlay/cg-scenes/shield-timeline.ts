/**
 * 场景 25 shield 的时间轴包络：纯标量、闭式，无逐帧累加。
 *
 * 与 ./shield-deflect 分工明确：那边是**方向**（反射几何，与时间无关），
 * 这边是**强度随时间**（三幕包络）。两者刻意不混在一个文件里——签名的
 * 可测性来自反射数学本身，把它和一堆时间曲线堆在一起会让断言难以只咬
 * 签名那一条（也顶到 250 行上限）。
 *
 * 全部函数只吃 `t`（整幕归一化进度）：同一个 t 必须给出同一帧，
 * 于是 update 可以被任意稀疏地调用（R-PERF-001）。
 */
import { IMPACT_AT, SHIELD_ACT2_END } from './shield-deflect';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 多道弧波的错时间隔（归一化幕）。 */
export const WAVE_STAGGER = 0.06;
/** 弧波道数：三道足够读出"一波接一波"，又不糊成一片。 */
export const WAVE_COUNT = 3;

/**
 * 来击虚影的行进相位（0 = 出屏外，1 = 触盾，纯函数）。
 *
 * 高速来击不是匀速：菱形幻影在第一幕里**加速**扑向盾（`k²` 型），
 * 撞击后钳在 1（已经被挡住，不会穿过去）。
 *
 * @param t 整幕归一化进度
 */
export function strikeApproach(t: number): number {
  if (t >= IMPACT_AT) return 1;
  const k = clamp01(t / IMPACT_AT);
  return k * k;
}

/**
 * 撞击闪（0–1，纯函数）：**火花与裂纹共用的同一个门控**。
 *
 * 规格互动①要求"火花 + 裂纹同帧"。做法不是给两者各写一条时间线，
 * 而是让两者都读这一个函数——同帧于是成为数学必然而非巧合对齐。
 * 撞击瞬间为 1，之后按指数衰减（金属受击的闪光衰减极快）。
 *
 * @param t 整幕归一化进度
 */
export function impactFlash(t: number): number {
  if (t < IMPACT_AT) return 0;
  return Math.exp(-(t - IMPACT_AT) * 14);
}

/**
 * 冲击波弧的扩张半径（世界单位，纯函数）。
 *
 * 波从盾缘起、扩到屏缘（规格全屏要求）。近似线性扩张后被 reach 封顶：
 * 弧波在空气里近似匀速传播，衰减体现在亮度而不是速度。
 *
 * @param t 整幕归一化进度
 * @param index 第几道波（多道错时发出）
 * @param reach 屏心到最远缘的距离（像素）
 */
export function waveRadius(t: number, index: number, reach: number): number {
  const born = IMPACT_AT + index * WAVE_STAGGER;
  if (t < born) return 0;
  const age = (t - born) / (1 - born);
  return Math.min(1, age * 1.35) * reach;
}

/**
 * 冲击波亮度（0–1，纯函数）。
 *
 * 能量摊到越来越长的弧上 → 亮度随半径衰减。这与 `waveRadius` 的匀速
 * 分工明确：速度不衰减，亮度衰减。
 *
 * @param t 整幕归一化进度
 * @param index 第几道波
 * @param reach 屏心到最远缘的距离
 */
export function waveFade(t: number, index: number, reach: number): number {
  const born = IMPACT_AT + index * WAVE_STAGGER;
  if (t < born) return 0;
  const r = waveRadius(t, index, reach) / Math.max(1e-6, reach);
  return Math.max(0, 1 - r) ** 1.25;
}

/**
 * 格挡环（元素⑥）的屏障强度（0–1，纯函数）。
 *
 * 撞击时炸亮，随后在第二幕维持一层薄壳，第三幕随余辉散去。
 * 与 `impactFlash` 刻意不同源：环是**持续**的屏障，闪是**瞬时**的战损，
 * 两者若共用一条曲线，规格的"余辉"就没有载体。
 *
 * @param t 整幕归一化进度
 */
export function barrierStrength(t: number): number {
  if (t < IMPACT_AT) {
    // 来击逼近时屏障预亮一点：盾在"准备承受"。
    return 0.18 * clamp01(t / IMPACT_AT) ** 2;
  }
  if (t < SHIELD_ACT2_END) {
    const k = (t - IMPACT_AT) / (SHIELD_ACT2_END - IMPACT_AT);
    // 撞击炸亮到 1，随后回落到 0.5 的稳定壳层。
    return 1 - 0.5 * clamp01(k) ** 0.7;
  }
  const k = (t - SHIELD_ACT2_END) / (1 - SHIELD_ACT2_END);
  return 0.5 * Math.max(0, 1 - k) ** 1.4;
}

/**
 * 盾面余辉（0–1，纯函数）：第三幕的主角（规格三幕③）。
 *
 * 撞击后金属受击处发热，热辐射的余辉比闪光慢得多——所以这条曲线在
 * 第三幕仍有可观值，而 `impactFlash` 早已归零。
 *
 * @param t 整幕归一化进度
 */
export function shieldAfterglow(t: number): number {
  if (t < IMPACT_AT) return 0;
  const k = (t - IMPACT_AT) / (1 - IMPACT_AT);
  // 先升后落的单峰，峰落在第三幕入口附近（热量积累有滞后）。
  return Math.sin(clamp01(k) * Math.PI) ** 0.8;
}

/**
 * 背光剪影（元素⑧）的逆光强度（0–1，纯函数）。
 *
 * 整幕都在（是布光而非事件），撞击瞬间被冲击闪推亮一档——
 * 于是"背光"既是底色又参与那一帧的同步。
 *
 * @param t 整幕归一化进度
 */
export function backlightLevel(t: number): number {
  const base = 0.32 + 0.2 * Math.sin(clamp01(t) * Math.PI);
  return clamp01(base + impactFlash(t) * 0.35);
}

