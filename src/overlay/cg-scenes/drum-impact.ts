/**
 * 场景 20 drum 的签名机制：击打 → 凹陷 → 反弹。
 *
 * 全库唯一之处在于本场景的**所有**下游量都由同一条鼓面位移曲线驱动：
 * 环波强度、震屏包络、拖影亮度、锤头火星率，全部是 `headDeflection`
 * 的派生量。它们因此在时间上**互相锁死**——凹陷最深那一帧环波最亮
 * （互动①），鼓面每回弹一次震屏就再抖一记（余震而非单次冲击）。
 *
 * 写成纯函数是为了让这条因果链可以直接验收：把任何一段改成自跑的
 * 正弦，峰值时刻立刻错开，断言转红。
 */

/** 击打时刻（整幕归一化）＝第一幕结束，槌头触面。 */
export const DRUM_STRIKE_AT = 150 / 1200;
/** 整幕时长（秒）：物理与震屏都以它换算。 */
export const DRUM_DURATION_S = 1.2;

/** 鼓面固有角频率（rad / 归一化幕）：绷紧的膜，低频但不迟钝。 */
export const HEAD_OMEGA = 34;
/** 鼓面振动的衰减常数：一击即散，不像钟那样长余韵。 */
const HEAD_DECAY = 5.2;

/**
 * 鼓面位移（纯函数，签名本体）。
 *
 * 正值＝被槌压进去（凹陷），负值＝越过平面向外鼓出（反弹）。
 * 冲击响应用欠阻尼二阶系统：`sin(ωs)·e^(-ζs)`——触面瞬间为 0，
 * 迅速压到最深，回到平面后**冲过头**向外鼓，再往复衰减。
 * 「击打-凹陷-反弹」三段因此是同一条曲线的三段，而不是三段动画拼接。
 *
 * @param t 整幕归一化进度
 */
export function headDeflection(t: number): number {
  const since = t - DRUM_STRIKE_AT;
  if (since < 0) return 0;
  return Math.sin(since * HEAD_OMEGA) * Math.exp(-since * HEAD_DECAY);
}

/** 凹陷量：只取压入方向，回到平面即 0（外鼓段归零）。 */
export function dentDepth(t: number): number {
  return Math.max(0, headDeflection(t));
}

/** 环波层数：规格「多层粗环」。 */
export const RIPPLE_LAYERS = 4;
/** 层间发出间隔（整幕归一化）。 */
const RIPPLE_INTERVAL = 0.055;
/** 一层从鼓心扩到屏外所需时长（整幕归一化）。 */
const RIPPLE_TRAVEL = 0.46;
/**
 * 环的最大半径（贴片 UV 尺度）。
 *
 * 贴片 1.6 倍屏，屏缘在 UV 0.3125；环被压扁（÷0.46）后屏角落在
 * hypot(0.3125, 0.3125/0.46) = 0.748——最大半径必须越过它，
 * 规格的「低频环波铺满全屏」才真的成立。
 */
export const RIPPLE_MAX_R = 0.8;

/**
 * 第 index 层环波的当前半径（贴片 UV 尺度，纯函数）。
 *
 * 返回 -1 表示尚未发出或已越出画面。半径线性外扩：声速恒定。
 *
 * @param t 整幕归一化进度
 * @param index 层序号
 */
export function rippleRadius(t: number, index: number): number {
  const launch = DRUM_STRIKE_AT + index * RIPPLE_INTERVAL;
  const since = t - launch;
  if (since < 0 || since > RIPPLE_TRAVEL) return -1;
  return (since / RIPPLE_TRAVEL) * RIPPLE_MAX_R;
}

/** 全部环层的当前半径（互动②要按时刻逐步采样，故整组返回）。 */
export function rippleRadii(t: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < RIPPLE_LAYERS; i += 1) out.push(rippleRadius(t, i));
  return out;
}

/**
 * 环波驱动量（互动①「鼓面凹陷与环波同帧」的因果本体）。
 *
 * 环是鼓面推空气推出来的，声压正比于膜的瞬时位移——所以这里直接取
 * `|headDeflection|`，**不是另跑一条正弦**。两者峰值时刻因此严格相同。
 *
 * @param t 整幕归一化进度
 */
export function rippleDrive(t: number): number {
  return Math.abs(headDeflection(t));
}

/**
 * 波前推力带宽（贴片 UV 尺度）：粒子落在这条带里才被推。
 *
 * 刻意比可见辉带（shader 的 uThickness，0.03–0.078）**窄**：推动粒子
 * 的是压力**梯度**，它集中在波前最陡处，比整条发亮的波带窄一截。
 * 带宽也必须小于鼓面在同一尺度下的跨度（≈0.098），否则一层波会把
 * 全部粒子同时罩住——那就成了「一次齐推」，不是「扫过」。
 */
const SWEEP_BAND = 0.02;

/**
 * 波前扫过某个半径时给出的推力系数（纯函数，互动②的因果本体）。
 *
 * 只有当环的当前半径落在该点半径附近的窄带内才有推力——「环没到就
 * 不推、环过去就不推」是曲线自身的性质，不靠调用顺序保证。
 *
 * @param radius 环当前半径（-1 表示未发出）
 * @param pointRadius 粒子到鼓心的横向距离（同一 UV 尺度）
 */
export function sweepPush(radius: number, pointRadius: number): number {
  if (radius < 0) return 0;
  const gap = Math.abs(radius - pointRadius);
  return Math.max(0, 1 - gap / SWEEP_BAND);
}

/** 震屏抖动载波角频率：高频抖动叠在低频余震包络上。 */
const QUAKE_CARRIER = 155;

/**
 * 震屏幅度（纯函数，签名的另一半）。
 *
 * 与 meteor 的「坠地一次冲击后单调衰减」**机制不同**：这里的包络直接
 * 取鼓面位移幅度，鼓面每半个周期回弹一次，震屏就被**重新拉起**一次。
 * 因此细粒度上能数出多次「再点火」，而 meteor 的 exp 包络一次都没有。
 * 粗粒度（按回弹分窗）上峰值仍单调下降——余震一记比一记弱。
 *
 * @param t 整幕归一化进度
 */
export function drumQuakeAmount(t: number): number {
  const since = t - DRUM_STRIKE_AT;
  if (since < 0) return 0;
  return Math.abs(headDeflection(t)) * Math.abs(Math.sin(since * QUAKE_CARRIER));
}

/** 拖影延迟线抽头数与总跨度（整幕归一化）。 */
const SMEAR_TAPS = 6;
const SMEAR_SPAN = 0.09;

/**
 * 音浪拖影亮度（纯函数）。
 *
 * 「拖影」的物理含义是低频成分的**残留**：对鼓面位移幅度做一条箱式
 * 延迟线求平均，于是它比凹陷**晚**达峰、也衰减得更慢，看着像声音拖在
 * 画面上没散掉。若写成与凹陷同相的曲线就成了另一层环波，不是拖影。
 *
 * @param t 整幕归一化进度
 */
export function boomSmear(t: number): number {
  let sum = 0;
  for (let k = 0; k < SMEAR_TAPS; k += 1) {
    sum += Math.abs(headDeflection(t - (k / SMEAR_TAPS) * SMEAR_SPAN));
  }
  return sum / SMEAR_TAPS;
}

/**
 * 鼓槌飞入进度（纯函数）：0＝起始位，1＝触面。
 *
 * pow>1 表示抡下来是**加速**的——匀速逼近看着像鼓槌被拖过去。
 *
 * @param t 整幕归一化进度
 */
export function malletApproach(t: number): number {
  const u = Math.min(1, Math.max(0, t / DRUM_STRIKE_AT));
  return Math.pow(u, 1.6);
}

/**
 * 鼓槌击后回撤进度（纯函数）：0＝仍贴面，1＝已完全弹开。
 *
 * @param t 整幕归一化进度
 */
export function malletRecoil(t: number): number {
  const since = t - DRUM_STRIKE_AT;
  if (since <= 0) return 0;
  return 1 - Math.exp(-since * 7.5);
}
