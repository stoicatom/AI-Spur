import { describe, expect, it } from 'vitest';
import { createQualityController } from '../overlay/quality-tier';

/** 喂 n 帧，每帧耗时 ms。返回最后一次的档位。 */
function feed(
  controller: ReturnType<typeof createQualityController>,
  ms: number,
  frames: number,
): string {
  let tier = controller.tier;
  for (let i = 0; i < frames; i += 1) tier = controller.sample(ms);
  return tier;
}

describe('createQualityController 自适应档位（§3.2）', () => {
  it('手动档位直接锁定，不做任何自适应', () => {
    const c = createQualityController('high');
    expect(c.tier).toBe('high');
    // 帧耗时爆炸也不降档：用户选择即锁定。
    expect(feed(c, 500, 300)).toBe('high');
    expect(c.isAuto).toBe(false);
  });

  it('auto 档以基准探测结果作为初始档位', () => {
    const fast = createQualityController('auto', { baselineMs: 6 });
    expect(fast.isAuto).toBe(true);
    expect(fast.tier).toBe('cinematic');

    const mid = createQualityController('auto', { baselineMs: 13 });
    expect(mid.tier).toBe('high');

    const slow = createQualityController('auto', { baselineMs: 26 });
    expect(slow.tier).toBe('medium');
  });

  it('缺少基准时保守取 medium', () => {
    expect(createQualityController('auto').tier).toBe('medium');
  });

  it('连续 2 个窗口超过基准 ×1.6 才降一档', () => {
    const c = createQualityController('auto', { baselineMs: 10 });
    expect(c.tier).toBe('cinematic');

    // 第 1 个窗口（30 帧）慢：还不降，避免单次抖动误判。
    expect(feed(c, 20, 30)).toBe('cinematic');
    // 第 2 个连续慢窗口：降一档。
    expect(feed(c, 20, 30)).toBe('high');
  });

  it('降档一次只走一格，不跳档', () => {
    const c = createQualityController('auto', { baselineMs: 10 });
    feed(c, 40, 60);
    expect(c.tier).toBe('high');
    feed(c, 40, 60);
    expect(c.tier).toBe('medium');
  });

  it('慢窗口被快窗口打断后重新累计，不残留计数', () => {
    const c = createQualityController('auto', { baselineMs: 10 });
    feed(c, 20, 30);   // 慢窗口 1
    feed(c, 10, 30);   // 正常窗口打断
    feed(c, 20, 30);   // 慢窗口重新计 1
    expect(c.tier).toBe('cinematic');
  });

  it('连续 6 个窗口低于基准 ×0.7 才升一档', () => {
    const c = createQualityController('auto', { baselineMs: 20 });
    expect(c.tier).toBe('high');

    feed(c, 10, 30 * 5);
    expect(c.tier).toBe('high');
    feed(c, 10, 30);
    expect(c.tier).toBe('cinematic');
  });

  it('两端封顶：最高档不再升，最低档不再降', () => {
    const top = createQualityController('auto', { baselineMs: 6 });
    expect(top.tier).toBe('cinematic');
    feed(top, 1, 30 * 12);
    expect(top.tier).toBe('cinematic');

    const bottom = createQualityController('auto', { baselineMs: 26 });
    feed(bottom, 999, 30 * 20);
    expect(bottom.tier).toBe('low');
  });

  it('阈值相对本机基准，慢机不会因绝对帧耗时被判慢', () => {
    // 基准 33ms 的慢机跑 30ms：低于 1.6× 阈值，不降档。
    const slowMachine = createQualityController('auto', { baselineMs: 33 });
    const startTier = slowMachine.tier;
    feed(slowMachine, 30, 30 * 4);
    expect(slowMachine.tier).toBe(startTier);
  });

  it('降档后按新档位继续判定，不重置基准', () => {
    const c = createQualityController('auto', { baselineMs: 10 });
    feed(c, 20, 60);
    expect(c.tier).toBe('high');
    expect(c.baselineMs).toBe(10);
  });

  it('reset 回到初始档位并清空窗口状态', () => {
    const c = createQualityController('auto', { baselineMs: 10 });
    feed(c, 20, 60);
    expect(c.tier).toBe('high');
    c.reset();
    expect(c.tier).toBe('cinematic');
    feed(c, 20, 30);
    expect(c.tier).toBe('cinematic');
  });

  it('忽略非正帧耗时，避免脏采样污染窗口', () => {
    const c = createQualityController('auto', { baselineMs: 10 });
    feed(c, 0, 100);
    feed(c, -5, 100);
    expect(c.tier).toBe('cinematic');
  });
});
