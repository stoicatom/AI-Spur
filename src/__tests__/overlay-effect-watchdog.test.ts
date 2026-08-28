/**
 * 特效超时看门狗测试
 *
 * 漏窗路径：frame() 的结束判定嵌套在 `if (material.crackAlive)` 内，
 * 一旦 crackAlive 因 WebGL 回退 / 上下文丢失变 false，rAF 空转，
 * 全屏窗口永久留屏。看门狗是最后一道防线：无论渲染状态如何，超时必收。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EffectWatchdog,
  watchdogTimeoutFor,
  WATCHDOG_FLOOR_MS,
  WATCHDOG_MARGIN_MS,
  type WatchdogTimers,
} from '../overlay/effect-watchdog';

/** 手动推进的假定时器，避免真实等待。 */
function fakeTimers() {
  let seq = 0;
  const pending = new Map<number, { fn: () => void; at: number }>();
  let now = 0;
  const timers: WatchdogTimers = {
    set(fn, ms) {
      const id = ++seq;
      pending.set(id, { fn, at: now + ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear(handle) {
      pending.delete(handle as unknown as number);
    },
  };
  return {
    timers,
    advance(ms: number) {
      now += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.at <= now) {
          pending.delete(id);
          entry.fn();
        }
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe('watchdogTimeoutFor', () => {
  it('短特效也不低于地板值（留足事件往返余量）', () => {
    expect(watchdogTimeoutFor(200)).toBe(WATCHDOG_FLOOR_MS);
  });

  it('长特效按时长 + 余量放宽', () => {
    expect(watchdogTimeoutFor(2925)).toBe(2925 + WATCHDOG_MARGIN_MS);
  });

  it('非法时长回退到地板值', () => {
    expect(watchdogTimeoutFor(Number.NaN)).toBe(WATCHDOG_FLOOR_MS);
    expect(watchdogTimeoutFor(-1)).toBe(WATCHDOG_FLOOR_MS);
  });
});

describe('EffectWatchdog', () => {
  it('超时后强制触发收起', () => {
    const clock = fakeTimers();
    const onExpire = vi.fn();
    const dog = new EffectWatchdog(onExpire, clock.timers);
    dog.arm(3000);
    clock.advance(2999);
    expect(onExpire).not.toHaveBeenCalled();
    clock.advance(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('正常结束时 disarm 阻止重复收起', () => {
    const clock = fakeTimers();
    const onExpire = vi.fn();
    const dog = new EffectWatchdog(onExpire, clock.timers);
    dog.arm(3000);
    dog.disarm();
    clock.advance(10_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(clock.pendingCount).toBe(0);
  });

  it('重新 arm 会替换上一个定时器，不会叠加两次收起', () => {
    const clock = fakeTimers();
    const onExpire = vi.fn();
    const dog = new EffectWatchdog(onExpire, clock.timers);
    dog.arm(3000);
    dog.arm(3000);
    expect(clock.pendingCount).toBe(1);
    clock.advance(3000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('触发后自动解除，armed 归位', () => {
    const clock = fakeTimers();
    const dog = new EffectWatchdog(() => {}, clock.timers);
    dog.arm(1000);
    expect(dog.armed).toBe(true);
    clock.advance(1000);
    expect(dog.armed).toBe(false);
  });

  it('回调抛错不会让看门狗卡在 armed 状态', () => {
    const clock = fakeTimers();
    const dog = new EffectWatchdog(() => {
      throw new Error('dismiss boom');
    }, clock.timers);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dog.arm(500);
    expect(() => clock.advance(500)).not.toThrow();
    expect(dog.armed).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
