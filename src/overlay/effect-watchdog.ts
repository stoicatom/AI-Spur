/**
 * 特效超时看门狗。
 *
 * 渲染循环的结束判定依赖 `material.crackAlive` / `three.isAlive`。
 * WebGL 初始化失败走 2D 回退、上下文丢失走 `cancel()` 等路径都会让这两个
 * 标志提前变假，结束判定就再也执行不到 —— rAF 空转，全屏窗口永久留屏。
 *
 * 看门狗不看任何渲染状态：从 crack 那一刻起算，超时就强制收起。
 */

/** 事件往返 + 音频尾音的最小余量：再短的特效也不能比这更早强收。 */
export const WATCHDOG_FLOOR_MS = 3000;
/** 在特效标称时长之上额外留出的余量，避免正常播放被误伤。 */
export const WATCHDOG_MARGIN_MS = 1200;

export interface WatchdogTimers {
  set(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clear(handle: ReturnType<typeof setTimeout>): void;
}

const REAL_TIMERS: WatchdogTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
};

/** 由特效标称时长推导强制收起的时限。 */
export function watchdogTimeoutFor(effectDurationMs: number): number {
  if (!Number.isFinite(effectDurationMs) || effectDurationMs <= 0) return WATCHDOG_FLOOR_MS;
  return Math.max(WATCHDOG_FLOOR_MS, Math.round(effectDurationMs) + WATCHDOG_MARGIN_MS);
}

export class EffectWatchdog {
  private handle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onExpire: () => void,
    private readonly timers: WatchdogTimers = REAL_TIMERS,
  ) {}

  get armed(): boolean {
    return this.handle !== null;
  }

  /** 重新计时；重复 arm 只保留最后一个定时器。 */
  arm(timeoutMs: number): void {
    this.disarm();
    this.handle = this.timers.set(() => {
      this.handle = null;
      try {
        this.onExpire();
      } catch (error) {
        // 看门狗自己绝不能成为新的卡死点。
        console.error('[overlay] effect watchdog dismiss failed:', error);
      }
    }, timeoutMs);
  }

  disarm(): void {
    if (this.handle === null) return;
    this.timers.clear(this.handle);
    this.handle = null;
  }
}
