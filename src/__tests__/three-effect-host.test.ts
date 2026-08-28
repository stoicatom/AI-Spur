import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeRenderer = {
  isAlive: boolean;
  resize: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const state = vi.hoisted(() => ({ instances: [] as FakeRenderer[] }));

vi.mock('../overlay/three-effects', () => {
  class MockRenderer {
    isAlive = false;
    resize = vi.fn();
    start = vi.fn();
    update = vi.fn(() => false);
    cancel = vi.fn();
    dispose = vi.fn();

    constructor() { state.instances.push(this); }
  }
  return { ThreeEffectRenderer: MockRenderer };
});

import { ThreeEffectHost } from '../overlay/three-effect-host';

async function settleImport(): Promise<void> {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

describe('ThreeEffectHost 生命周期', () => {
  beforeEach(() => { state.instances.length = 0; });

  it('重复 ensure 只创建一个渲染器，dispose 后事件不再重新初始化', async () => {
    const canvas = document.createElement('canvas');
    const host = new ThreeEffectHost(canvas);
    host.ensure();
    host.ensure();
    await settleImport();

    expect(state.instances).toHaveLength(1);
    const renderer = state.instances[0];
    host.dispose();
    host.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await settleImport();
    expect(state.instances).toHaveLength(1);
  });

  it('上下文丢失时不初始化，恢复后才创建并同步尺寸', async () => {
    const canvas = document.createElement('canvas');
    const host = new ThreeEffectHost(canvas);
    host.resize(640, 360);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    host.ensure();
    await settleImport();
    expect(lost.defaultPrevented).toBe(true);
    expect(state.instances).toHaveLength(0);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await settleImport();
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].resize).toHaveBeenCalledWith(640, 360);
    host.dispose();
  });

  it('恢复尺寸写入延后到上下文恢复监听链结束，并可被 dispose 取消', async () => {
    const canvas = document.createElement('canvas');
    const host = new ThreeEffectHost(canvas);
    host.ensure();
    await settleImport();
    const renderer = state.instances[0];
    renderer.resize.mockClear();

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.resize).not.toHaveBeenCalled();
    host.dispose();
    await Promise.resolve();

    expect(renderer.resize).not.toHaveBeenCalled();
    expect(renderer.cancel).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
