/**
 * 场景 36 boxing-glove 的签名数学：**命中空气**（无实体目标）。
 *
 * 全库其余「冲击」类场景都有一个被击物：shield 有盾（动能沿弧面转向）、
 * axe 有原木（动能留在木料里把它撕开）、glass-shot 有玻璃（介质被击碎）。
 * 本场景**没有目标 mesh**——拳砸进的是空气。这个差别不是叙事修辞，它有
 * 两条可验收的力学后果：
 *
 * 1. **命中不硬停**。撞上实体的那一刻速度归零（或转向），撞空气则继续
 *    前冲一小段才被自身肌腱拉回——`gloveSpeed(PUNCH_IMPACT_T) > 0` 且
 *    行程会**过冲**到 `PUNCH_OVERSHOOT > 1`。一条在命中时刻速度归零的
 *    曲线画出来是「打到了墙」，那是 shield 的戏。
 * 2. **动能全部交给介质**。既然没有实体接收动能，唯一的「被命中者」是
 *    空气本身，所以压缩环是本场景唯一的受击证据：环的强度**读诞生瞬间
 *    的拳速**（`ringImpulse`），环心**被拳套推着前移**（`ringCenter`）。
 *    环不是一圈自己长大的装饰，是被推开的介质。
 *
 * 全部纯函数：update 会被以任意稀疏 t 调用，闭式求值才能保证同一 t
 * 永远画出同一帧（本项目 ice/meteor/wind 都踩过逐帧累加的坑）。
 */

/** 整幕时长（毫秒），规格 §4.2 场景 36。全库第二快，仅次于 revolver 720ms。 */
export const PUNCH_DURATION_MS = 850;
/** 第一幕结束（出拳完成，拳面触及空气墙）。 */
export const PUNCH_ACT1_END = 200 / 850;
/** 第二幕结束（压缩环与震屏走完）。 */
export const PUNCH_ACT2_END = 600 / 850;

/**
 * 命中时刻。
 *
 * 与第一幕末同刻：出拳段结束即触及空气墙。写成对 `PUNCH_ACT1_END` 的
 * 引用而非另拍常数，改三幕边界时命中时刻会跟着走。
 */
export const PUNCH_IMPACT_T = PUNCH_ACT1_END;

/**
 * 跟进段的减速率（归一化行程 / 归一化时间²）。
 *
 * 打空气时唯一的减速来源是自身肌腱的回拉。这是本场景仅有的一个
 * 「材质」参数，过冲深度与达峰时刻都由它连同命中拳速**反解**得出，
 * 不另填常数——所以「拳更快 → 冲得更深」是必然。
 */
export const PUNCH_TENDON_DECEL = 205;

/**
 * 命中瞬间的拳速（归一化行程 / 归一化时间）。
 *
 * 出拳段是恒力加速 `reach = (k/T)²`，末端斜率解析为 `2/T`。
 * 后续一切强度量（环冲量、白闪、震屏、压扁、汗滴）都以它为分母归一。
 */
export const PUNCH_PEAK_SPEED = 2 / PUNCH_ACT1_END;

/**
 * 过冲达峰时刻：速度被肌腱拉到零的那一刻（`v0 - a·Δt = 0`）。
 *
 * **签名核心之一**：它是反解值而不是拍下来的时刻。命中即停的场景
 * （撞实体）这个量为 0；本场景严格 > 0，因为空气拦不住拳。
 */
export const PUNCH_PEAK_T = PUNCH_IMPACT_T + PUNCH_PEAK_SPEED / PUNCH_TENDON_DECEL;

/**
 * 行程过冲峰值（1 = 命中面）。
 *
 * 匀减速的经典解 `1 + v0²/(2a)`。**签名核心之二**：严格 > 1 —— 拳越过了
 * 命中面。把 `PUNCH_TENDON_DECEL` 调到无穷大它就退化成 1，那是「撞到墙」，
 * 也就是 shield/axe 的戏而不是本场景的。
 */
export const PUNCH_OVERSHOOT = 1 + (PUNCH_PEAK_SPEED * PUNCH_PEAK_SPEED) / (2 * PUNCH_TENDON_DECEL);

/** 压缩环层数（规格元素②，多层才看得出「被推开」的先后）。 */
export const RING_COUNT = 4;


/** 环半径的扩张指数（< 1：被推开后减速扩张，不是等速圆环）。 */
export const RING_P = 0.62;

/**
 * 出拳行程（0 = 起手位，1 = 命中面，可越过 1）。
 *
 * 三段闭式：
 * - 出拳段：恒力加速，行程是二次曲线（起手慢、拳面快）。
 * - 跟进段：命中后越过命中面到 `PUNCH_OVERSHOOT`，再被肌腱拉回命中面。
 *   这一段是签名的载体——它保证命中瞬间速度非零。
 * - 收势段：回拳，退回起手位附近。
 *
 * @param t 整幕归一化进度
 */
export function gloveReach(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k <= PUNCH_IMPACT_T) {
    // 恒力加速：a = 2/T²，行程 = (k/T)²，末端斜率 2/T 即最大拳速。
    const a = k / PUNCH_IMPACT_T;
    return a * a;
  }
  if (k <= PUNCH_ACT2_END) {
    const dt = k - PUNCH_IMPACT_T;
    if (k <= PUNCH_PEAK_T) {
      // 匀减速：reach = 1 + v0·Δt - a·Δt²/2。速度在命中处恰为 v0
      // （与出拳段末速相等，全程 C¹），在 PUNCH_PEAK_T 处恰为 0。
      // 写成 sin(π·s^p) 那类形状会在接缝处导数发散，命中帧算出假的
      // 速度尖峰，压缩环强度全部读错（本场景实测踩过）。
      return 1 + PUNCH_PEAK_SPEED * dt - 0.5 * PUNCH_TENDON_DECEL * dt * dt;
    }
    // 峰后：余弦收回命中面，两端速度都为 0，接缝仍然 C¹。
    const b = (k - PUNCH_PEAK_T) / (PUNCH_ACT2_END - PUNCH_PEAK_T);
    return 1 + (PUNCH_OVERSHOOT - 1) * (0.5 + 0.5 * Math.cos(Math.PI * b));
  }
  // 收势：从命中面退回起手位，缓出。
  const a = (k - PUNCH_ACT2_END) / (1 - PUNCH_ACT2_END);
  return 1 - 0.94 * (1 - Math.pow(1 - a, 2.1));
}

/**
 * 拳套速率（行程/归一化时间，数值微分）。
 *
 * 与 `gloveReach` 同源而非另拍曲线：压缩环强度、命中闪光、汗滴初速
 * 全部读这一个量，所以「拳快 → 环强 → 汗溅得远」是必然而非调参。
 *
 * @param t 整幕归一化进度
 */
export function gloveSpeed(t: number): number {
  const h = 1e-4;
  const lo = Math.max(0, t - h);
  const hi = Math.min(1, t + h);
  return (gloveReach(hi) - gloveReach(lo)) / (hi - lo);
}


/**
 * 第 i 层压缩环的诞生时刻。
 *
 * 环不是同时出现的：拳持续前压，介质被一层层推开。第 0 层在命中瞬间
 * 诞生，后续各层滞后固定间隔——这让「环随拳套位移被推开」（规格互动①）
 * 在时间轴上可测。
 *
 * @param i 环序号
 */
export function ringBornAt(i: number): number {
  // 间隔铺满整个过冲窗口：拳还在前压的那段时间里，介质被一层层推开。
  // 绑到 PUNCH_PEAK_T 而非填常数——过冲窗口随拳速与肌腱阻力变，
  // 环的节奏跟着变，不会出现「环生在拳已经回撤之后」。
  const window = PUNCH_PEAK_T - PUNCH_IMPACT_T;
  return PUNCH_IMPACT_T + (i / RING_COUNT) * window;
}

/**
 * 第 i 层压缩环的冲量（0→1，恒定）。
 *
 * **签名内涵**：读**诞生瞬间**的拳速并冻结。拳在跟进段减速，所以后生的
 * 环天生更弱——环的强弱序列因此是拳速曲线的采样，不是逐层手填的衰减表。
 * 改 `PUNCH_OVERSHOOT` 会同时改变各环的强度比，这是「同源」的可测证据。
 *
 * @param i 环序号
 */
export function ringImpulse(i: number): number {
  // 夹到 [0, 1]：拳一旦转为回撤（速度为负）就不再推开新的介质，
  // 那种情况下环该是「没生出来」而不是「反向的负环」——负的 alpha
  // 在 three 里静默失效，画面上会整层消失而断言照样绿。
  const raw = gloveSpeed(ringBornAt(i)) / PUNCH_PEAK_SPEED;
  return Math.min(1, Math.max(0, raw));
}

/**
 * 第 i 层压缩环的扩张半径（0→1，1 = 屏缘）。
 *
 * 亚线性（`RING_P` < 1）：介质被推开后失去动力来源，扩张减速。
 * 诞生前恒为 0——环不会提前出现在画面上。
 *
 * @param i 环序号
 * @param t 整幕归一化进度
 */
export function ringRadius(i: number, t: number): number {
  const born = ringBornAt(i);
  if (t <= born) return 0;
  // 环的寿命：从诞生到整幕末，越强的环跑得越远（读同一个 impulse）。
  const age = (t - born) / (1 - born);
  return Math.min(1, Math.pow(age, RING_P) * (0.72 + 0.42 * ringImpulse(i)));
}

/**
 * 第 i 层压缩环的亮度（0→1）。
 *
 * 半径在长、亮度在退——两条曲线，扩张与消散是不同的物理过程。
 *
 * @param i 环序号
 * @param t 整幕归一化进度
 */
export function ringAlpha(i: number, t: number): number {
  const born = ringBornAt(i);
  if (t <= born) return 0;
  const age = (t - born) / (1 - born);
  return ringImpulse(i) * Math.exp(-age * 3.4);
}

/**
 * 压缩环环心沿拳路的位置（0 = 起手位，1 = 命中面）。
 *
 * **规格互动①的载体**：环被拳套「推」开，所以环心不是钉在命中面，而是
 * 跟着拳套走——直到拳回撤，环心停在它被推到的最远处（介质不会跟着拳
 * 一起退回来）。
 *
 * @param i 环序号
 * @param t 整幕归一化进度
 */
export function ringCenter(i: number, t: number): number {
  // 环心 = 该环诞生那一刻拳所在的位置，此后**钉住不动**。
  //
  // 曾写成「跟到拳曾达最深处」的上确界，那让四个环最终全部收敛到
  // PUNCH_OVERSHOOT 叠成一个——规格互动①要的是「压缩环随拳套位移被
  // 推开」，即拳一路留下一串位置各异的环，而不是环追着拳跑。空气被
  // 压过就留在那里，它没有理由跟着拳继续前进。
  void t;
  return gloveReach(ringBornAt(i));
}

/**
 * 命中闪光（③ 白闪，0→1）。
 *
 * 只在命中之后存在，峰值读命中瞬间的拳速——快拳白闪更亮。
 * 极短：白闪是一帧级事件，衰减比环快一个量级。
 *
 * @param t 整幕归一化进度
 */
export function hitFlash(t: number): number {
  if (t < PUNCH_IMPACT_T) return 0;
  const age = (t - PUNCH_IMPACT_T) / (1 - PUNCH_IMPACT_T);
  const peak = Math.min(1, gloveSpeed(PUNCH_IMPACT_T) / PUNCH_PEAK_SPEED);
  return peak * Math.exp(-age * 16);
}
