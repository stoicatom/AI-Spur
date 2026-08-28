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
  material: {
    crackAlive: boolean;
    cursorDrawRadius: number;
    updateAndDrawCrack: ReturnType<typeof vi.fn>;
    drawCursor: ReturnType<typeof vi.fn>;
  };
  three: { isAlive: boolean; update: ReturnType<typeof vi.fn> };
  trail: { draw: ReturnType<typeof vi.fn>; bounds: ReturnType<typeof vi.fn>; maxLineWidth: number };
  ctx: { clearRect: ReturnType<typeof vi.fn> };
  cursor: { x: number; y: number };
}

function harness(opts: { crackAlive: boolean; threeAlive: boolean; active: boolean }): Harness {
  const dismiss = vi.fn(async () => {});
  const material = {
    crackAlive: opts.crackAlive,
    cursorDrawRadius: 64,
    updateAndDrawCrack: vi.fn(),
    drawCursor: vi.fn(),
  };
  const three = { isAlive: opts.threeAlive, update: vi.fn(() => false) };
  const trail = { draw: vi.fn(), bounds: vi.fn(() => null), maxLineWidth: 10 };
  const ctx = { clearRect: vi.fn() };
  const cursor = { x: 10, y: 20 };
  const loop = new OverlayRenderLoop({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    three: three as unknown as ThreeEffectHost,
    material: material as unknown as ImageMaterial,
    trail: trail as unknown as MaterialTrail,
    width: () => 800,
    height: () => 600,
    mouseX: () => cursor.x,
    mouseY: () => cursor.y,
    isActive: () => opts.active,
    onDismiss: dismiss,
  });
  return { loop, dismiss, material, three, trail, ctx, cursor };
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

/**
 * 脏区域清除（R-PERF-002）。
 *
 * 这里盯的是「省下清屏开销」与「不留残影」之间的边界：矩形算小了，屏幕上就
 * 留下上一帧的像素；算成整屏，优化就白做。所以每条用例都断言真实坐标，而不是
 * 只断言「clearRect 被调用过」。
 */
describe('OverlayRenderLoop 脏区域清除', () => {
  /** clearRect(x, y, w, h) → [左, 上, 右, 下]，便于按包含关系断言。 */
  function lastClearBox(h: Harness): [number, number, number, number] {
    const calls = h.ctx.clearRect.mock.calls;
    const [x, y, w, hgt] = calls[calls.length - 1] as number[];
    return [x, y, x + w, y + hgt];
  }

  it('跟随阶段只清光标周围，不是整屏', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: true });
    h.cursor.x = 400;
    h.cursor.y = 300;
    h.loop.start();
    raf.step();

    const [left, top, right, bottom] = lastClearBox(h);
    // 覆盖住光标的落笔半径（64）
    expect(left).toBeLessThanOrEqual(400 - 64);
    expect(top).toBeLessThanOrEqual(300 - 64);
    expect(right).toBeGreaterThanOrEqual(400 + 64);
    expect(bottom).toBeGreaterThanOrEqual(300 + 64);
    // 但远小于 800x600 整屏
    expect((right - left) * (bottom - top)).toBeLessThan(800 * 600 * 0.25);
  });

  it('拖尾跨越大范围时，清除区域随之扩张（否则留残影）', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: true });
    h.cursor.x = 700;
    h.cursor.y = 500;
    // 拖尾从屏幕左上一路甩到光标处
    h.trail.bounds.mockReturnValue({ minX: 40, minY: 30, maxX: 700, maxY: 500 });
    h.loop.start();
    raf.step();

    const [left, top, right, bottom] = lastClearBox(h);
    expect(left).toBeLessThanOrEqual(40 - 10); // 含线宽外扩
    expect(top).toBeLessThanOrEqual(30 - 10);
    expect(right).toBeGreaterThanOrEqual(700);
    expect(bottom).toBeGreaterThanOrEqual(500);
  });

  it('光标移动后，清除区域并入上一帧位置', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: true });
    h.cursor.x = 100;
    h.cursor.y = 100;
    h.loop.start();
    raf.step(); // 第一帧画在 (100, 100)

    h.cursor.x = 500;
    h.cursor.y = 400;
    raf.step(); // 第二帧画在 (500, 400)，必须同时擦掉 (100, 100) 的旧像素

    const [left, top, right, bottom] = lastClearBox(h);
    expect(left).toBeLessThanOrEqual(100 - 64);
    expect(top).toBeLessThanOrEqual(100 - 64);
    expect(right).toBeGreaterThanOrEqual(500 + 64);
    expect(bottom).toBeGreaterThanOrEqual(400 + 64);
  });

  it('清除区域不会越出画布边界', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: true });
    h.cursor.x = 5; // 贴左上角，半径会溢出到负坐标
    h.cursor.y = 5;
    h.loop.start();
    raf.step();

    const calls = h.ctx.clearRect.mock.calls;
    const [x, y, w, hgt] = calls[calls.length - 1] as number[];
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(800);
    expect(y + hgt).toBeLessThanOrEqual(600);
  });

  it('crack 阶段仍然整屏清除（粒子可能铺满全屏）', () => {
    const h = harness({ crackAlive: true, threeAlive: false, active: false });
    h.loop.start();
    raf.step();
    expect(h.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('stop() 后重启，首帧不会并入上一次会话的脏区域', () => {
    const h = harness({ crackAlive: false, threeAlive: false, active: true });
    h.cursor.x = 700;
    h.cursor.y = 500;
    h.loop.start();
    raf.step();
    h.loop.stop(); // 整屏清空，累积的矩形随之失效

    h.cursor.x = 100;
    h.cursor.y = 100;
    h.ctx.clearRect.mockClear();
    h.loop.start();
    raf.step();

    const [left, top, right, bottom] = lastClearBox(h);
    // 只围着新位置，不该再带上 (700, 500)
    expect(right).toBeLessThan(700);
    expect(bottom).toBeLessThan(500);
    expect(left).toBeLessThanOrEqual(100 - 64);
    expect(top).toBeLessThanOrEqual(100 - 64);
  });
});
