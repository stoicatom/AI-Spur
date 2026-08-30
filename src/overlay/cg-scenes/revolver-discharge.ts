/**
 * 场景 34 revolver 的签名机制：**短促击发**（纯标量数学，不碰 THREE 对象）。
 *
 * 720ms 是全库最短的素材，但「短」不能只写在时长里——若焰的包络仍像
 * 其它场景那样用两三成幕长慢慢起势，观众看到的仍是一次「快放的普通
 * 特效」。真正的枪口焰是**爆燃**：火药在毫秒级完成放热，亮度几乎是
 * 一步登顶，随后按燃气膨胀冷却指数衰减。因此本签名的可测形式是
 * 「达到峰值所需的归一化时间极小 + 峰后快衰」，而不是一句时长声明。
 *
 * 第二条签名是弹壳的**刚体抛物线**（见 ./revolver-casing）：全库其它
 * 刚体层要么被力场托着（tornado 的碎物）、要么被冲击波掀起（thunder 的
 * 碎石），只有这里是「一次抛射之后纯重力自由飞行 + 落地弹跳」。
 *
 * 互动「枪口焰消退时硝烟才起」是**接力**：硝烟强度不是另写一条曲线，
 * 而是焰的**已燃尽份额**的滞后响应——数学上必然晚于焰峰，且焰峰时刻
 * 严格为零。改焰的包络会同时改硝烟的起点，这是接力关系的证据。
 */

/** 整幕时长（毫秒）：规格 §4.2 场景 34，全库最短。 */
export const REVOLVER_DURATION_MS = 720;
/** 整幕时长（秒），物理换算用。 */
export const REVOLVER_DURATION_S = REVOLVER_DURATION_MS / 1000;

/** 第一幕结束点（180/720）：击发 + 焰。 */
export const REVOLVER_ACT1_END = 180 / 720;
/** 第二幕结束点（500/720）：弹壳 + 后坐 + 硝烟。 */
export const REVOLVER_ACT2_END = 500 / 720;

/**
 * 焰达到峰值的归一化时刻 = 20ms / 720ms。
 *
 * 这个数就是签名本体：全库其余场景的起势段都在两成幕长以上
 * （tornado 0.25、downpour 0.21），本场景是它们的**十分之一**。
 */
export const FLASH_PEAK_T = 0.028;
/**
 * 上冲段指数（<1）：亚线性。
 *
 * 火药点燃是链式反应，前沿一旦建立亮度就近似跃升；用 >1 的指数会画出
 * 「慢慢亮起来」的曲线，那是火把而不是击发。
 */
const FLASH_RISE_P = 0.62;
/** 峰后衰减时间常数（归一化幕）：燃气膨胀冷却，27ms 掉到 1/e。 */
const FLASH_TAU = 0.038;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 枪口焰强度（0–1，纯函数，签名的本体）。
 *
 * 形状：`t^0.62` 极陡上冲到 t=0.028，随后 `exp(-Δt/0.038)` 衰减。
 * 到第一幕末（180ms）已衰到峰值的千分之三——「击发+焰」这一幕结束时
 * 焰真的没了，硝烟才有接力的余地。
 *
 * @param t 整幕归一化进度
 */
export function muzzleFlash(t: number): number {
  if (t <= 0) return 0;
  if (t < FLASH_PEAK_T) return Math.pow(t / FLASH_PEAK_T, FLASH_RISE_P);
  return Math.exp(-(t - FLASH_PEAK_T) / FLASH_TAU);
}

/** 焰包络在 [0, ∞) 上的总积分（闭式）：上冲段 + 衰减段。 */
const FLASH_TOTAL_FUEL = FLASH_PEAK_T / (FLASH_RISE_P + 1) + FLASH_TAU;

/**
 * 已燃尽份额（0–1，纯函数）：焰包络的归一化积分。
 *
 * 这是硝烟的**因**：硝烟是燃烧产物冷却凝结的固体微粒，产量正比于已经
 * 烧掉的火药量，而不是正比于此刻的火光。用积分而非瞬时值，是「消退时
 * 才起」这条因果的数学出口。
 *
 * @param t 整幕归一化进度
 */
export function flashSpentFraction(t: number): number {
  if (t <= 0) return 0;
  const rise = FLASH_PEAK_T / (FLASH_RISE_P + 1)
    * Math.pow(Math.min(t, FLASH_PEAK_T) / FLASH_PEAK_T, FLASH_RISE_P + 1);
  const decay = t <= FLASH_PEAK_T
    ? 0
    : FLASH_TAU * (1 - Math.exp(-(t - FLASH_PEAK_T) / FLASH_TAU));
  return clamp01((rise + decay) / FLASH_TOTAL_FUEL);
}

/**
 * 起烟门槛：焰衰到峰值的**千分之二**时烟才成为可见的一团。
 *
 * 门槛存在的物理理由是**可见性**——硝烟微粒在燃烧期就已生成，但那时
 * 它们自己在发光，被焰完全盖住；只有火焰暗到不再压过它们、微粒冷却成
 * 灰白固体，才看得见一团烟。所以判据是「焰还剩多少」，不是「烟生成了
 * 多少」（后者在焰峰时就已接近满值，见 flashSpentFraction）。
 *
 * 取千分之二让起烟落在 190ms —— 规格把硝烟排在第二幕（180–500ms），
 * 且此刻焰确实散尽了。
 */
const SMOKE_GATE_RESIDUAL = 0.002;
/** 硝烟一阶响应时间常数（归一化幕）：烟团舒张得慢，整个第二幕都在涌。 */
const SMOKE_TAU = 0.22;

/**
 * 硝烟起烟时刻（归一化，对焰包络的**闭式反解**）。
 *
 * 解 `muzzleFlash(t) = SMOKE_GATE_RESIDUAL`。不是独立写死的常数——把焰
 * 的峰值时刻或衰减常数改一改，起烟时刻会跟着移动，接力关系锁在这条
 * 反解里。同时它**必然晚于焰峰**：反解只在衰减段有根。
 */
export function smokeOnsetT(): number {
  return FLASH_PEAK_T - FLASH_TAU * Math.log(SMOKE_GATE_RESIDUAL);
}

/**
 * 硝烟浓度（0–1，纯函数，互动①的本体）。
 *
 * = 起烟后的一阶涌出 × 第三幕的消散。峰值必然落在第二幕末，与焰峰
 * （t=0.028）相隔整整两幕——「接力而非并发」因此是数学后果。
 *
 * @param t 整幕归一化进度
 */
export function smokeDensity(t: number): number {
  const onset = smokeOnsetT();
  if (t <= onset) return 0;
  const rise = 1 - Math.exp(-(t - onset) / SMOKE_TAU);
  if (t <= REVOLVER_ACT2_END) return rise;
  // 第三幕「烟散」：烟团被空气稀释，按 1.2 次幂退去（先快后慢）。
  const k = (t - REVOLVER_ACT2_END) / (1 - REVOLVER_ACT2_END);
  return rise * Math.pow(Math.max(0, 1 - k), 1.2);
}

/** 后坐峰值时刻（归一化）：40ms 到位——比焰慢，比人眼能分辨的极限快。 */
const RECOIL_PEAK_T = 0.055;

/**
 * 后坐冲量的归一化位移（0–1，纯函数）。
 *
 * 形状 `(t/T)·e^(1-t/T)`：峰值恰为 1 且落在 t=T，之后按指数回位。
 * 用它而不是正弦半周期，是因为枪的复位是**阻尼**过程——后坐到位快、
 * 回落拖尾长，不对称。
 *
 * @param t 整幕归一化进度
 */
export function recoilKick(t: number): number {
  if (t <= 0) return 0;
  const k = t / RECOIL_PEAK_T;
  return k * Math.exp(1 - k);
}

/** 相机微震频率（周期/幕）：整幕抖约 19 次，读作高频而非摇镜。 */
const SHAKE_FREQ = 26;

/**
 * 相机微震偏移（-1–1，纯函数）。
 *
 * 幅度包络与后坐同源（同一次冲量），叠一个高频振荡。同源保证了
 * 「枪往后 + 镜头在抖」是一次事件的两个表现，而非两条各自的动画。
 *
 * @param t 整幕归一化进度
 */
export function cameraShake(t: number): number {
  if (t <= 0) return 0;
  return recoilKick(t) * Math.sin(t * SHAKE_FREQ * Math.PI * 2);
}

/** 弹道火光的峰值时刻：比焰更早——子弹出膛在焰完全铺开之前。 */
const TRACER_PEAK_T = 0.012;
/** 弹道火光衰减常数：一条一闪而过的亮线。 */
const TRACER_TAU = 0.016;

/**
 * 弹道火光强度（0–1，纯函数，规格元素⑤）。
 *
 * 比枪口焰更短促：亮线是子弹自身裹着的高温燃气，随子弹离开视野即灭。
 *
 * @param t 整幕归一化进度
 */
export function tracerFlash(t: number): number {
  if (t <= 0) return 0;
  if (t < TRACER_PEAK_T) return t / TRACER_PEAK_T;
  return Math.exp(-(t - TRACER_PEAK_T) / TRACER_TAU);
}

/** 子弹飞抵远端目标的时间（归一化）：16ms，是「远端」的量纲证据。 */
export const TARGET_DELAY_T = 0.022;
/** 目标炸点衰减常数。 */
const TARGET_TAU = 0.05;

/**
 * 目标炸点亮度（0–1，纯函数，规格元素⑧）。
 *
 * 必然晚于枪口焰起亮：中间隔着子弹的飞行时间。这条「因在此、果在远处
 * 且更晚」的次序是元素⑧与⑤的分野，不是两个同时闪的光斑。
 *
 * @param t 整幕归一化进度
 */
export function targetBurst(t: number): number {
  if (t <= TARGET_DELAY_T) return 0;
  const d = t - TARGET_DELAY_T;
  // 远端命中也是一次爆燃：快升快落，但比枪口弱（距离衰减）。
  return Math.min(1, d / 0.008) * Math.exp(-d / TARGET_TAU) * 0.75;
}

/**
 * 转轮转角（弧度，纯函数，规格元素⑦）。
 *
 * 一发一格：整幕只转过 1/6 圈（60°）。真左轮的转轮在扳机行程中转位、
 * 击发瞬间已经到位并被定位销锁住，所以这里用**先快后停**的缓出曲线，
 * 而不是匀速转动。
 *
 * @param t 整幕归一化进度
 */
export function cylinderTurn(t: number): number {
  const k = clamp01(t / REVOLVER_ACT1_END);
  // 缓出：1-(1-k)^3，到第一幕末已完全到位并锁定。
  return (Math.PI * 2 / 6) * (1 - Math.pow(1 - k, 3));
}

/**
 * 焰口锥光的铺开比例（0–1，纯函数，规格「全屏」）。
 *
 * 与焰强度同源但更钝（0.55 次幂）：光锥的**几何范围**比亮度衰减得慢，
 * 焰芯灭了之后照亮的空气还亮着一瞬。
 *
 * @param t 整幕归一化进度
 */
export function coneReach(t: number): number {
  return Math.pow(muzzleFlash(t), 0.55);
}
