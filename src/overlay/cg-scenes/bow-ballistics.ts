/**
 * 场景 24 bow 的签名机制：拉弓-放箭-云缝合拢。
 *
 * 全库唯一之处在于这条叙事有**可逆形变**：云被箭划开一道缝，缝在箭
 * 过去之后缓慢愈合。其它场景的形变都是单向的（碎了就是碎了、爆了就
 * 散了），只有这里的介质会自己长回去。
 *
 * 与 katana 的区分也在这里：katana 同为 dash 物理，但刀过之处是永久
 * 的斩痕；bow 的云缝是暂态的。两者的形变曲线形状因此相反——katana
 * 的裂口单调张开，bow 的缝张开后回落。
 */

/** 拉弓蓄力结束（第一幕末，300/1200）。 */
export const DRAW_END = 0.25;
/** 箭飞行结束（第二幕末，800/1200）。 */
export const FLIGHT_END = 2 / 3;

/**
 * 弓弦拉伸量（纯函数）。
 *
 * 第一幕拉满（0→1，越拉越慢，弓越硬越费力），松弦瞬间**急速**回弹到 0，
 * 之后维持松弛。回弹比拉弓快一个数量级——这是弹性势能释放的特征。
 *
 * @param t 整幕归一化进度
 */
export function stringDraw(t: number): number {
  if (t <= 0) return 0;
  if (t < DRAW_END) {
    const k = t / DRAW_END;
    // sqrt 型：起手快、接近满弓时费力，越拉越慢。
    return Math.sqrt(k);
  }
  // 松弦：极短的回弹窗口（占幕 2.5%），之后为 0。
  const since = t - DRAW_END;
  const release = 0.025;
  if (since >= release) return 0;
  return 1 - since / release;
}

/**
 * 弓身震动幅度（纯函数，互动①的因果本体）。
 *
 * 由**弓弦回弹速度**驱动而非独立的定时器：速度是 stringDraw 的负导数，
 * 松弦瞬间达到峰值，随后按 exp 衰减。因此「弦松得越急、弓震得越狠」
 * 是同一个量的两个出口。
 *
 * @param t 整幕归一化进度
 */
export function limbShake(t: number): number {
  const since = t - DRAW_END;
  if (since < 0) return 0;
  // 松弦速度 = 1/release，是一个大值；用它做初始幅度，再指数衰减。
  const envelope = Math.exp(-since * 11);
  // 高频载波：弓臂来回抖。
  return Math.abs(Math.sin(since * 96)) * envelope;
}

/**
 * 箭沿轨迹的进度（纯函数）。
 *
 * 离弦即达最高速，此后受空气阻力**减速**——与 meteor 的再入加速
 * 相反。用 1-exp 型：前段快、后段渐缓。
 *
 * @param t 整幕归一化进度
 */
export function arrowProgress(t: number): number {
  if (t <= DRAW_END) return 0;
  if (t >= FLIGHT_END) return 1;
  const k = (t - DRAW_END) / (FLIGHT_END - DRAW_END);
  // 归一化的 1-exp：k=0 时 0，k=1 时 1，导数单调递减。
  const decay = 3.2;
  return (1 - Math.exp(-decay * k)) / (1 - Math.exp(-decay));
}

/**
 * 云缝在某处的张开量（纯函数，签名的可验收核心）。
 *
 * 三段：箭未到 → 0；箭刚过 → 迅速张开到 1；此后按愈合时间常数
 * **回落**。回落是本签名与所有「单向破坏」场景的分界——
 * 若把愈合去掉，缝会一直大张，验收会红。
 *
 * @param t 整幕归一化进度
 * @param passAt 箭经过该处的时刻
 */
export function riftOpening(t: number, passAt: number): number {
  const since = t - passAt;
  if (since < 0) return 0;
  // 张开：极快（占幕 3%）。
  const openSpan = 0.03;
  if (since < openSpan) return since / openSpan;
  // 愈合：exp 回落，时间常数比张开慢一个数量级。
  // 系数 7.5 由规格「800–1200ms 云缝合拢」定：最后一段在
  // FLIGHT_END(0.667) 被划开，到幕末只有 0.33 幕可愈合，
  // 用 3.4 时末值仍有 0.34（缝还大张着），7.5 才降到 0.08。
  return Math.exp(-(since - openSpan) * 7.5);
}

/**
 * 箭经过某个横向位置的时刻（arrowProgress 的反解，纯函数）。
 *
 * 云缝各段的张开时刻取自这个解，因此「缝跟着箭走」是数据依赖，
 * 而不是各段自己定时。
 *
 * @param progress 该处在箭路上的进度比例（0–1）
 */
export function arrowPassTime(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  if (p <= 0) return DRAW_END;
  if (p >= 1) return FLIGHT_END;
  const decay = 3.2;
  // 解 (1-exp(-d·k))/(1-exp(-d)) = p 得 k。
  const k = -Math.log(1 - p * (1 - Math.exp(-decay))) / decay;
  return DRAW_END + k * (FLIGHT_END - DRAW_END);
}
