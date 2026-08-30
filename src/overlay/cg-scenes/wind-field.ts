/**
 * 场景 13 wind 的风旋场：Rankine 涡剖面 + 闭式时间积分。
 *
 * 单独成文件的理由：这里全是**纯标量数学**（角速度剖面、时间积分、轴心横扫、
 * 漏斗剖面），不碰 THREE 对象、不改任何缓冲区，可以被单独推理与验证；
 * 消费它的 wind-streams / wind-leaves 则全是「逐个改写位置」的副作用代码。
 * 两类混在一处，读者无法一眼分辨哪部分是可信的数学基座。
 *
 * 与场景 10 ice 风场的本质差别（设计规格 §4.1 独立性规则 1）：
 * - ice 是「定向平流 + 爆点局部涡旋扰动」，涡旋是一段插曲；
 * - wind 是「旋转流场本身就是环境」——涡是主流，尘柱随涡轴**横扫全屏**，
 *   且角速度剖面取 Rankine 涡（刚体核 + 自由涡外区）而非线性衰减。
 */

/**
 * 核内峰值角速度（rad/s）。
 *
 * 取与屏幕尺寸**无关**的量纲：涡转多快是时间属性，不该因为屏幕大就多转几圈。
 * 写成 `short * 系数` 会得到每秒十几圈的荒唐值。
 * 12 rad/s 配 sin² 包络，整幕累计约 7.2rad ≈ 1.15 圈，
 * 正是「旋风把沙尘卷过一圈多」的读数。
 */
export const PEAK_OMEGA = 12;

/** 风旋总持续秒数 = 场景总时长，使风力在首尾自然归零（成形 / 沙沉）。 */
export const WHIRL_SPAN_S = 1.2;

/** 涡轴横扫的起止（× width）：两端都在屏外，尘卷因此扫过完整屏宽。 */
export const AXIS_SWEEP_FROM = -0.4;
export const AXIS_SWEEP_TO = 0.4;

/**
 * 尘卷 mesh 的尺寸常量：mesh 与枯叶必须用同一份，否则叶子会浮在漏斗外。
 *
 * 卷顶半宽 0.42×short 刻意小于涡的作用半径 reach（0.74×short）：
 * 漏斗壁必须整段都落在涡内，否则叶子爬到卷顶时 falloff 已归零，
 * 上升气流断供，叶子在半空停住——「沿螺旋线上升」在最后一段自己失效。
 * 纵向 0.95×height 使卷顶正好抵到屏顶，叶子在离屏前一直可见。
 */
export const FUNNEL_HALF_WIDTH = 0.42;  // × short
export const FUNNEL_SPAN = 0.95;        // × height
export const FLOOR_Y = -0.44;           // × height
/** 涡轴高度（× height）：尘卷立在地面上，重心本就偏下。 */
export const AXIS_Y = -0.05;

/** 把时间夹到 [0, span]：风停之后积分不再增长，涡停在原角度而不是转回去。 */
function clampSpan(elapsed: number, span: number): number {
  return Math.min(Math.max(0, elapsed), span);
}

/**
 * 风力包络 sin²(πτ/span)。
 *
 * 用 sin² 而不是 sin：平方后**两端一阶导也为 0**，
 * 于是「气旋成形」与「减弱沙沉」都是缓入缓出，中段满力。
 * 值域恒为 [0, 1] 且非负，角速度因此永不反向——涡不会转回去。
 */
export function gustEnvelope(elapsed: number, span: number): number {
  if (span <= 0) return 0;
  const s = Math.sin((Math.PI * clampSpan(elapsed, span)) / span);
  return s * s;
}

/**
 * 包络的**闭式积分**：∫₀^τ sin²(πu/span) du = τ/2 − span/(4π)·sin(2πτ/span)。
 *
 * 不做逐帧累加：update 会被以任意 t 稀疏调用（测试就是跳着调），
 * 累加式积分的结果依赖调用历史，同一 t 会画出不同的帧。
 * 同时也不能写 `速度 × elapsed`——风力自身在变，那样会把「风在变强」重复计一次。
 */
export function envelopeIntegral(elapsed: number, span: number): number {
  if (span <= 0) return 0;
  const k = clampSpan(elapsed, span);
  return k / 2 - (span / (4 * Math.PI)) * Math.sin((2 * Math.PI * k) / span);
}

/**
 * Rankine 涡的角速度衰减系数（0→1）。
 *
 * 真实尘卷不是「中心快、线性变慢」，而是分两段：
 * - r ≤ coreRadius：**刚体核**，整根尘柱以同一角速度同步转（系数恒 1）；
 * - coreRadius < r < reach：**自由涡**，切向速度 v_θ ∝ 1/r ⇒ ω ∝ (rc/r)²。
 *
 * 刚体核是关键：它让「核内一整片尘粒共同转过一大段弧长」成为可观测量。
 * 若改用线性衰减（中心 1、边缘 0），弧长 r·Δθ 在中心因 r 小而小、
 * 在边缘因系数小而小，峰值被挤在中段，旋转特征远不如刚体核明显。
 *
 * @param r 到涡轴的距离
 * @param coreRadius 刚体核半径
 * @param reach 涡的作用半径，此外为 0
 */
export function swirlFalloff(r: number, coreRadius: number, reach: number): number {
  if (reach <= 0 || coreRadius <= 0 || r >= reach) return 0;
  const core = r <= coreRadius ? 1 : (coreRadius / r) ** 2;
  // 外缘羽化：自由涡到 reach 处仍有残余角速度，硬切会露出一圈硬边。
  const taperStart = reach * 0.62;
  if (r <= taperStart) return core;
  const taper = 1 - (r - taperStart) / (reach - taperStart);
  return core * taper * taper;
}

/**
 * 漏斗侧壁半径剖面（归一化高度 → 半径）。
 *
 * 与 DUST_FUNNEL_FRAGMENT 里的剖面**同式**：尘卷 mesh 与枯叶刚体各算一套的话，
 * 叶子会浮在漏斗壁外面，「沿尘卷螺旋线上升」就成了空话。
 * pow(h, 0.72) 让腰部内凹，直线锥像个纸筒。
 *
 * @param hNorm 归一化高度（0 = 卷底，1 = 卷顶）
 * @param halfWidth 卷顶半宽（世界单位）
 */
export function funnelRadiusAt(hNorm: number, halfWidth: number): number {
  const h = Math.min(1, Math.max(0, hNorm));
  return halfWidth * (0.12 + 0.88 * h ** 0.72);
}

/** 构造一帧风旋场所需的时间/尺度状态。 */
export type WhirlInput = {
  /** 自场景起始的绝对秒数，用于全部时间积分。 */
  elapsed: number;
  /** 归一化总进度，用于轴心横扫。 */
  t: number;
  /** 尾幕进度，用于沙沉。 */
  act3: number;
  /** 尘卷成形度（0→1），与 mesh 的 uForm 同一个量。 */
  form: number;
  width: number;
  height: number;
};

/** 一帧风旋场——整幕**唯一**的风场真值，尘幕与枯叶都消费它。 */
export type WhirlField = {
  /** 涡轴当帧位置（世界坐标）。 */
  axisX: number;
  axisY: number;
  /**
   * 涡轴起始位置：尘柱的**成员归属**以基位到此点的距离判定。
   *
   * 不用当帧轴位判定：轴在横扫，那样每帧都有粒子被拽进/丢出涡区，
   * 被拽进的那一刻位置会从平流位跳到旋转位（视觉上是弹出），
   * 且统计上把空间差异抹平。以起始轴为锚，尘柱成员固定，
   * 整根柱子随轴一起平移——旅行中的尘卷本来就是带着自己的沙走。
   */
  anchorX: number;
  /** 涡轴横扫速度（世界单位/秒）：尘柱内的气流整体随之平移。 */
  axisVx: number;
  /** 累计转角（刚体核内，弧度）：已积分好，消费方不得再乘时间。 */
  spin: number;
  /** 当帧角速度（刚体核内，rad/s）：给枯叶的气动力用。 */
  omega: number;
  /** 环境风已积分的输运距离（世界单位）。 */
  drift: number;
  /** 环境风向（弧度）。 */
  angle: number;
  /** 风力强度 0→1，砂纹与频闪的驱动量。 */
  gust: number;
  /** 上升气流速度（世界单位/秒），核内满值：给枯叶的气动力用。 */
  updraft: number;
  /** 上升气流已积分的**抬升距离**：给逐粒改位置的尘幕用。 */
  lift: number;
  /** 向心内吸速度（世界单位/秒）：给枯叶的气动力用。 */
  inflow: number;
  /** 向心内吸已积分的**收拢距离**：给尘幕用，单调收紧才是螺旋。 */
  inflowDist: number;
  coreRadius: number;
  reach: number;
  /** 沙沉量（尾幕的向下沉降位移）。 */
  settle: number;
  /** 尘卷成形度（0→1），与 mesh 的 uForm 是同一个量。 */
  form: number;
  /** 漏斗壁剖面的两个尺寸参数，与 mesh 的 geometry/uForm 完全一致。 */
  funnelHalfWidth: number;
  funnelSpan: number;
  funnelBaseY: number;
};

/**
 * 由时间状态构造当帧风场。
 *
 * 抽成一个函数不只是为了行数：尘幕（Points）与枯叶（刚体）必须消费**同一个**
 * WhirlField，「枯叶沿尘卷螺旋线上升」才是一份真值驱动两套表现；
 * 各自算一份风的话，叶子与尘的旋向、强弱会各演各的，互动就成了两条巧合曲线。
 */
export function whirlField(input: WhirlInput): WhirlField {
  const { elapsed, t, act3, form, width, height } = input;
  const short = Math.min(width, height);
  const span = WHIRL_SPAN_S;
  const gust = gustEnvelope(elapsed, span);
  const integral = envelopeIntegral(elapsed, span);
  const k = Math.min(1, Math.max(0, t));
  const sweep = AXIS_SWEEP_TO - AXIS_SWEEP_FROM;

  return {
    // 轴心横扫：整幕从左屏外走到右屏外，配上锥体自身宽度即覆盖全屏宽。
    // 取 t 的线性映射而不是让它跟随风力包络：包络会把行程挤在中段，
    // 使涡轴在主幕的平移量盖过旋转弧长，「旋转」反而被自己的位移淹没。
    axisX: width * (AXIS_SWEEP_FROM + sweep * k),
    axisY: height * AXIS_Y,
    anchorX: width * AXIS_SWEEP_FROM,
    axisVx: (width * sweep) / span,
    spin: PEAK_OMEGA * integral,
    omega: PEAK_OMEGA * gust,
    // 传已积分好的输运距离而非当帧速度，理由见 envelopeIntegral。
    drift: short * 0.55 * clampSpan(elapsed, span) + short * 0.5 * integral,
    // 环境风近水平并缓慢偏转：定向恒风会让满屏尘粒像一张平移的贴图。
    angle: 0.16 - k * 0.3 + Math.sin(k * Math.PI * 2) * 0.05,
    gust,
    updraft: short * 0.95 * gust,
    lift: short * 0.62 * integral,
    inflow: short * 0.22 * gust,
    inflowDist: short * 0.3 * integral,
    coreRadius: short * 0.26,
    reach: short * 0.74,
    settle: act3 * height * 0.16,
    form,
    funnelHalfWidth: short * FUNNEL_HALF_WIDTH * Math.max(0.02, form),
    funnelSpan: height * FUNNEL_SPAN * Math.max(0.02, form),
    funnelBaseY: height * FLOOR_Y,
  };
}

/**
 * 风声频闪的节奏（0→1）：⑧「粒子密度节奏」的唯一驱动量。
 *
 * 两个不可约频率叠加（4.6Hz 的阵风颤动 × 1.7Hz 的强弱起伏），
 * 单一正弦听起来像机械频闪，叠加后才有风声那种不规则的一阵一阵。
 */
export function windBeat(elapsed: number): number {
  const fast = Math.sin(elapsed * Math.PI * 2 * 4.6);
  const slow = Math.sin(elapsed * Math.PI * 2 * 1.7);
  return Math.min(1, Math.max(0, 0.5 + 0.5 * fast * (0.55 + 0.45 * slow)));
}
