/**
 * 场景 27 spear 的签名机制：螺旋气流加持的**直飞**。
 *
 * 全库唯一之处有两层：
 * 1. **发射加速段**——矛离手后仍被投掷冲量推着加速（占飞行段前 45%），
 *    之后才转入受阻力的巡航减速。同为 dash 投掷物的 bow 是**全程减速**
 *    （`arrowProgress` 的 1-exp 型，二阶差分恒负），两条进度曲线因此形状相反。
 * 2. **气流收束由速度决定**——螺旋半径写成 `spiralRadiusScale(speed)`，
 *    只吃速度、不吃时间。于是加速段半径单调收紧、巡航减速段又回张，
 *    且**同速度必同半径**（加速段与巡航段各有一个 v=0.8 的时刻，两处半径相等）。
 *    若改成「随时间单调收紧」，回张这一半会立刻失效。
 *
 * 与 ninja-star 的对照（规格明写「同为投掷但轨迹相反」）：那边是回旋，
 * 这里全程共线且不返回——本模块的位移量只有沿轴一个自由度，横向自由度
 * 在数学上就不存在。
 *
 * 本文件全是**纯标量闭式数学**：不碰 THREE、不改缓冲区。理由与 wind-field
 * 相同——闭式解让 update 可以被任意稀疏调用而画出同一帧（R-PERF-001）。
 * 帧差分求速度、逐帧累加求转角在稀疏调用下都会失真（meteor 场景吃过这个亏）。
 */

/** 场景总时长（秒），全部时间积分的量纲基准。 */
export const SPEAR_SPAN_S = 1.2;
/** 第一幕结束 = 掷出完成 = 离手时刻（250/1200）。 */
export const LAUNCH_END = 250 / 1200;
/** 第二幕结束 = 命中时刻（800/1200）。 */
export const HIT_AT = 800 / 1200;
/** 飞行段占整幕的长度。 */
export const FLIGHT_SPAN = HIT_AT - LAUNCH_END;

/** 发射加速段占飞行段的比例——规格「螺旋气流在发射加速段收束」的时间范围。 */
export const ACCEL_FRAC = 0.45;
/** 离手瞬时速度（相对巡航峰值）：加速段把它推到 1。 */
export const LAUNCH_SPEED = 0.3;
/** 巡航段的空气阻力衰减量：峰值 1 → 命中时 1-CRUISE_DRAG。 */
export const CRUISE_DRAG = 0.24;

/** 螺旋气流基础角速度（rad/s）。与屏幕尺寸**无关**：转多快是时间属性。 */
export const SWIRL_OMEGA = 30;
/** 气流沿杆后掠的归一化速率（1 = 一整条尾迹长）。 */
export const BACKWASH_RATE = 1.7;
/** 螺旋收束强度：速度 0→1 时半径缩到 1-CONVERGE。 */
export const CONVERGE = 0.62;
/** 气流断裂的时长（归一化幕）：断得极快，才叫「断」而不是「渐散」。 */
export const BREAK_SPAN = 0.02;
/** 断裂时螺旋半径的暴张倍率——连续的螺旋管被撕成散团。 */
export const RUPTURE_BURST = 2.6;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 飞行段内的归一化相位（0 = 离手，1 = 命中）。
 *
 * 掷出期与命中后都被钳住：矛在离手前没进入弹道，命中后钉在板上不再前进。
 */
export function flightPhase(t: number): number {
  return clamp01((t - LAUNCH_END) / FLIGHT_SPAN);
}

/**
 * 速度剖面（相对巡航峰值，纯函数）。
 *
 * 两段：先线性加速（投掷冲量仍在做功），再线性减速（空气阻力）。
 * 分段线性使**加速段的二阶差分恒正、巡航段恒负**，两者在验收里可分辨；
 * 若整条写成 bow 的 1-exp，加速段就不存在了。
 *
 * @param k 飞行段相位（0–1）
 */
export function speedShape(k: number): number {
  const kk = clamp01(k);
  if (kk <= ACCEL_FRAC) {
    return LAUNCH_SPEED + (1 - LAUNCH_SPEED) * (kk / ACCEL_FRAC);
  }
  const w = (kk - ACCEL_FRAC) / (1 - ACCEL_FRAC);
  return 1 - CRUISE_DRAG * w;
}

/** 速度剖面的**闭式积分** ∫₀^k speedShape。逐帧累加会依赖调用历史。 */
export function speedIntegral(k: number): number {
  const kk = clamp01(k);
  const m = Math.min(kk, ACCEL_FRAC);
  let s = LAUNCH_SPEED * m + ((1 - LAUNCH_SPEED) * m * m) / (2 * ACCEL_FRAC);
  if (kk > ACCEL_FRAC) {
    const w = (kk - ACCEL_FRAC) / (1 - ACCEL_FRAC);
    s += (1 - ACCEL_FRAC) * (w - (CRUISE_DRAG * w * w) / 2);
  }
  return s;
}

/** 全程速度积分（归一化常量）。 */
export const SPEED_TOTAL = speedIntegral(1);

/**
 * 矛沿弹道的进度（纯函数，0 = 起点，1 = 靶板）。
 *
 * 由速度积分归一化而来，因此「加速」在位置曲线上表现为二阶差分为正——
 * 这是与 bow 的可测分界点。
 */
export function spearProgress(t: number): number {
  if (t <= LAUNCH_END) return 0;
  if (t >= HIT_AT) return 1;
  return speedIntegral(flightPhase(t)) / SPEED_TOTAL;
}

/**
 * 矛**自身**的速度：离手前与命中后都为 0（破空纹与刃口高光吃它）。
 */
export function spearSpeed(t: number): number {
  if (t < LAUNCH_END || t > HIT_AT) return 0;
  return speedShape(flightPhase(t));
}

/**
 * 螺旋气流感受到的**来流速度**：相位被钳在 [0,1]，所以命中后停在末速。
 *
 * 与 `spearSpeed` 分开的理由：若气流也用 spearSpeed，命中后速度归零会让
 * 收束半径自己张开——「断裂造成的半径突变」就无法与「减速造成的回张」
 * 区分，互动②的取证会被自己的另一条曲线污染。
 */
export function airflowSpeed(t: number): number {
  return speedShape(flightPhase(t));
}

/**
 * 螺旋收束系数（互动①的因果本体，纯函数）。
 *
 * **只吃速度**：速度越高气流贴杆越紧。写成时间的函数就失去了因果——
 * 巡航段减速时半径必须重新张开，那一段是本机制的判决性证据。
 */
export function spiralRadiusScale(speed: number): number {
  return 1 - CONVERGE * clamp01(speed);
}

/** 绕杆角速度里与来流无关的底噪份额（涡管自身在转）。 */
const SWIRL_IDLE = 0.42;
/** 后掠速率里与来流无关的底噪份额。 */
const SLIP_IDLE = 0.35;
/** 飞行段的实际秒数，累计量的时间量纲。 */
const FLIGHT_SECONDS = FLIGHT_SPAN * SPEAR_SPAN_S;

/**
 * **当帧**绕杆角速度（rad/s）——螺旋旋转的唯一速率真值。
 *
 * 仿射地吃来流速度：底噪份额表示涡管自身在转，速度份额表示「来流越急
 * 转得越快」。`swirlSpin` 是它的**闭式原函数**，两者必须满足微积分基本
 * 定理——这条关系是「逐步积分」与「取速度快照 × 已过时间」的分水岭：
 * 后者的导数会多出一项 v′·k，在加速段偏差可达 40%，而它同样是 t 的闭式
 * 函数，因此「稀疏 vs 密集等价」与「转角单调」两条断言都拦不住它。
 */
export function swirlRate(t: number): number {
  return SWIRL_OMEGA * (SWIRL_IDLE + (1 - SWIRL_IDLE) * airflowSpeed(t));
}

/** **当帧**沿杆后掠速率（归一化尾迹长/秒），`swirlBackwash` 的导数。 */
export function slipRate(t: number): number {
  return BACKWASH_RATE * (SLIP_IDLE + (1 - SLIP_IDLE) * airflowSpeed(t));
}

/** 螺旋气流的**累计**绕杆转角（弧度）= ∫ swirlRate dt 的闭式解。 */
export function swirlSpin(t: number): number {
  const k = flightPhase(t);
  return SWIRL_OMEGA * FLIGHT_SECONDS
    * (SWIRL_IDLE * k + (1 - SWIRL_IDLE) * speedIntegral(k));
}

/** 螺旋气流沿杆的**累计**后掠距离（归一化尾迹长）= ∫ slipRate dt 的闭式解。 */
export function swirlBackwash(t: number): number {
  const k = flightPhase(t);
  return BACKWASH_RATE * FLIGHT_SECONDS
    * (SLIP_IDLE * k + (1 - SLIP_IDLE) * speedIntegral(k));
}

/**
 * 气流连续性（互动②的因果本体，纯函数）。
 *
 * 只是 `t - hitAt` 的函数：命中之前恒为 1（螺旋是一整条连续涡管），
 * 命中后在 BREAK_SPAN 内线性归零（涡管被靶板截断）。
 * `hitAt` 是参数而非硬编码常量——验收因此能对**整条曲线**做对齐检查
 * （换一个命中时刻，断裂点必须跟着走），而不是只比一个峰值时刻。
 */
export function airflowContinuity(t: number, hitAt: number = HIT_AT): number {
  if (t <= hitAt) return 1;
  const since = t - hitAt;
  if (since >= BREAK_SPAN) return 0;
  return 1 - since / BREAK_SPAN;
}

/**
 * 矛经过某个弹道位置的时刻（`spearProgress` 的**解析反解**）。
 *
 * 尘云各段的撕开时刻取自这个解，「裂口跟着矛走」因此是数据依赖，
 * 不是各段自己定时。分段二次式的反解即两个一元二次方程。
 *
 * @param progress 该处在弹道上的进度比例（0–1）
 */
export function spearPassTime(progress: number): number {
  const p = clamp01(progress);
  if (p <= 0) return LAUNCH_END;
  if (p >= 1) return HIT_AT;
  const target = p * SPEED_TOTAL;
  const accelArea = (ACCEL_FRAC * (1 + LAUNCH_SPEED)) / 2;
  let k: number;
  if (target <= accelArea) {
    // (1-v0)/(2A)·m² + v0·m − target = 0
    const a = (1 - LAUNCH_SPEED) / (2 * ACCEL_FRAC);
    k = (-LAUNCH_SPEED + Math.sqrt(LAUNCH_SPEED ** 2 + 4 * a * target)) / (2 * a);
  } else {
    const rest = (target - accelArea) / (1 - ACCEL_FRAC);
    // (DRAG/2)·w² − w + rest = 0，取小根（w 单调增那一支）
    const a = CRUISE_DRAG / 2;
    const w = (1 - Math.sqrt(Math.max(0, 1 - 4 * a * rest))) / (2 * a);
    k = ACCEL_FRAC + w * (1 - ACCEL_FRAC);
  }
  return LAUNCH_END + k * FLIGHT_SPAN;
}
