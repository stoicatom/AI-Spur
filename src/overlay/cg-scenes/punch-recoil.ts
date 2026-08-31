/**
 * 场景 36 boxing-glove 的冲击后效：震屏、拳套形变、残影、汗滴、沙袋。
 *
 * 与 ./punch-impact 的分工：那边定义「拳往哪走、介质怎么被推开」（签名
 * 本体），这边定义「这一拳的后果落在哪些元素上」。五个函数全部读
 * `gloveSpeed` / `ringImpulse` 这两个上游量，所以它们彼此同源——
 * 拳速改一次，震屏幅度、压扁程度、汗滴远近会一起变，不存在某个元素
 * 用自己那份手填包络偷偷脱钩的可能。
 *
 * 全部纯函数，闭式求值（稀疏 update 下同一 t 必须同帧）。
 */
import {
  PUNCH_IMPACT_T,
  PUNCH_PEAK_SPEED,
  gloveReach,
  gloveSpeed,
  ringImpulse,
} from './punch-impact';

/** 拳路残影层数（规格元素④ ghost 层）。 */
export const GHOST_COUNT = 5;

/** 残影之间的相位滞后（归一化时间）。 */
export const GHOST_STAGGER = 0.028;

/** 命中瞬间拳速的归一化值：五个后效函数共同的强度来源。 */
function impactStrength(): number {
  return Math.min(1, gloveSpeed(PUNCH_IMPACT_T) / PUNCH_PEAK_SPEED);
}

/**
 * 震屏位移量（⑤，短边占比，带符号）。
 *
 * 命中后起振的阻尼正弦：幅度读命中拳速，频率固定。命中前恒为 0——
 * 相机不会为还没发生的事晃动。带符号是必要的：震屏要来回晃，
 * 取绝对值会变成「只朝一侧推开」。
 *
 * @param t 整幕归一化进度
 */
export function screenShake(t: number): number {
  if (t < PUNCH_IMPACT_T) return 0;
  const age = (t - PUNCH_IMPACT_T) / (1 - PUNCH_IMPACT_T);
  return impactStrength() * Math.exp(-age * 7.2) * Math.sin(age * Math.PI * 9.4);
}

/**
 * 拳套压缩形变（⑥，1 = 原形，< 1 = 沿拳路被压扁）。
 *
 * 瞬时压缩-回弹：命中那一刻皮革被压扁，随后弹回并**过冲**（弹性体的
 * 回弹会略微鼓出，> 1）。命中前恒为 1——拳在空中不会自己变形。
 *
 * @param t 整幕归一化进度
 */
export function gloveSquash(t: number): number {
  if (t < PUNCH_IMPACT_T) return 1;
  const age = (t - PUNCH_IMPACT_T) / (1 - PUNCH_IMPACT_T);
  const amp = 0.34 * impactStrength();
  // 阻尼余弦：age=0 时压到最扁，回弹时越过 1 再收敛。
  return 1 - amp * Math.exp(-age * 9.6) * Math.cos(age * Math.PI * 7.8);
}

/**
 * 第 i 层残影的行程。
 *
 * 残影是拳套在过去某一刻的位置，所以它读的是**同一条** `gloveReach`
 * 而非另画一条拖尾——把残影写成独立曲线会让它在拳回撤时朝错误方向拖。
 *
 * @param i 残影层序号（0 = 最近）
 * @param t 整幕归一化进度
 */
export function ghostReach(i: number, t: number): number {
  return gloveReach(Math.max(0, t - (i + 1) * GHOST_STAGGER));
}

/**
 * 第 i 层残影的不透明度。
 *
 * 越旧越淡；且整层强度读**当前拳速**——拳停住时残影必须消失
 * （静止的物体没有运动模糊）。
 *
 * @param i 残影层序号
 * @param t 整幕归一化进度
 */
export function ghostAlpha(i: number, t: number): number {
  // 取速率的绝对值再夹到 [0,1]：回拳同样是高速运动，也该拖残影，
  // 但带符号的速度会让回拳段的不透明度变成负数（材质拿到负 opacity
  // 在 three 里静默失效，画面上残影整段消失）。
  const speed = Math.min(1, Math.abs(gloveSpeed(t)) / PUNCH_PEAK_SPEED);
  return speed * 0.5 * Math.pow(0.66, i);
}

/**
 * 汗滴飞溅强度（⑦，0→1）。
 *
 * **规格互动②**：汗滴被环波溅开，所以它读第 0 层环的冲量而非另设包络。
 * 只在命中后喷——拳还在空中时汗珠还挂在手套上。
 *
 * @param t 整幕归一化进度
 */
export function sweatBurst(t: number): number {
  if (t < PUNCH_IMPACT_T) return 0;
  const age = (t - PUNCH_IMPACT_T) / (1 - PUNCH_IMPACT_T);
  return ringImpulse(0) * Math.exp(-age * 5.6);
}

/** 沙袋反应相对命中的滞后（归一化时间）：气浪跑过去需要时间。 */
export const BAG_LAG = 0.08;

/**
 * 沙袋虚影摆角（⑧，弧度）。
 *
 * 远端沙袋并未被真的击中（本场景命中的是空气），它只是被气浪推得
 * 摆了一下——所以摆角**滞后**于命中，幅度也远小于拳的冲量。
 * 这个滞后是「无实体目标」签名的旁证：真打到沙袋不会有延迟。
 *
 * @param t 整幕归一化进度
 */
export function bagSway(t: number): number {
  const start = PUNCH_IMPACT_T + BAG_LAG;
  if (t < start) return 0;
  const age = (t - start) / (1 - start);
  // 余弦而非正弦：气浪一到就把沙袋推到最远，之后才回摆。正弦会让
  // 沙袋从静止慢慢荡起来，那是被手推的样子，不是被气浪拍的样子。
  return 0.16 * ringImpulse(0) * Math.exp(-age * 2.4) * Math.cos(age * Math.PI * 2.8);
}
