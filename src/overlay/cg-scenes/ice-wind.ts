/**
 * 场景 10 ice 的风场时间积分：把「速度/角速度随时间变化」化为闭式位移。
 *
 * 从 ice-veil 分出来的理由不只是行数上限：这两个函数是**纯标量数学**，
 * 不碰 THREE 对象、不改任何缓冲区，可以被单独推理和验证；
 * 而 ice-veil 的其余部分全是「逐粒改写 position 属性」的副作用代码。
 * 两类东西混在一个文件里，读者无法一眼看出哪部分是可信的数学基座。
 */

import type { WindField } from './ice-veil';


/**
 * 风的输运距离：速度对时间的**闭式积分**。
 *
 * 不做逐帧累加：场景 update 会被以任意 t 调用（测试跳着调），
 * 累加式积分的结果依赖调用历史，同一 t 会画出不同的帧。
 * 解析积分让 t 唯一决定画面。
 *
 * 速度模型 v(τ) = base + peak·sin(π·τ/span)（主幕最强的风刀），
 * 其积分为 base·τ + peak·(span/π)·(1 − cos(π·τ/span))。
 *
 * @param elapsed 自雪幕起始的秒数
 * @param base 基础风速（世界单位/秒）
 * @param peak 主幕风刀的峰值增量
 * @param span 风刀的持续秒数
 */
export function windDrift(elapsed: number, base: number, peak: number, span: number): number {
  const t = Math.max(0, elapsed);
  if (span <= 0) return base * t;
  // 风刀结束后速度回落到 base，积分改为常速延续，避免余弦继续摆动。
  const k = Math.min(t, span);
  const gust = peak * (span / Math.PI) * (1 - Math.cos((Math.PI * k) / span));
  return base * t + gust;
}

/**
 * 涡旋累计转角：角速度对时间的闭式积分，理由同 windDrift。
 *
 * 角速度 ω(τ) = peak·sin(π·τ/span)，积分为 peak·(span/π)·(1 − cos(π·τ/span))。
 * 转角只增不减：涡旋减弱是「转得慢了」，不是「转回去」。
 *
 * @param elapsed 自涡旋生成起的秒数
 * @param peak 峰值角速度（弧度/秒）
 * @param span 涡旋的持续秒数
 */
export function vortexSpin(elapsed: number, peak: number, span: number): number {
  const t = Math.max(0, elapsed);
  if (span <= 0 || peak <= 0) return 0;
  const k = Math.min(t, span);
  return peak * (span / Math.PI) * (1 - Math.cos((Math.PI * k) / span));
}

/** 构造一帧风场所需的时间/尺度状态。 */
export type IceWindInput = {
  /** 当帧风向（弧度），由 windAngle 扫掠得出。 */
  angle: number;
  /** 自场景起始的绝对秒数。 */
  elapsed: number;
  /** 蓄势幕进度：控制雪幕从两侧压入的前沿。 */
  act1: number;
  /** 尾幕进度：涡旋在此衰减。 */
  act3: number;
  /** 屏幕短边，用作风速与涡旋半径的尺度基准。 */
  short: number;
  burstX: number;
  burstY: number;
  /** 涡旋（及风刀）的持续秒数。 */
  vortexSpan: number;
  /** 涡旋起始时刻（秒），第二幕才被炸出来。 */
  vortexStart: number;
};

/**
 * 由时间状态构造当帧风场——整幕**唯一**的风场真值。
 *
 * 抽成函数不只是为了行数：两层雪幕必须消费同一个 WindField，
 * 互动才是「一份真值驱动两层」。若各层自行算风，近远景会各演各的，
 * 视差就退化成两套无关动画。
 */
export function iceWindField(input: IceWindInput): WindField {
  const { angle, elapsed, act1, act3, short } = input;
  return {
    angle,
    // 传已积分好的输运距离而不是当帧速度：风速本身在变，
    // 让消费方去乘 elapsed 会把「风在变强」重复计一次。
    drift: windDrift(elapsed, short * 0.5, short * 0.4, input.vortexSpan),
    vortexX: input.burstX,
    vortexY: input.burstY,
    // spin 是累计**转角**，由角速度闭式积分而来。峰值角速度 3.4 rad/s
    // 与屏幕尺寸无关——涡旋转多快是时间属性，不该因为屏大就转更多圈。
    // 尾幕乘 (1 - act3) 让涡旋散去（转得慢，不是转回去）。
    spin: vortexSpin(elapsed - input.vortexStart, 3.4, input.vortexSpan) * (1 - act3 * 0.8),
    vortexRadius: short * 0.42,
    // 蓄势幕雪只在两侧成墙，主幕起前沿向中心推进到满幅。
    gather: Math.max(0, 1 - act1),
  };
}
