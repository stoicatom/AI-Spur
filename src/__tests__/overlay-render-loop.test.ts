/**
 * 渲染循环漏窗测试
 *
 * frame() 的结束判定嵌套在 `if (material.crackAlive)` 内。triggerCrack 已置
 * active = false，所以 crackAlive 一旦提前变假（WebGL start 返回 false 走 2D
 * 回退、上下文丢失 → cancel()），就会掉进 `else if (active)` 且 active 为假：
 * 既不绘制也不收起，rAF 空转，全屏窗口永久留屏。
 *
 * 这里用假 rAF 逐帧驱动，直接复现这条路径，并验证看门狗兜住它。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OverlayRenderLoop } from '../overlay/overlay-render-loop';
import type { ThreeEffectHost } from '../overlay/three-effect-host';
import type { ImageMaterial } from '../overlay/image-material';
import type { MaterialTrail } from '../overlay/material-trail';

/** 手动推进的 rAF：调用 step() 才跑一帧。 */
function stubRaf() {
  let next = 1;
  const queued = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = next++;
    queued.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  return {
    step(times = 1) {
      for (let i = 0; i < times; i++) {
        const entry = [...queued.entries()][0];
        if (!entry) return;
        queued.delete(entry[0]);
        entry[1](performance.now());
      }
    },
    get pending() {
      return queued.size;
    },
  };
}

interface Harness {
  loop: OverlayRenderLoop;
  dismiss: ReturnType<typeof vi.fn>;
  material: { crackAlive: boolean; updateAndDrawCrack: ReturnType<typeof vi.fn>; drawCursor: ReturnType<typeof vi.fn> };
  three: { isAlive: boolean; update: ReturnType<typeof vi.fn> };
}

function harness(opts: { crackAlive: boolean; threeAlive: boolean; active: boolean }): Harness {
  const dismiss = vi.fn(async () => {});
  const material = {
    crackAlive: opts.crackAlive,
    updateAndDrawCrack: vi.fn(),
    drawCursor: vi.fn(),
  };
  const three = { isAlive: opts.threeAlive, update: vi.fn(() => false) };
  const trail = { draw: vi.fn() };
  const ctx = { clearRect: vi.fn() };
  const loop = new OverlayRenderLoop({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    three: three as unknown as ThreeEffectHost,
    material: material as unknown as ImageMaterial,
    trail: trail as unknown as MaterialTrail,
    width: () => 800,
    height: () => 600,
    mouseX: () => 10,
    mouseY: () => 20,
    isActive: () => opts.active,
    onDismiss: dismiss,
  });
  return { loop, dismiss, material, three };
}

let raf: ReturnType<typeof stubRaf>;
beforeEach(() => {
  vi.useFakeTimers();
  raf = stubRaf();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OverlayRenderLoop 正常结束路径', () => {
  it('WebGL 特效播完（update 返回 true）立即收起', () => {
    const h = harness({ crackAlive: true, threeAlive: true, active: false });
    h.three.update.mockReturnValue(true);
    h.loop.start();
    raf.step();
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it('2D 回退里 crack 自然结束后收起', () => {
    const h = harness({ crackAlive: true, threeAlive: false, active: false });
    h.material.updateAndDrawCrack.mockImplementation(() => {
      h.material.crackAlive = false;
    });
    h.loop.start();
    raf.step();
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('OverlayRenderLoop 漏窗路径（看门狗兜底）', () => {
  it('crackAlive 提前变假且 active 为假时，帧循环自己不会收起（漏窗复现）', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: false });
    h.loop.start();
    raf.step(5);
    // 这正是 bug：既不绘制也不 dismiss，rAF 还在排队。
    expect(h.dismiss).not.toHaveBeenCalled();
    expect(raf.pending).toBeGreaterThan(0);
  });

  it('看门狗到点后强制收起，堵住上面那条漏窗路径', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: false });
    h.loop.armWatchdog(1100);
    h.loop.start();
    raf.step(5);
    expect(h.dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it('WebGL 上下文丢失（isAlive 转假 + crackAlive 残留）也被看门狗兜住', () => {
    const h = harness({ crackAlive: true, threeAlive: true, active: false });
    h.loop.armWatchdog(1100);
    h.loop.start();
    // 上下文丢失：host.cancel() 让 isAlive 变假，但 2D 素材也已被 cancelCrack 清掉。
    h.three.isAlive = false;
    h.material.updateAndDrawCrack.mockImplementation(() => {});
    raf.step(3);
    expect(h.dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it('正常结束后 stop() 解除看门狗，不会二次收起', () => {
    const h = harness({ crackAlive: true, threeAlive: true, active: false });
    h.three.update.mockReturnValue(true);
    h.loop.armWatchdog(1100);
    h.loop.start();
    raf.step();
    expect(h.dismiss).toHaveBeenCalledTimes(1);
    h.loop.stop();
    vi.advanceTimersByTime(10_000);
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it('stop() 后不再排新帧', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: true });
    h.loop.start();
    raf.step();
    h.loop.stop();
    expect(raf.pending).toBe(0);
  });
});
