/**
 * 场景 09 flame 的签名数学：**单点定驻火柱**的浮力流。
 *
 * 与 wildfire（场景 33）刻意划清：wildfire 的火是沿地面**横向推进**的
 * 火线（二维蔓延），本场景的火**驻留在柴堆一点**，只沿竖直方向流动。
 * 两者身份参数同为 fire/combustion，所以区别必须落在运动学上——
 * 这里的一切位移都是高度的函数，横向只有摆动没有位移。
 *
 * 签名的实现要点是**一个振荡器驱动两种介质**：
 * `flicker` 同时决定光影脉动的光强与火星的发射率。规格互动②
 * 「光影脉动与粒子发射频率同步」因此是同源的必然结果，不是两处
 * 各自调参凑出来的巧合。
 *
 * 全部为纯函数：update 会被以任意稀疏 t 调用，闭式求值才能保证
 * 同一 t 永远画出同一帧（本项目 ice/meteor/wind 都踩过逐帧累加的坑）。
 */

/** 第一幕结束（引燃）。 */
export const FLAME_ACT1_END = 200 / 1200;
/** 第二幕结束（火舌卷动+火星升空）。 */
export const FLAME_ACT2_END = 900 / 1200;

/** 火焰基频（Hz 量级的无量纲频率）：篝火可见的抖动速率。 */
const FLICKER_HZ = 8.4;
/** 次级频率，与基频成非整数比，避免脉动听起来是规律节拍。 */
const FLICKER_HZ2 = 13.7;

/**
 * 火焰高度包络（归一化 0→1，1 = 满高）。
 *
 * 三段：引燃期快速起势 → 卷动期维持在高位并抖动 → 渐熄期退到余烬。
 * 「维持高位」是驻留火与爆燃的分野：bomb/fireworks 的能量是单峰脉冲，
 * 篝火在整个第二幕都保持接近满值。
 *
 * @param t 整幕归一化进度
 */
export function plumeHeight(t: number): number {
  if (t <= 0) return 0;
  if (t < FLAME_ACT1_END) {
    // 引燃：pow 0.55 让火苗一起来就窜得快（柴堆表面易燃物先烧）。
    const k = t / FLAME_ACT1_END;
    return Math.pow(k, 0.55) * 0.86;
  }
  if (t < FLAME_ACT2_END) {
    const k = (t - FLAME_ACT1_END) / (FLAME_ACT2_END - FLAME_ACT1_END);
    // 高位平台：0.86→1.0 缓升，叠加抖动。抖动幅度随高度衰减，
    // 因为火焰根部被柴堆锚定，只有上半段能大幅摆。
    const base = 0.86 + k * 0.14;
    return base + flicker(t) * 0.07;
  }
  // 渐熄：燃料耗尽，pow 1.7 让它先慢后快地塌下去。
  const k = (t - FLAME_ACT2_END) / (1 - FLAME_ACT2_END);
  return Math.max(0, 1 - Math.pow(k, 1.7)) * 0.94;
}

/**
 * 火焰抖动（-1→1）。
 *
 * 双频叠加：单频会读成规律脉冲（像呼吸灯），真实火焰的抖动是
 * 多个不同尺度涡的合成。两个频率取非整数比，合成周期远长于单周期。
 *
 * @param t 整幕归一化进度
 */
export function flicker(t: number): number {
  const a = Math.sin(t * Math.PI * 2 * FLICKER_HZ);
  const b = Math.sin(t * Math.PI * 2 * FLICKER_HZ2 + 1.7);
  return a * 0.62 + b * 0.38;
}

/**
 * 光影脉动的光强（0→1）与火星发射率共用的门控。
 *
 * **这是签名的核心**：返回值同时喂给⑤光影脉动的光强和②火星的
 * 发射率。两个介质因此必然同步——把它拆成两个各自计算的量，
 * 「脉动与发射频率同步」就退化成两处凑参数。
 *
 * @param t 整幕归一化进度
 */
export function flickerGate(t: number): number {
  const h = plumeHeight(t);
  // 以高度为底：火小的时候光也弱、火星也少。抖动在此之上调制。
  return Math.max(0, h * (0.72 + flicker(t) * 0.28));
}

/**
 * 火星脱落高度（归一化，0 = 柴堆面，1 = 火舌满高处）。
 *
 * 规格互动①「火星在火舌**顶端**脱落升空」：脱落点必须**跟着火焰
 * 包络走**，不是固定高度。火矮时火星在低处就脱落，火高时脱落点也高。
 * 取 0.82 而非 1.0——真实火焰的顶端已经是断续的火舌尖，
 * 火星在略低于最高点处离开连续流。
 *
 * @param t 整幕归一化进度
 */
export function emberDetachHeight(t: number): number {
  return plumeHeight(t) * 0.82;
}

/**
 * 火星在脱落后的上升高度（归一化，相对脱落点）。
 *
 * 浮力主导：热空气托着火星走，速度先快后慢（周围空气冷却后浮力消失）。
 * pow 0.68 给出这个减速形状。
 *
 * @param age 火星寿命归一化（0 = 刚脱落，1 = 熄灭）
 */
export function emberRise(age: number): number {
  const k = Math.min(1, Math.max(0, age));
  return Math.pow(k, 0.68);
}

/**
 * 火星横向摆幅（归一化，正负均可）。
 *
 * 上升越高摆得越开：离开火柱的约束后，火星被环境涡流带偏。
 * 这是**摆动**不是位移——wildfire 的火线才有净横向位移。
 *
 * @param age 火星寿命归一化
 * @param seed 该火星的相位种子
 */
export function emberSway(age: number, seed: number): number {
  const k = Math.min(1, Math.max(0, age));
  return Math.sin(k * Math.PI * 2.3 + seed) * k * 0.34;
}

/**
 * 火焰宽度剖面（归一化半宽，输入为归一化高度）。
 *
 * 根部宽、腰部最宽、顶端收成尖——这是浮力流的典型形状（根部受
 * 柴堆供氧限制，腰部完全燃烧最鼓，顶端已耗尽燃料）。
 * 峰值刻意放在 0.22 而非中点：篝火的鼓肚很低。
 *
 * @param heightNorm 归一化高度（0 = 根，1 = 顶）
 */
export function plumeWidth(heightNorm: number): number {
  const h = Math.min(1, Math.max(0, heightNorm));
  // 根部基底宽度：火焰贴在柴堆上是一片，不是一个尖。少了这项，
  // 火舌底部会收成尖角，读起来像悬空的水滴而不是坐在柴上的火。
  const rise = ROOT_WIDTH + (1 - ROOT_WIDTH) * Math.pow(h / 0.22, 0.85);
  const fall = Math.pow((1 - h) / 0.78, 1.15);
  return h < 0.22 ? Math.min(1, rise) : Math.max(0, fall);
}

/** 火焰根部的基底半宽（归一化）：贴住柴堆的那一片。 */
const ROOT_WIDTH = 0.46;

/**
 * 内焰（蓝焰）占比（0→1）。
 *
 * 完全燃烧的蓝焰只在根部：那里氧气充足。往上是缺氧的橙焰。
 * 这个分层是规格元素①「内焰蓝外焰橙」的量化依据。
 *
 * @param heightNorm 归一化高度
 */
export function blueCoreShare(heightNorm: number): number {
  const h = Math.min(1, Math.max(0, heightNorm));
  return Math.max(0, 1 - h / 0.3);
}

/**
 * 余烬亮度（0→1）：第三幕火焰塌下后柴堆仍在暗红发光。
 *
 * 与 `plumeHeight` 反相——火灭了余烬才显出来。这让第三幕
 * 「渐熄+余烬」不是单纯的淡出，而是两个层的交接。
 *
 * @param t 整幕归一化进度
 */
export function emberGlow(t: number): number {
  if (t < FLAME_ACT2_END) {
    // 燃烧期余烬被明焰盖住，只给很弱的底光。
    return 0.16;
  }
  const k = (t - FLAME_ACT2_END) / (1 - FLAME_ACT2_END);
  // 先涨到峰再缓退：炭火在明焰退去后短暂显得最亮。
  return 0.16 + Math.sin(Math.min(1, k) * Math.PI) * 0.68;
}

/**
 * 热浪折射强度（0→1）。
 *
 * 与火焰高度同源但**滞后**：热空气柱要先积累起来才形成可见的
 * 折射。用高度的时间平移近似——闭式，不做累加。
 *
 * @param t 整幕归一化进度
 */
export function heatShimmer(t: number): number {
  const lag = 0.06;
  return plumeHeight(Math.max(0, t - lag)) * 0.82;
}
