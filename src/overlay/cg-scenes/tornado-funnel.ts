/**
 * 场景 31 tornado 的签名机制：垂直气柱 + 吸入。
 *
 * 与 wind 的分界在**拓扑**：wind 的旋风是横扫过画面的一团涡（涡轴在
 * 平面内移动），tornado 是一根**贯通天地的垂直气柱**——半径随高度变化
 * （地面窄、高空宽），且有明确的**向心吸入**分量把外物拉进来。
 *
 * 「吸入」是本签名与所有单纯旋转场景的分界：纯涡旋只有切向速度，
 * 物体绕着转但半径不变；吸入意味着径向速度指向轴心，物体一边转一边
 * **收拢**，到近轴后被上升气流抬起。三个可观测后果同出一条因果。
 */

/** 整幕时长（毫秒）：规格给 tornado 的时长最长。 */
export const TORNADO_DURATION_MS = 1800;
/** 整幕时长（秒），物理换算用。 */
export const TORNADO_DURATION_S = TORNADO_DURATION_MS / 1000;

/** 第一幕结束点（450/1800）。 */
export const TORNADO_ACT1_END = 450 / 1800;
/** 第二幕结束点（1250/1800）。 */
export const TORNADO_ACT2_END = 1250 / 1800;

/** 漏斗在地面处的半径系数（× 画面短边）。 */
const FUNNEL_BASE_R = 0.055;
/** 漏斗在云底处的半径系数。 */
const FUNNEL_TOP_R = 0.34;

/**
 * 漏斗在某高度的半径（纯函数，签名「垂直气柱」的形状来源）。
 *
 * 真实龙卷的漏斗是**上宽下窄**的凹曲面：地面附近被摩擦收细，
 * 往上按幂律张开。用 pow 而非线性，轮廓才有那道特征的内凹。
 *
 * @param h 归一化高度（0=地面，1=云底）
 * @param short 画面短边（像素）
 * @param maturity 成形度（0=未成形，1=完全成形）
 */
export function funnelRadius(h: number, short: number, maturity: number): number {
  const k = Math.min(1, Math.max(0, h));
  // pow(k, 1.6) < k（k<1 时）：低处比线性更细，形成漏斗特征的内凹轮廓。
  // 注意指数必须 **>1**——pow(k, 0.62) 在 k<1 时反而大于 k，那是外凸。
  const profile = FUNNEL_BASE_R + (FUNNEL_TOP_R - FUNNEL_BASE_R) * Math.pow(k, 1.6);
  return short * profile * maturity;
}

/**
 * 漏斗成形度（纯函数）。
 *
 * 第一幕从零长成，第二幕维持，第三幕消散时**外翻**——外翻表现为
 * 成形度掉下去的同时半径反而暴张（规格元素⑨「消散畸变」）。
 *
 * @param t 整幕归一化进度
 */
export function funnelMaturity(t: number): number {
  if (t <= 0) return 0;
  if (t < TORNADO_ACT1_END) {
    // 成形：先慢后快（涡度积累到临界才突然拉长）。
    const k = t / TORNADO_ACT1_END;
    return Math.pow(k, 1.5);
  }
  if (t < TORNADO_ACT2_END) return 1;
  // 消散：气柱结构解体。
  const k = (t - TORNADO_ACT2_END) / (1 - TORNADO_ACT2_END);
  return Math.max(0, 1 - Math.pow(k, 0.8));
}

/**
 * 消散畸变的外翻量（纯函数，规格元素⑨）。
 *
 * 只在第三幕存在：气柱解体时气流向外翻卷，半径短暂暴张再散去。
 * 这与 funnelMaturity 的下降**同时**发生——「结构在垮而边缘在炸开」
 * 是消散的可观测特征，也是与「简单淡出」的分界。
 *
 * @param t 整幕归一化进度
 */
export function dissipationFlare(t: number): number {
  if (t < TORNADO_ACT2_END) return 0;
  const k = (t - TORNADO_ACT2_END) / (1 - TORNADO_ACT2_END);
  // 单峰：外翻迅速起、随后随结构一起散。
  return Math.sin(Math.min(1, k) * Math.PI);
}

/** 近轴的最大角速度（rad/s），与屏幕尺寸无关。 */
const PEAK_OMEGA = 5.8;
/** 吸入的径向速率系数（归一化半径/秒）。 */
const INFLOW_RATE = 0.52;

/**
 * 某半径处的角速度（纯函数）。
 *
 * Rankine 涡剖面：核内刚体旋转（ω 恒定），核外自由涡（v_θ ∝ 1/r
 * ⇒ ω ∝ 1/r²）。这让近轴转得快、远处几乎不动。
 *
 * @param r 到轴的距离（归一化到漏斗半径）
 */
export function swirlOmega(r: number): number {
  const core = 0.45;
  if (r <= core) return PEAK_OMEGA;
  const ratio = core / r;
  return PEAK_OMEGA * ratio * ratio;
}

/**
 * 某半径处的**径向吸入速率**（纯函数，签名「吸入」的本体）。
 *
 * 返回负值表示向心（半径在缩小）。远处吸得慢、近核吸得快，
 * 但到核心内部反而减弱——真实龙卷的入流在核边界最强，
 * 因为核内的离心力已经与压力梯度平衡。
 *
 * @param r 到轴的距离（归一化到漏斗半径）
 */
export function inflowRate(r: number): number {
  const core = 0.45;
  if (r <= 0.02) return 0;
  if (r <= core) {
    // 核内：入流随半径线性减弱到 0（趋于平衡）。
    return -INFLOW_RATE * (r / core);
  }
  // 核外：按 1/r 衰减，远处吸力弱。
  return -INFLOW_RATE * (core / r);
}

/**
 * 上升气流速率（纯函数）。
 *
 * 只在近轴显著——龙卷的上升支集中在管壁内侧。这解释了「碎物沿螺旋
 * 上升后被甩出」：物体先被吸近，进入上升区被抬起，升到高处漏斗变宽、
 * 切向速度带来的离心力超过入流，于是被甩出去。
 *
 * @param r 到轴的距离（归一化到漏斗半径）
 */
export function updraftRate(r: number): number {
  // 高斯型：r=0.35 附近最强（管壁内侧），远处为零。
  return Math.exp(-Math.pow((r - 0.35) / 0.4, 2));
}

/**
 * 雨滴被吸进漏斗后的「变白」程度（纯函数，互动②的因果本体）。
 *
 * 判据是**是否进入漏斗内部**：半径小于该高度的漏斗半径即为进入。
 * 因此「进入瞬间变白」是几何关系而非定时器——漏斗没长起来
 * （maturity 小）时半径小，同一位置的雨滴就还在外面、不会变白。
 *
 * @param r 到轴的距离（像素）
 * @param h 归一化高度
 * @param short 画面短边
 * @param maturity 成形度
 */
export function rainWhiten(r: number, h: number, short: number, maturity: number): number {
  const edge = funnelRadius(h, short, maturity);
  if (edge <= 0) return 0;
  // 越深入越白，边界处开始变。
  return Math.max(0, Math.min(1, 1 - r / edge));
}
