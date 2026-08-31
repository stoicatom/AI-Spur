/**
 * 场景 39 saxophone 的签名数学：**慵懒摇曳**。
 *
 * 与两个最接近的场景划清界限，两条都可断言：
 *
 * 1. **对 piano（场景 38）的跃动**：piano 的音符竖向轨迹是抛物线段拼接，
 *    每跳有起跳与落点，竖向速度在落点**换号**——有拍点。本场景的音符
 *    竖向是**严格单调且光滑**的上升（`noteRise` 全程导数 > 0，二阶连续），
 *    水平才振荡。摇曳没有拍点，这是「慵懒」的数学定义。
 * 2. **对 trumpet（场景 23）的定向号口**：trumpet 的音符沿号口轴向被
 *    **定向喷出**（一个初速方向 + 增益随偏角衰减）。本场景的音符没有
 *    喷射方向，它们从管口**飘出后左右摇摆**，水平位移的符号反复变化
 *    （`noteSway` 全程多次过零），任何定向喷射都做不到这件事。
 *
 * 互动①**摇摆幅度随旋律强弱变化**：`noteSway` 的幅度因子直接乘
 * `melodyIntensity`，所以「旋律强 → 摆得开」是同一个量的两次使用；
 * 互动②**光束随音符密度摆动**：`beamAngle` 读同一条强度包络。
 *
 * 全部纯函数：update 会被以任意稀疏 t 调用，闭式求值才能保证同一 t
 * 永远画出同一帧（本项目 ice/meteor/wind 都踩过逐帧累加的坑）。
 */

/** 整幕时长（毫秒），规格 §4.2 场景 39。 */
export const SAX_DURATION_MS = 1800;
/** 第一幕结束（起吹）。 */
export const SAX_ACT1_END = 400 / 1800;
/** 第二幕结束（按键+音符摇曳）。 */
export const SAX_ACT2_END = 1350 / 1800;

/** 音符个数（摇曳的载体，覆盖上半屏）。 */
export const SAX_NOTE_COUNT = 6;
/** 按键个数（规格元素②：按序亮起）。 */
export const SAX_KEY_COUNT = 5;
/** 摇摆光束数（规格元素⑧：两束交叉光）。 */
export const SAX_BEAM_COUNT = 2;

/** 音符竖向行程的时长（整幕归一化）：慢，所以「慵懒」。 */
const RISE_SPAN = 0.62;
/** 摇摆的基础周期数：整个行程摆几个来回。 */
const SWAY_CYCLES = 2.6;

/**
 * 第 n 个音符的吹出时刻（整幕归一化）。
 *
 * 铺在第二幕内，**等间隔**——与 piano 的「前疏后密」正相反：爵士的
 * 慵懒感来自稳定的呼吸节奏，不是渐促的乐句。
 *
 * @param n 音符序号
 * @param count 音符总数
 */
export function noteBlowAt(n: number, count = SAX_NOTE_COUNT): number {
  if (n < 0 || n >= count) return Number.POSITIVE_INFINITY;
  const span = SAX_ACT2_END - SAX_ACT1_END;
  return SAX_ACT1_END + (n / count) * span;
}

/**
 * 音符 n 的行程进度（0 = 管口，1 = 上半屏顶）。
 *
 * 吹出前恒为 0，之后线性推进到 1 后停住。它是 `noteRise` 与 `noteSway`
 * 共同的自变量——两者读同一个进度，所以摇摆与上升永远不会错帧。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 音符总数
 */
export function noteProgress(n: number, t: number, count = SAX_NOTE_COUNT): number {
  const born = noteBlowAt(n, count);
  if (!Number.isFinite(born) || t <= born) return 0;
  return Math.min(1, (t - born) / RISE_SPAN);
}

/**
 * 音符 n 的竖向高度（0 = 管口，1 = 上半屏顶）。
 *
 * **签名核心（与 piano 对立）**：严格单调且光滑。取 `smoothstep` 的
 * 形状（3p² - 2p³）——两端速度为零、中段最快，一条呼吸般的曲线。
 * 导数 `6p(1-p)` 在开区间内恒 > 0，所以竖向速度**永不换号**：没有
 * 落点，没有拍点。piano 的 `4p(1-p)` 抛物线段拼接则每段结束都换号。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 音符总数
 */
export function noteRise(n: number, t: number, count = SAX_NOTE_COUNT): number {
  const p = noteProgress(n, t, count);
  if (p <= 0) return 0;
  return p * p * (3 - 2 * p);
}

/**
 * 旋律强度包络（0→1）。
 *
 * 互动①与②的共同来源。起吹渐强、演奏段饱满并带缓慢起伏（爵士的
 * 呼吸），收尾渐弱。起伏周期长（1.7 个来回）——快速抖动是激烈而非
 * 慵懒，那属于 drum。
 *
 * @param t 整幕归一化进度
 */
export function melodyIntensity(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  // 三幕包络。
  let env: number;
  if (k < SAX_ACT1_END) {
    env = k / SAX_ACT1_END;
  } else if (k < SAX_ACT2_END) {
    env = 1;
  } else {
    env = 1 - (k - SAX_ACT2_END) / (1 - SAX_ACT2_END);
  }
  // 缓慢起伏：0.78 底 + 0.22 摆，让强度在饱满段仍有呼吸。
  const breath = 0.78 + 0.22 * Math.sin(k * Math.PI * 2 * 1.7);
  return Math.max(0, env * breath);
}

/**
 * 音符 n 的水平摆动（带符号，±1 为最大摆幅）。
 *
 * **签名核心（与 trumpet 对立）**：符号反复变化。trumpet 的音符沿号口
 * 轴向定向喷出，水平位移单向；本场景的音符左右摇摆，所以水平位移全程
 * 多次过零。相位随序号错开（`n * 1.7` 弧度），六个音符因此不会同步
 * 摆成一条蛇。
 *
 * 幅度因子读 `melodyIntensity`（互动①），并随高度略收——音符飘远了
 * 摆幅自然变小。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 音符总数
 */
export function noteSway(n: number, t: number, count = SAX_NOTE_COUNT): number {
  const p = noteProgress(n, t, count);
  if (p <= 0) return 0;
  const phase = p * Math.PI * 2 * SWAY_CYCLES + n * 1.7;
  // 幅度：旋律强度（互动①）× 高度衰减。
  return Math.sin(phase) * melodyIntensity(t) * (1 - p * 0.35);
}

/**
 * 音符 n 的不透明度（0→1）。
 *
 * 吹出即现，行程末端淡出——音符飘散在空气里，不是撞到屏幕上消失。
 *
 * @param n 音符序号
 * @param t 整幕归一化进度
 * @param count 音符总数
 */
export function noteFade(n: number, t: number, count = SAX_NOTE_COUNT): number {
  const p = noteProgress(n, t, count);
  if (p <= 0) return 0;
  // 前 12% 渐显，后 30% 渐隐。
  const rise = Math.min(1, p / 0.12);
  const fall = p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;
  return rise * fall;
}

/** 按键流光的单键亮起时长（整幕归一化）。
 *
 * 五键按序铺在演奏段内：末键在 ACT1 + (4/5)·span 处起亮，span=0.528，
 * 所以该键的起亮时刻是 ACT1 + 0.422。单键亮窗必须短于「放得下五键」的
 * 总窗——0.19 × 5 = 0.95 已超过演奏段长 0.528，末键会在到达峰前就
 * 被截断（实测 NaN 与峰缺失）。取 0.08：五盏灯刚好铺满、每盏完整走完
 * 三角包络。 */
export const KEY_LIT_SPAN = 0.08;

/**
 * 按键 i 的流光亮度（0→1）。
 *
 * ② 按序亮起：五个键在演奏段内**依次**点亮，形成一道沿管身下行的
 * 流光。与 piano 的键闪不同——那里每键是一次脉冲（击打），这里是
 * 一段持续的亮起（按住），所以用三角包络而非指数衰减。
 *
 * @param i 按键序号
 * @param t 整幕归一化进度
 * @param count 按键总数
 */
export function keyLight(i: number, t: number, count = SAX_KEY_COUNT): number {
  if (i < 0 || i >= count) return 0;
  const span = SAX_ACT2_END - SAX_ACT1_END;
  const at = SAX_ACT1_END + (i / count) * span;
  const d = t - at;
  if (d < 0 || d > KEY_LIT_SPAN) return 0;
  // 三角包络：按下→按住→松开。
  const p = d / KEY_LIT_SPAN;
  return Math.sin(p * Math.PI);
}

/**
 * 管口热雾强度（0→1）。
 *
 * ④ 呼出雾：读旋律强度——吹得响，呼出的气就多。它比音符更贴近管口，
 * 所以整幕都在，只随强度起伏。
 *
 * @param t 整幕归一化进度
 */
export function breathMist(t: number): number {
  return melodyIntensity(t) * 0.82;
}

/**
 * 摇摆光束 b 的摆角（弧度，带符号）。
 *
 * **互动②**：光束随音符密度摆动，所以摆角的幅度读 `melodyIntensity`。
 * 两束反相（`b` 的奇偶决定符号），于是它们**交叉**——规格元素⑧写的是
 * 「两束交叉光」，同相位的两束只会平行扫过去。
 *
 * @param b 光束序号
 * @param t 整幕归一化进度
 */
export function beamAngle(b: number, t: number): number {
  const dir = b % 2 === 0 ? 1 : -1;
  // 摆动比音符慢：舞台灯是被音乐带动的，惯性更大。
  const phase = t * Math.PI * 2 * 0.9 + b * 0.6;
  return dir * Math.sin(phase) * 0.38 * melodyIntensity(t);
}

/**
 * 节奏鼓点光强度（0→1）。
 *
 * ⑥ 背景随拍闪烁：拍点由固定节拍给出（爵士的稳定律动），强度受
 * 旋律包络调制。与 `melodyIntensity` 的缓慢呼吸叠在一起，读起来是
 * 「稳定的拍 + 起伏的强弱」。
 *
 * @param t 整幕归一化进度
 */
export function drumPulse(t: number): number {
  // 每幕 6 拍，取拍内衰减。
  const beats = 6;
  const phase = t * beats;
  const inBeat = phase - Math.floor(phase);
  return Math.exp(-inBeat * 4.2) * melodyIntensity(t);
}

/**
 * 铜管反光带的位置（0→1，沿管身）。
 *
 * ⑤ 反光带随按键流光**同向下行**：反光是管身被舞台灯照出的高光，
 * 灯在摆，所以高光位置由 `beamAngle(0, t)` 反解而非另调一条曲线。
 *
 * @param t 整幕归一化进度
 */
export function sheenSeat(t: number): number {
  // 光束摆角映到 [0,1]：摆到一侧时高光在管身上端，另一侧在下端。
  return 0.5 + beamAngle(0, t) / 0.9;
}
