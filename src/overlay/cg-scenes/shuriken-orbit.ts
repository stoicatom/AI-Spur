/**
 * 场景 05 ninja-star 的签名机制：**回旋镖式**运动曲线（纯标量闭式数学）。
 *
 * 全库唯一之处：这是**唯一一条飞出去又回到起点附近的轨迹**。
 * - 与 spear（同为投掷）相反：矛只有沿轴一个自由度，逐帧位移共线且到起点
 *   的距离单调递增；这里横向自由度独立于航向，末端离起点只剩最远处的一成半。
 * - 与「弹回」也不同：回旋不是共线往返。去程与回程**分居闭合环的两侧**，
 *   所以路径包围的面积非零、同一条竖线上能切出两个相距很远的 y，
 *   而速度方向在整幕内**单向转过一整圈**（转数 ≈ 2π）而不是中途反向。
 *
 * 曲线形状取蛋形（椭圆 + 一次谐波径向捏拢）而非正椭圆：真实回旋镖的
 * 去回两支在投手附近收窄、在远端张开。`PINCH` 就是这条收窄，它让「回到
 * 起点附近」是几何性质而不是端点凑数。
 *
 * 一次投掷冲量同时驱动**回旋与自旋**：两者共用 `rateShape` 这一条速率剖面，
 * 因此第一幕自旋加速、第三幕急停回收都是同一个因的两个出口。
 *
 * 全文闭式：`update` 可被任意稀疏调用而画出同一帧（R-PERF-001）。残影层
 * 尤其依赖这一点——它对本体轨迹做**历史时刻的闭式重算**，不缓存帧。
 */

/** 整幕时长（毫秒）：规格 §4.2 场景 05。 */
export const NINJA_DURATION_MS = 1200;
/** 整幕时长（秒）。 */
export const NINJA_DURATION_S = NINJA_DURATION_MS / 1000;

/** 第一幕结束（300/1200）：掷出 + 自旋加速。 */
export const NINJA_ACT1_END = 300 / 1200;
/** 第二幕结束（900/1200）：回旋切点 ×2 + 火星。 */
export const NINJA_ACT2_END = 900 / 1200;

/**
 * 整幕扫过的环占比（<1）。
 *
 * 不取满 1：手里剑被**接住**（急停回收），停在起点近旁而不是精确回到发点。
 * 差出的这一小段就是「回收」的视觉余量。
 */
export const SWEEP_TOTAL = 0.965;

/** 起势速率（相对巡航）：离手瞬间还没转起来。 */
const RATE_START = 0.18;
/** 急停指数：第三幕按 (1-k)^Q 掉到零，Q>2 才读得出「急」。 */
const RATE_STOP_P = 2.2;

/** 第一幕的速率积分（闭式，线性起势的梯形面积）。 */
const RATE_I1 = NINJA_ACT1_END * (1 + RATE_START) / 2;
/** 前两幕的速率积分（第二幕匀速，面积即幕长）。 */
const RATE_I2 = RATE_I1 + (NINJA_ACT2_END - NINJA_ACT1_END);
/** 全幕速率积分。 */
export const RATE_TOTAL = RATE_I2 + (1 - NINJA_ACT2_END) / (RATE_STOP_P + 1);

/** 自旋圈数：一圈回旋对应九圈自旋——「高速自旋」的量纲证据。 */
export const SPIN_TURNS = 9;

/** 残影层数：**全库唯一的 5 层**，签名载体，不随档位缩放。 */
export const GHOST_LAYERS = 5;
/**
 * 残影层间滞后（归一化幕）。
 *
 * 第 k 层残影 ≡ 本体在 `t - k·GHOST_LAG` 时刻的位置。取 0.015 让第五层
 * 落在约 38° 弧后方：再长就散成一串独立飞行物，再短就糊成一团。
 */
export const GHOST_LAG = 0.015;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 归一化速率剖面（0–1，纯函数）——回旋与自旋的**共同**因。
 *
 * 三段：线性起势（投掷冲量仍在做功）→ 巡航 → 急停。
 *
 * @param t 整幕归一化进度
 */
export function rateShape(t: number): number {
  if (t <= 0) return RATE_START;
  if (t < NINJA_ACT1_END) {
    return RATE_START + (1 - RATE_START) * (t / NINJA_ACT1_END);
  }
  if (t < NINJA_ACT2_END) return 1;
  const k = clamp01((t - NINJA_ACT2_END) / (1 - NINJA_ACT2_END));
  return Math.pow(1 - k, RATE_STOP_P);
}

/** 速率剖面的**闭式原函数** ∫₀ᵗ rateShape。逐帧累加会依赖调用历史。 */
export function rateIntegral(t: number): number {
  if (t <= 0) return 0;
  if (t < NINJA_ACT1_END) {
    return RATE_START * t + (1 - RATE_START) * t * t / (2 * NINJA_ACT1_END);
  }
  if (t < NINJA_ACT2_END) return RATE_I1 + (t - NINJA_ACT1_END);
  const k = clamp01((t - NINJA_ACT2_END) / (1 - NINJA_ACT2_END));
  const p = RATE_STOP_P + 1;
  return RATE_I2 + (1 - NINJA_ACT2_END) * (1 - Math.pow(1 - k, p)) / p;
}

/** 已扫过的环占比（0 → SWEEP_TOTAL，单调不回退）。 */
export function sweepAt(t: number): number {
  if (t >= 1) return SWEEP_TOTAL;
  return SWEEP_TOTAL * rateIntegral(t) / RATE_TOTAL;
}

/** `sweepAt` 的**闭式反解**：某个环占比出现在哪一刻（切点定时取自它）。 */
export function timeAtSweep(sweep: number): number {
  const target = clamp01(sweep / SWEEP_TOTAL) * RATE_TOTAL;
  if (target <= RATE_I1) {
    // (1-r0)/(2A1)·t² + r0·t − target = 0
    const a = (1 - RATE_START) / (2 * NINJA_ACT1_END);
    return (-RATE_START + Math.sqrt(RATE_START ** 2 + 4 * a * target)) / (2 * a);
  }
  if (target <= RATE_I2) return NINJA_ACT1_END + (target - RATE_I1);
  const p = RATE_STOP_P + 1;
  const rest = (target - RATE_I2) * p / (1 - NINJA_ACT2_END);
  const k = 1 - Math.pow(Math.max(0, 1 - rest), 1 / p);
  return NINJA_ACT2_END + k * (1 - NINJA_ACT2_END);
}

/** 自旋累计转角（弧度）= SPIN_TURNS 圈 × 同一条速率积分。 */
export function spinAngle(t: number): number {
  return SPIN_TURNS * Math.PI * 2 * rateIntegral(Math.min(1, t)) / RATE_TOTAL;
}

/** 当帧自旋角速度（弧度/幕）：与回旋同源，第三幕一起急停。 */
export function spinRate(t: number): number {
  return SPIN_TURNS * Math.PI * 2 * rateShape(t) / RATE_TOTAL;
}
/**
 * 环的横向半幅（相对纵深半幅）。x 方向已归一化成「最远距离 = 1」。
 */
export const ORBIT_HALF_W = 0.5;
/** 环的横向张幅：去回两支分开的最大间距的一半。 */
export const ORBIT_HALF_H = 0.34;
/**
 * 蛋形捏拢强度。
 *
 * 真实回旋镖的去回两支在**投手附近收窄**、在远端张开。这一项就是那条
 * 收窄：它让「回到起点附近」成为曲线的几何性质，而不是把末端硬拗回去。
 * 取 0 会退化成正椭圆（去回两支在起点处也张到满幅），末端就落在离起点
 * 三成幅宽的地方，读起来是「绕了一圈没接住」。
 */
export const ORBIT_PINCH = 0.45;

/** 捏拢权重：φ=0（起点）处最窄，φ=π（远端）处为 1。 */
function pinchW(phi: number): number {
  return (1 + ORBIT_PINCH * (1 - Math.cos(phi)) / 2) / (1 + ORBIT_PINCH);
}

/** 环上一点（归一化：起点为原点，最远距离为 1）。 */
export type OrbitPoint = { readonly x: number; readonly y: number };

/**
 * 环占比 → 环上位置（闭式，签名曲线的本体）。
 *
 * `sweep=0` 在起点，`sweep=0.5` 在最远端（距起点恰好 1），`sweep=1` 回到起点。
 * 去程（sweep<0.5）走 y>0 一侧，回程走 y<0 一侧——**这是「回旋」区别于
 * 「共线弹回」的全部内涵**：同一个 x 上去回两支各有一个 y，符号相反。
 *
 * @param sweep 已扫过的环占比（0–1）
 */
export function orbitPoint(sweep: number): OrbitPoint {
  const phi = sweep * Math.PI * 2;
  return {
    x: ORBIT_HALF_W * (1 - Math.cos(phi)),
    y: ORBIT_HALF_H * Math.sin(phi) * pinchW(phi),
  };
}

/**
 * 手里剑在 t 时刻的位置（归一化，闭式）——**残影层的取值入口**。
 *
 * 残影不缓存历史帧，而是拿 `t - k·lag` 回代这个函数。闭式求值让稀疏与
 * 密集 update 在同一 t 画出同一帧（R-PERF-001），历史帧缓存做不到这点。
 *
 * @param t 整幕归一化进度（允许负值：残影在开幕时会取到 t<0，钳在起点）
 */
export function orbitAt(t: number): OrbitPoint {
  if (t <= 0) return orbitPoint(0);
  return orbitPoint(sweepAt(Math.min(1, t)));
}

/**
 * 环的切向（未归一化的一阶导，闭式）。
 *
 * 提供导数而非帧差分：手里剑的朝向、风切纹的走向都读它，帧差分在稀疏
 * 调用下会失真。切向在整幕内**单向转过约一整圈**（0.93 转），这是与
 * 「共线往返」的判决性分野——后者会在折返处一步转过 π。
 *
 * @param sweep 已扫过的环占比
 */
export function orbitTangent(sweep: number): OrbitPoint {
  const phi = sweep * Math.PI * 2;
  const dw = ORBIT_PINCH * Math.sin(phi) / (2 * (1 + ORBIT_PINCH));
  return {
    x: ORBIT_HALF_W * Math.sin(phi),
    y: ORBIT_HALF_H * (Math.cos(phi) * pinchW(phi) + Math.sin(phi) * dw),
  };
}

/**
 * 两个**回旋切点**的环占比（规格「回旋切点 ×2」）。
 *
 * 定义为横向位移的两个极值点（dy/dφ = 0）——环上离主轴最远、曲率把
 * 航向掰得最狠的两处，观感上就是「拐弯」的那两个瞬间。由 `orbitTangent`
 * 的 y 分量解析求根：`P·c² − (1+P/2)·c − P/2 = 0`（c = cos φ）。
 *
 * 不写死两个常数：`pinch` 是参数而非硬编码，验收因此能对**整条曲线**做
 * 对齐检查（换一个捏拢强度，切点必须跟着走），而不是只比一个数值。
 * 火星与光带汇合都读它，「在切点汇合」因此是数据依赖而非各自定时。
 *
 * @param pinch 捏拢强度，默认取环的实际值
 */
export function orbitCuspSweeps(pinch: number = ORBIT_PINCH): readonly [number, number] {
  // 由 dy/dφ = 0 整理得的一元二次式（p→0 时根趋于 c=0，即正椭圆的 φ=π/2）。
  const c = pinch <= 0
    ? 0
    : ((1 + pinch / 2) - Math.sqrt((1 + pinch / 2) ** 2 + 2 * pinch * pinch)) / (2 * pinch);
  const phi = Math.acos(Math.min(1, Math.max(-1, c)));
  return [phi / (Math.PI * 2), 1 - phi / (Math.PI * 2)];
}

/** 两个切点的**时刻**（切点占比经速率反解而来，都落在第二幕内）。 */
export function orbitCuspTimes(): readonly [number, number] {
  const [s1, s2] = orbitCuspSweeps();
  return [timeAtSweep(s1), timeAtSweep(s2)];
}

/**
 * 第 k 层残影的取值时刻（k=0 即本体）。
 *
 * 等间距滞后是「残影是历史位置的采样」的可测形式：层间距必须一致，
 * 否则读起来是五个各飞各的独立物体而非一条运动模糊。
 */
export function ghostSampleTime(t: number, layer: number): number {
  return t - layer * GHOST_LAG;
}

/**
 * 第 k 层残影的不透明度系数（0–1，递减）。
 *
 * 越旧的位置越淡：这是运动模糊的亮度分布。第五层留 0.18 而非 0，
 * 让 5 层都真的看得见（层数是签名，不能有一层实际上是隐形的）。
 */
export function ghostAlpha(layer: number): number {
  if (layer <= 0) return 1;
  return 1 - 0.82 * (layer / GHOST_LAYERS);
}

