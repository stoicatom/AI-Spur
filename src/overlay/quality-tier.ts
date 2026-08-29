/**
 * 自适应画质控制器（设计规格 §3.2）。
 *
 * 手动档位即锁定，用户选择优先于任何自动判断。`auto` 档以本机基准帧耗时
 * 探测初始档位，运行期用 30 帧滚动窗口做相对判断：
 *
 * - 窗口均值 > 基准 × 1.6，连续 2 个窗口 → 降一档
 * - 窗口均值 < 基准 × 0.7，连续 6 个窗口 → 升一档
 *
 * 阈值全部相对本机基准而非绝对毫秒，"最流畅"因此在快机和慢机上同样成立：
 * 基准 33ms 的机器跑 30ms 不算慢，基准 6ms 的机器跑 15ms 才算慢。
 */
import type { EffectQuality } from '../shared/config';
import { QUALITY_TIERS, type QualityTier } from './effect-quality-budget';

/** 滚动窗口大小（帧）。 */
const WINDOW_FRAMES = 30;
/** 降档阈值：窗口均值超过基准的这个倍数算“慢”。 */
const SLOW_RATIO = 1.6;
/** 升档阈值：窗口均值低于基准的这个倍数算“富余”。 */
const FAST_RATIO = 0.7;
/** 连续多少个慢窗口触发降档。 */
const SLOW_WINDOWS_TO_DROP = 2;
/** 连续多少个富余窗口触发升档。 */
const FAST_WINDOWS_TO_RAISE = 6;

/**
 * 基准帧耗时 → 初始档位。快机给满，慢机保守。
 *
 * 边界取自设计规格 §3.2 的三档映射：≤12ms（约 83fps 以上）判为有富余算力
 * 给电影级，≤20ms（约 50fps）给高档，更慢的机器从中档起步再自适应。
 */
function tierForBaseline(baselineMs: number): QualityTier {
  if (baselineMs <= 12) return 'cinematic';
  if (baselineMs <= 20) return 'high';
  return 'medium';
}

export type QualityControllerOptions = {
  /**
   * 本机基准帧耗时（毫秒），由启动期空闲采样得出。
   * 缺失时保守取 medium，不猜测硬件能力。
   */
  baselineMs?: number;
};

export type QualityController = {
  /** 当前生效的档位。 */
  readonly tier: QualityTier;
  /** 是否处于自适应模式。 */
  readonly isAuto: boolean;
  /** 本机基准帧耗时，降档不改变它。 */
  readonly baselineMs: number | null;
  /** 记录一帧耗时，返回记录后的档位。 */
  sample(frameMs: number): QualityTier;
  /** 回到初始档位并清空窗口状态。 */
  reset(): void;
};

/**
 * 创建画质控制器。
 *
 * @param quality 用户配置的档位；`auto` 启用自适应，其余档位锁定。
 */
export function createQualityController(
  quality: EffectQuality,
  options: QualityControllerOptions = {},
): QualityController {
  const isAuto = quality === 'auto';
  const baselineMs = options.baselineMs ?? null;
  const initialTier: QualityTier = isAuto
    ? (baselineMs === null ? 'medium' : tierForBaseline(baselineMs))
    : quality;

  let tier = initialTier;
  let windowSum = 0;
  let windowCount = 0;
  let slowWindows = 0;
  let fastWindows = 0;

  function clearWindow(): void {
    windowSum = 0;
    windowCount = 0;
  }

  function shift(direction: -1 | 1): void {
    const index = QUALITY_TIERS.indexOf(tier);
    const next = index + direction;
    // 两端封顶：最高档不再升，最低档不再降。
    if (next < 0 || next >= QUALITY_TIERS.length) return;
    tier = QUALITY_TIERS[next];
    slowWindows = 0;
    fastWindows = 0;
  }

  function closeWindow(): void {
    const average = windowSum / windowCount;
    clearWindow();
    if (baselineMs === null) return;

    if (average > baselineMs * SLOW_RATIO) {
      // 慢窗口累计，快窗口打断计数：单次抖动不该触发降档。
      fastWindows = 0;
      slowWindows += 1;
      if (slowWindows >= SLOW_WINDOWS_TO_DROP) shift(1);
      return;
    }

    if (average < baselineMs * FAST_RATIO) {
      slowWindows = 0;
      fastWindows += 1;
      if (fastWindows >= FAST_WINDOWS_TO_RAISE) shift(-1);
      return;
    }

    slowWindows = 0;
    fastWindows = 0;
  }

  return {
    get tier() { return tier; },
    get isAuto() { return isAuto; },
    get baselineMs() { return baselineMs; },

    sample(frameMs: number): QualityTier {
      // 手动档位锁定，不做任何自适应。
      if (!isAuto) return tier;
      // 非正耗时是脏采样（计时器回绕、后台标签页），不入窗口。
      if (!(frameMs > 0)) return tier;
      windowSum += frameMs;
      windowCount += 1;
      if (windowCount >= WINDOW_FRAMES) closeWindow();
      return tier;
    },

    reset(): void {
      tier = initialTier;
      clearWindow();
      slowWindows = 0;
      fastWindows = 0;
    },
  };
}
