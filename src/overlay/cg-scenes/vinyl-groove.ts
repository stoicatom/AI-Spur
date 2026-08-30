/**
 * 场景 40 vinyl 的签名数学：**旋转载体 + 纹路光流**。
 *
 * 与五个已完成音乐场景（guitar 弦振、drum 击打、bell 驻波、trumpet 号口、
 * harp 拨弦）划清的地方在**发声原理**：那些都是「振动体自己发声」，
 * 本场景是「旋转载体被读取」——声音不来自唱片的形变，而来自唱针在
 * 螺旋槽上的**相对运动**。所以本场景的一切都由两个量耦合驱动：
 * 盘面转角 `discAngle` 与唱针半径 `stylusRadius`。
 *
 * 签名的可验收内涵是**唱针半径单向内移**：黑胶从外圈往内圈播放，
 * 这个方向不可逆（`stylusRadius` 严格单减）。一张来回摆动的唱针
 * 读不出连续音轨——那是搜索而非播放。
 *
 * 第二条可验收内涵是**光流锚在针尖**：音轨光流是「正在被读取的那一
 * 段槽」在发亮，所以光流的半径必须**等于**唱针半径，不是独立动画。
 * 这条让「光流」不可能用一圈固定半径的装饰环冒充。
 *
 * 全部纯函数：update 会被以任意稀疏 t 调用，闭式求值才能保证同一 t
 * 永远画出同一帧（本项目 ice/meteor/wind 都踩过逐帧累加的坑）。
 */

/** 整幕时长（毫秒），规格 §4.2 场景 40。 */
export const VINYL_DURATION_MS = 1900;
/** 第一幕结束（落针）。 */
export const VINYL_ACT1_END = 380 / 1900;
/** 第二幕结束（播放）。 */
export const VINYL_ACT2_END = 1560 / 1900;

/** 唱片外缘半径占短边的比例。 */
export const DISC_RADIUS_FRAC = 0.34;
/** 音轨起始半径（外圈，归一化到唱片半径）。 */
export const TRACK_OUTER = 0.92;
/** 音轨终止半径（内圈，归一化到唱片半径）。 */
export const TRACK_INNER = 0.38;

/** 播放期转速（转/秒）。33⅓ rpm 的观感换算，非严格物理值。 */
const SPIN_RPS = 1.85;
/** 螺旋槽圈数：盘面纹路的密度载体。 */
export const GROOVE_TURNS = 26;

/**
 * 盘面累计转角（弧度，闭式原函数）。
 *
 * 三段：落针期已在转（唱盘先起速，针后落）→ 播放期匀速 → 收尾期
 * 惰行减速。取原函数而非「每帧加 omega*dt」，稀疏 update 才不失真。
 *
 * @param t 整幕归一化进度
 */
export function discAngle(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const base = Math.PI * 2 * SPIN_RPS * VINYL_DURATION_MS / 1000;
  if (k < VINYL_ACT1_END) {
    // 起速段：转速从 0 线性升到满速，角度是它的积分（二次）。
    const a = k / VINYL_ACT1_END;
    return base * VINYL_ACT1_END * a * a * 0.5;
  }
  const spinUp = base * VINYL_ACT1_END * 0.5;
  if (k < VINYL_ACT2_END) {
    return spinUp + base * (k - VINYL_ACT1_END);
  }
  // 惰行段：转速线性降到零，同样取积分。
  const full = spinUp + base * (VINYL_ACT2_END - VINYL_ACT1_END);
  const c = (k - VINYL_ACT2_END) / (1 - VINYL_ACT2_END);
  const span = 1 - VINYL_ACT2_END;
  return full + base * span * (c - c * c * 0.5);
}

/**
 * 盘面角速度（弧度/秒）。
 *
 * `discAngle` 的导数。暴露它是为了让「转速视觉」元素与转角同源：
 * 动态模糊强度读这个量，快时糊、停时清，不另调一条曲线。
 *
 * @param t 整幕归一化进度
 */
export function discOmega(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const peak = Math.PI * 2 * SPIN_RPS;
  if (k < VINYL_ACT1_END) return peak * (k / VINYL_ACT1_END);
  if (k < VINYL_ACT2_END) return peak;
  return peak * (1 - (k - VINYL_ACT2_END) / (1 - VINYL_ACT2_END));
}

/**
 * 唱针半径（归一化到唱片半径，1 = 外缘）。
 *
 * **签名核心**：严格单减——黑胶从外往内播放，这个方向不可逆。
 * 落针前针在盘外（返回 > TRACK_OUTER 表示悬空待落），播放期沿槽
 * 内移，收尾期停在内圈。
 *
 * @param t 整幕归一化进度
 */
export function stylusRadius(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k < VINYL_ACT1_END) {
    // 落针：从盘外 1.16 降到音轨起点，横向也在收（由 stylusArmAngle 表达）。
    const a = k / VINYL_ACT1_END;
    return 1.16 + (TRACK_OUTER - 1.16) * a;
  }
  if (k < VINYL_ACT2_END) {
    const a = (k - VINYL_ACT1_END) / (VINYL_ACT2_END - VINYL_ACT1_END);
    return TRACK_OUTER + (TRACK_INNER - TRACK_OUTER) * a;
  }
  return TRACK_INNER;
}

/**
 * 唱针是否已落在槽上。
 *
 * 判据由半径**反解**：针半径进入音轨范围即视为已落针，不另设时刻常量。
 * 改落针曲线，音轨光流的起亮时刻会跟着动。
 *
 * @param t 整幕归一化进度
 */
export function stylusEngaged(t: number): boolean {
  return stylusRadius(t) <= TRACK_OUTER + 1e-9;
}

/** 唱臂支点位置（归一化到唱片半径，盘心为原点）。真实唱机在盘右上方。 */
export const ARM_PIVOT_X = 1.12;
export const ARM_PIVOT_Y = 0.86;
/** 唱臂长度（归一化到唱片半径）。 */
export const ARM_LENGTH = 1.24;

/** 支点到盘心的距离（归一化）。 */
const PIVOT_DIST = Math.hypot(ARM_PIVOT_X, ARM_PIVOT_Y);
/** 支点方位角（弧度）。 */
const PIVOT_AZIMUTH = Math.atan2(ARM_PIVOT_Y, ARM_PIVOT_X);

/**
 * 唱臂摆角（弧度）：让针尖恰好落在 `stylusRadius(t)` 所声明的半径上。
 *
 * 唱臂是绕**偏置支点**转的刚体，臂沿自身 -x 方向伸出。针尖到盘心的
 * 距离由余弦定理给出，所以摆角是半径的**反解**而非线性映射——
 * 写成线性会让针尖脱离它自己声称的半径（画面上针悬在槽外，而所有
 * 纯函数断言照样全绿）。
 *
 * 三角关系：支点 P、盘心 O、针尖 S 构成三角形，|PS| = ARM_LENGTH，
 * |PO| = PIVOT_DIST，|OS| = r。∠OPS 由三边反解，臂的绝对方向即
 * 「P→O 的方向」旋过这个夹角。
 *
 * @param t 整幕归一化进度
 */
export function stylusArmAngle(t: number): number {
  const r = stylusRadius(t);
  // ∠OPS 的余弦：(|PO|² + |PS|² - |OS|²) / (2·|PO|·|PS|)。
  const cos = (PIVOT_DIST * PIVOT_DIST + ARM_LENGTH * ARM_LENGTH - r * r)
    / (2 * PIVOT_DIST * ARM_LENGTH);
  const apex = Math.acos(Math.min(1, Math.max(-1, cos)));
  // 臂沿 -x 伸出，针尖 = 支点 - (cos a, sin a)·ARM_LENGTH。余弦定理有
  // 两个解（针尖在 P→O 连线两侧），取 `+apex` 那一支：针尖落在盘的
  // 右下侧，摆角随半径内移**单减**——这是唱针从右侧落下扫向盘心的
  // 真实唱机布局。另一支会让针从左上方伸入，臂会横穿整个盘面。
  return PIVOT_AZIMUTH + apex;
}

/**
 * 音轨光流亮度（0→1）。
 *
 * 未落针时恒为 0：没在读取就没有光流。落针后随角速度起伏——
 * 「正在被读取」的物理内涵就是针与槽的相对速度。
 *
 * @param t 整幕归一化进度
 */
export function trackGlow(t: number): number {
  if (!stylusEngaged(t)) return 0;
  const peak = Math.PI * 2 * SPIN_RPS;
  return Math.min(1, discOmega(t) / peak);
}

/**
 * 螺旋槽在给定半径处的角度偏移（弧度）。
 *
 * 阿基米德螺线：半径每减少一圈的间距，角度增加 2π。盘面纹路与
 * 音轨光流共用这条曲线，光流才会沿着真实的槽走而不是画同心圆。
 *
 * @param radiusNorm 归一化半径
 */
export function grooveAngleAt(radiusNorm: number): number {
  const span = TRACK_OUTER - TRACK_INNER;
  const depth = (TRACK_OUTER - radiusNorm) / span;
  return depth * Math.PI * 2 * GROOVE_TURNS;
}

/**
 * 音尘的扬起强度（0→1）。
 *
 * 只在针落下的那一下最强，之后随播放缓退——尘是被针「犁」起来的。
 *
 * @param t 整幕归一化进度
 */
export function dustBurst(t: number): number {
  if (t < VINYL_ACT1_END) return 0;
  const a = (t - VINYL_ACT1_END) / (1 - VINYL_ACT1_END);
  return Math.exp(-a * 5.2);
}
