/**
 * 场景 29 lotus 的签名机制：**层叠绽放**（纯标量数学，不碰 THREE 对象）。
 *
 * 「层叠」不是「一朵花张开」的修辞，而是一条可验收的因果：花瓣分层，
 * 第 N 层的开启进度**滞后于**第 N-1 层，且这个滞后量是**层序的函数**
 * （`layerDelay` 严格单增）。由内到外逐层错时打开，是本场景与全库其余
 * 绽放/花瓣场景的唯一分界。
 *
 * 与 harp 的边界划在**驱动量**上：harp 是「逐列空间扫描」——弦亮不亮
 * 取决于一道移动闪光带此刻扫到哪个高度（`beamPosition` 是空间量）；
 * lotus 是「逐层时序错开」——层开不开取决于该层自己的相位偏移，
 * 与任何在场的空间标尺无关。两者刻意不撞：harp 若把闪光带撤走就全暗，
 * lotus 若把层序抹平就变成齐开。
 *
 * 与 star / fireworks 的边界：那两者是同时起爆的径向发散（同一时刻所有
 * 单元同相位），本场景任意时刻各层相位必然不同。
 *
 * 涟漪为什么必须由开启进度驱动：规格互动①是「花瓣开启**带动**水面涟漪」。
 * 若涟漪自己走一条时间曲线，那是并发而非因果——花苞未开时水面就已起环。
 * 所以第 N 环的半径写成 `rippleRadiusFromOpen(layerOpen(t, N))`：
 * 该层没开，对应的环半径恒为 0。层序滞后因此**自动**传导到水面，
 * 「一层开一圈环」是数学上的必然，不是两处各写一份动画。
 */

/** 整幕时长（毫秒）。规格 §4.2 场景 29。 */
export const LOTUS_DURATION_MS = 1200;
/** 整幕时长（秒），物理换算用。 */
export const LOTUS_DURATION_S = LOTUS_DURATION_MS / 1000;

/** 第一幕结束点（300/1200）：花苞。 */
export const LOTUS_ACT1_END = 300 / 1200;
/** 第二幕结束点（800/1200）：逐层绽放完成。 */
export const LOTUS_ACT2_END = 800 / 1200;

/**
 * 莲座层数。
 *
 * 层数是**签名的载体**而非密度：把它按档位削掉等于把「层叠」机制本身
 * 移除，违反「降档只减密度，绝不移除元素」。因此各档位一律 4 层，
 * 降档只减每层的花瓣数（见 `lotus-parts` 里的 `scaledCount`）。
 */
export const LOTUS_LAYER_COUNT = 4;

/**
 * 相邻层的错时量（归一化进度）。
 *
 * 取值让最外层的开启恰好在第二幕末收尾：
 * delay(3) + OPEN_SPAN = 0.25 + 3×0.062 + 0.229 ≈ 0.665 ≈ ACT2_END。
 */
const LAYER_STAGGER = 0.062;
/** 单层从合到全开所需的进度跨度。 */
export const LAYER_OPEN_SPAN = 0.229;

/** 花苞状态下花瓣与竖直方向的夹角（弧度）：几乎收拢。 */
export const PETAL_ANGLE_CLOSED = 0.14;
/** 全开状态下的夹角：花瓣压向水面。 */
export const PETAL_ANGLE_OPEN = 1.42;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 第 layer 层的开启起始时刻（纯函数，**签名的本体**）。
 *
 * 严格单增：内层（小 layer）先开、外层后开。这条单调性是「层叠」
 * 与「齐开」的唯一分界，也是滞后方向（由内到外）的唯一依据。
 *
 * @param layer 层序（0 = 最内层）
 */
export function layerDelay(layer: number): number {
  return LOTUS_ACT1_END + Math.max(0, layer) * LAYER_STAGGER;
}

/**
 * 第 layer 层此刻的开启进度（0 = 合，1 = 全开）。
 *
 * 用 smootherstep：花瓣起手要克服花萼的束缚所以慢，中段快，
 * 末段贴到极限角又缓下来。首末两端一阶导为零，层与层的交接因此不跳。
 *
 * @param t 整幕归一化进度
 * @param layer 层序（0 = 最内层）
 */
export function layerOpen(t: number, layer: number): number {
  const since = t - layerDelay(layer);
  if (since <= 0) return 0;
  const k = Math.min(1, since / LAYER_OPEN_SPAN);
  return k * k * k * (k * (k * 6 - 15) + 10);
}

/**
 * 整朵花的开启度：各层进度的均值。
 *
 * 均值而非最大值——「层叠」的观感来自各层步调不一，取最大值会让
 * 整朵花的读数被最内层一层带满，外层还没动就显示全开。
 *
 * @param t 整幕归一化进度
 * @param layers 实际层数（默认 `LOTUS_LAYER_COUNT`）
 */
export function bloomOpenness(t: number, layers: number = LOTUS_LAYER_COUNT): number {
  const n = Math.max(1, Math.floor(layers));
  let sum = 0;
  for (let l = 0; l < n; l += 1) sum += layerOpen(t, l);
  return sum / n;
}

/**
 * 花瓣张角（弧度）：开启进度 → 与竖直方向的夹角。
 *
 * @param open 该层的开启进度（`layerOpen` 的返回值）
 */
export function petalOpenAngle(open: number): number {
  return PETAL_ANGLE_CLOSED + (PETAL_ANGLE_OPEN - PETAL_ANGLE_CLOSED) * clamp01(open);
}

/** 涟漪最大半径系数（× 画面短边）：铺开到覆盖水面。 */
const RIPPLE_REACH = 0.66;

/**
 * 涟漪环半径（纯函数，**互动①的因果本体**）。
 *
 * 入参是**开启进度**而不是时间：`open = 0` 必然给出 0 半径。
 * 因此「花苞未开则水面无环」不靠调用顺序保证，是函数本身的性质。
 * 表面波早期扩散近似 r ∝ √(驱动量)，与真实水环的 √t 同形。
 *
 * @param open 驱动该环的那一层的开启进度
 * @param short 画面短边（像素）
 */
export function rippleRadiusFromOpen(open: number, short: number): number {
  return short * RIPPLE_REACH * Math.sqrt(clamp01(open));
}

/**
 * 涟漪亮度（纯函数）：起环时最亮，摊到更长的环周上后淡去。
 *
 * 同样只吃开启进度：未开则不可见。
 *
 * @param open 驱动该环的那一层的开启进度
 */
export function rippleFadeFromOpen(open: number): number {
  const k = clamp01(open);
  if (k <= 0) return 0;
  // sin 型单峰：环刚推出时最亮，扩到边缘时归零。
  return Math.sin(Math.pow(k, 0.55) * Math.PI) ** 1.2;
}

/**
 * 第 layer 层的花瓣脱离花座、开始漂散的时刻（纯函数）。
 *
 * 外层先漂走：它开得最早、也最先松脱。层序在这里**反向**传导，
 * 与开启方向刚好相反——由内到外开，由外到内散。
 *
 * @param layer 层序（0 = 最内层）
 */
export function petalReleaseAt(layer: number): number {
  const outer = LOTUS_LAYER_COUNT - 1 - Math.max(0, layer);
  return LOTUS_ACT2_END + outer * 0.035;
}
