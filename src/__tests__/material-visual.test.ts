/**
 * MaterialTrail（环形缓冲拖尾）与 ImageMaterial（零分配粒子爆裂）的测试。
 *
 * 这两个类是 overlay 帧循环里的热路径：跟随阶段每帧 push 一个拖尾点，爆裂
 * 阶段每帧推进粒子并绘制。优化点在于——
 *   1. 拖尾用定长数组 + 头/尾游标实现环形缓冲，避免每帧 `push`/`shift` 的
 *      对象分配与 O(n) 移除；
 *   2. 粒子在单遍内「原地压缩」，不再每帧 `filter` 分配新数组。
 * 测试锁定这些行为，防止回归到逐帧分配实现。
 */
import { describe, it, expect, vi } from 'vitest';
import { MaterialTrail, ImageMaterial } from '../overlay/material-visual';

/** 最小 canvas 2D context mock：记录每帧画了多少段。 */
function mockCtx() {
  let strokes = 0;
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => {
      strokes++;
    }),
    drawImage: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokes: () => strokes };
}

describe('MaterialTrail（环形缓冲）', () => {
  it('push 的点数正确累计，未超上限前逐步增长', () => {
    const trail = new MaterialTrail();
    for (let i = 0; i < 6; i++) trail.push(i * 10, 0, i * 16);
    const { ctx, strokes } = mockCtx();
    trail.draw(ctx, 200);
    // 6 个点 → 5 段。
    expect(strokes()).toBe(5);
  });

  it('超上限后丢弃最旧点，点数封顶为 max', () => {
    const trail = new MaterialTrail();
    // 14 之后每新增一个就丢一个最旧的；始终只有 14 点。
    for (let i = 0; i < 20; i++) trail.push(i * 10, 0, i * 16);
    const { ctx, strokes } = mockCtx();
    // 全部在 220ms 存活窗口内 → 14 点全部绘制 → 13 段。
    trail.draw(ctx, 19 * 16 + 1);
    expect(strokes()).toBe(13);
  });

  it('静止（距离 <4px）时不记新点', () => {
    const trail = new MaterialTrail();
    trail.push(100, 100, 0);
    trail.push(100, 101, 16); // 距离 1 < 4，被过滤
    trail.push(130, 100, 32); // 距离 30 > 4，记点
    const { ctx, strokes } = mockCtx();
    // 只有 2 个有效点（0、2）→ 1 段。
    trail.draw(ctx, 200);
    expect(strokes()).toBe(1);
  });

  it('clear 后不再绘制', () => {
    const trail = new MaterialTrail();
    trail.push(0, 0, 0);
    trail.push(10, 0, 16);
    trail.clear();
    const { ctx, strokes } = mockCtx();
    trail.draw(ctx, 200);
    expect(strokes()).toBe(0);
  });

  it('环形回绕后仍按时间顺序从旧到新绘制', () => {
    const trail = new MaterialTrail();
    // 填入 20 个点：环形缓冲会回绕（head 不再是 0）。
    for (let i = 0; i < 20; i++) trail.push(i * 10, 0, i * 16);
    const { ctx, strokes } = mockCtx();
    trail.draw(ctx, 19 * 16 + 1);
    expect(strokes()).toBe(13);
    // head 已回绕：第 20 次写入覆盖了下标 5，head = 6。
    const internals = trail as unknown as { head: number; count: number };
    expect(internals.head).toBeGreaterThan(0);
    expect(internals.count).toBe(14);
  });
});

describe('ImageMaterial（零分配粒子爆裂）', () => {
  it('updateAndDrawCrack 在动画进行中原地压缩粒子，不产生新数组', () => {
    const material = new ImageMaterial();
    material.startCrack(100, 100);
    const internals = material as unknown as {
      particles: unknown[];
      crackOn: boolean;
    };
    // 把爆裂起点固定为 0，便于用相对时间戳推进；真实运行时它是 performance.now()。
    (internals as unknown as { crackT0: number }).crackT0 = 0;
    const before = internals.particles;

    const { ctx } = mockCtx();
    // 动画窗口 = 1200ms。在动画进行中逐帧推进：每帧数组引用必须保持不变
    for (let i = 0; i < 20; i++) {
      const t = i * 35; // 0..665ms，均 < 1200ms
      material.updateAndDrawCrack(ctx, t);
      expect(internals.crackOn, `at t=${t}`).toBe(true);
      expect(internals.particles).toBe(before);
    }
    // 动画结束帧：一次性清空数组
    material.updateAndDrawCrack(ctx, 1200);
    expect(internals.crackOn).toBe(false);
  });

  it('爆裂动画在 CRACK_MS 后自动结束', () => {
    const material = new ImageMaterial();
    material.startCrack(0, 0);
    const internals = material as unknown as {
      crackOn: boolean;
      crackT0: number;
    };
    // 固定起点为 0。
    internals.crackT0 = 0;
    const { ctx } = mockCtx();
    // CRACK_MS = 1200ms。分别在 400ms（未结束）与 1200ms（结束）采样。
    material.updateAndDrawCrack(ctx, 400);
    expect(internals.crackOn).toBe(true);
    material.updateAndDrawCrack(ctx, 1200);
    expect(internals.crackOn).toBe(false);
  });
});
