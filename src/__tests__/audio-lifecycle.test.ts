import { describe, expect, it, vi } from 'vitest';
import { AudioPlaybackRegistry } from '../overlay/audio-lifecycle';

describe('AudioPlaybackRegistry', () => {
  it('在最后一个声音图表完成前不释放上下文', () => {
    const dispose = vi.fn();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const registry = new AudioPlaybackRegistry(dispose);
    const first = registry.track(firstCleanup);
    const second = registry.track(secondCleanup);

    registry.releaseContextWhenIdle();
    first();

    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    second();
    second();

    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('强制关闭会停止全部图表且不会留下重复释放', () => {
    const dispose = vi.fn();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const registry = new AudioPlaybackRegistry(dispose);
    const first = registry.track(firstCleanup);
    const second = registry.track(secondCleanup);

    registry.forceClose();
    first();
    second();

    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
