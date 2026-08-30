/**
 * 场景 26 axe 的**冲击后效**：斧光弧、木屑喷射、落地震荡、回弹斧身
 * （纯标量数学，不碰 THREE 对象）。
 *
 * 这四条曲线都不是各自的独立动画，而是从 `./axe-split` 的斧刃轨迹派生：
 *
 * - `arcGlow` / `chipBurst` 读斧刃的**速率**（弧光是运动残留，木屑是刃在
 *   木料里推进时挤出来的），因此必然与斧刃同源达峰。
 * - `shockWave` / `axeRebound` 以**行程走完**那一刻为原点（刃啃到砧木、
 *   动能一次交给地面），而不是触木那一刻——触木时斧还在往下走，动量尚未
 *   交出去。这个时序差是「落地震荡」与「劈中木料」两件事的分野。
 *
 * 拆成独立文件是因为 250 行上限，以及「后效读轨迹」这个单向依赖本身就是
 * 一条值得摆明的边界：本模块 import 轨迹，轨迹不 import 本模块。
 */
import {
  AXE_BITE_END_T,
  AXE_IMPACT_T,
  AXE_MAX_DESCENT_RATE,
  bladeY,
  crackReach,
} from './axe-split';

/** 震波亮度的上冲时长（归一化幕）。 */
const SHOCK_RISE_T = 0.06;
/** 震波半径的扩张次幂（< 1）：先急后缓，波前在空气里减速。 */
const SHOCK_SPREAD_P = 0.55;

/** 回弹抬起的时间常数（归一化幕）：被顶回来是一下，不是慢慢浮起。 */
const REBOUND_RISE_T = 0.03;
/** 回弹振铃的衰减常数。 */
const REBOUND_TAU = 0.12;
/** 振铃圈数：一次可见的过冲，不是持续颤动。 */
const REBOUND_TURNS = 4.5;
/** 过冲幅度占残余高度的比例。 */
const REBOUND_OVERSHOOT = 0.45;
/** 回弹总增益：残余高度 = restitution × 本值（以原木厚度为单位）。 */
const REBOUND_GAIN = 0.5;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 斧光弧的亮度（0–1，纯函数，规格元素④）。
 *
 * = 斧刃**下行速率**的归一化值。弧光是运动的视觉残留而非独立动画，所以
 * 它必然在自由挥落段末尾（刃速最大处，即触木那一刻）达峰，并在刃停住时
 * 归零——「斧停了弧还亮着」在物理上说不通。
 *
 * 速率用中心差分从 `bladeY` 取，因此与斧刃轨迹**同源**：改轨迹，弧光的
 * 峰值时刻会跟着移动，不需要在这里同步改一个常数。
 *
 * @param t 整幕归一化进度
 */
export function arcGlow(t: number): number {
  const h = 1e-4;
  const rate = (bladeY(Math.max(0, t - h)) - bladeY(t + h)) / (2 * h);
  return clamp01(rate / AXE_MAX_DESCENT_RATE);
}

/**
 * 木屑喷射的强度（0–1，纯函数，规格元素③）。
 *
 * 与斧光弧同源（都读刃速）但**只在刃已入木后**有效：木屑是刃在木料里
 * 推进时挤出来的，刃还在空中时挤不出任何东西。因此它必然从触木那一刻
 * 起跳，与斧光弧的峰值同帧——互动①「斧刃触木瞬间木屑沿劈线喷出」的
 * 数学出口，而不是另排一个时刻。
 *
 * @param t 整幕归一化进度
 */
export function chipBurst(t: number): number {
  if (t < AXE_IMPACT_T) return 0;
  return arcGlow(t);
}

/**
 * 落地震荡的强度（0–1，纯函数，规格元素⑤）。
 *
 * 起点是行程走完那一刻（`AXE_BITE_END_T`），因此严格晚于触木：木屑与
 * 弧光早已达峰，震荡才起来。
 *
 * @param t 整幕归一化进度
 */
export function shockWave(t: number): number {
  const age = t - AXE_BITE_END_T;
  if (age <= 0) return 0;
  if (age < SHOCK_RISE_T) return age / SHOCK_RISE_T;
  // 余下整段线性退去，收在幕末（震尘落定）。
  const span = 1 - AXE_BITE_END_T - SHOCK_RISE_T;
  return Math.max(0, 1 - (age - SHOCK_RISE_T) / span);
}

/**
 * 震波环的半径比例（0–1，纯函数）。
 *
 * 与强度分离：波前一直向外走（单调不减），亮度却在衰——环扩大的同时
 * 变淡，这才是震波。用同一条曲线驱动两者会让环「涨回去」。
 *
 * @param t 整幕归一化进度
 */
export function shockRadius(t: number): number {
  const age = t - AXE_BITE_END_T;
  if (age <= 0) return 0;
  return clamp01(Math.pow(age / (1 - AXE_BITE_END_T), SHOCK_SPREAD_P));
}

/**
 * 回弹斧身的抬起量（以原木厚度为单位，纯函数，规格元素⑦）。
 *
 * 行程走完后才起：木料的弹性把斧顶回来一点，带一次可见的过冲再收住。
 * 幅度由素材身份的 `restitution` 定，不另拍一个魔法数。
 *
 * `bladeY` 不含这一段（分离的驱动量必须单调不减，木料不会因为斧退出来
 * 而重新合上），显示层把两者相加。
 *
 * @param t 整幕归一化进度
 * @param restitution 素材回弹系数（axe 行为 .3）
 */
export function axeRebound(t: number, restitution: number): number {
  const age = t - AXE_BITE_END_T;
  if (age <= 0) return 0;
  const rise = 1 - Math.exp(-age / REBOUND_RISE_T);
  const ring = 1 + REBOUND_OVERSHOOT * Math.exp(-age / REBOUND_TAU)
    * Math.sin(age * REBOUND_TURNS * Math.PI * 2);
  return restitution * REBOUND_GAIN * rise * ring;
}

/**
 * 木屑发射点的轴向位置（0 = 落刃点，1 = 原木远端，纯函数，元素③）。
 *
 * 木屑不是从一个固定坑里冒出来的：顺纹劈裂时被挤碎的纤维出现在**裂纹
 * 尖端**——那里应力最集中——所以喷射点跟着裂纹前沿走。于是它直接复用
 * `crackReach`，而不是另写一条曲线：断口位置只有一个定义，木屑、断口
 * 发光、段分离读的都是它。
 *
 * 这条性质是元素③与「原点爆一团碎屑」的分野，也是可断言的：整幕内发射
 * 点的轴向位置必须单调推进，且恒等于 `crackReach(t)`。
 *
 * @param t 整幕归一化进度
 */
export function chipSeat(t: number): number {
  return crackReach(t);
}
