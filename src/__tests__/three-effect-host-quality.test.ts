import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectQuality } from '../shared/config';

const state = vi.hoisted(() => ({
  constructed: [] as Array<{ quality: EffectQuality | undefined; disposed: boolean }>,
}));

vi.mock('../overlay/three-effects', () => ({
  ThreeEffectRenderer: class {
    isAlive = false;
    private readonly entry: { quality: EffectQuality | undefined; disposed: boolean };
    constructor(_canvas: HTMLCanvasElement, quality?: EffectQuality) {
      this.entry = { quality, disposed: false };
      state.constructed.push(this.entry);
    }
    resize = vi.fn();
    start = vi.fn();
    update = vi.fn(() => false);
    cancel = vi.fn();
    dispose = vi.fn(() => { this.entry.disposed = true; });
  },
}));

import { ThreeEffectHost } from '../overlay/three-effect-host';

async function settle(): Promise<void> {
  // 动态 import + then/finally 链需要多轮微任务才落地。
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe('ThreeEffectHost 画质档位', () => {
  beforeEach(() => { state.constructed.length = 0; });

  it('默认不指定档位时把 undefined 交给 renderer 用自身默认值', async () => {
    const host = new ThreeEffectHost(document.createElement('canvas'));
    host.ensure();
    await settle();
    expect(state.constructed).toHaveLength(1);
    expect(state.constructed[0].quality).toBeUndefined();
    host.dispose();
  });

  it('setQuality 后新建的 renderer 使用该档位', async () => {
    const host = new ThreeEffectHost(document.createElement('canvas'));
    host.setQuality('cinematic');
    host.ensure();
    await settle();
    expect(state.constructed[0].quality).toBe('cinematic');
    host.dispose();
  });

  it('已有 renderer 时切换档位会重建，确保后处理链按新档装配', async () => {
    const host = new ThreeEffectHost(document.createElement('canvas'));
    host.setQuality('low');
    host.ensure();
    await settle();
    expect(state.constructed).toHaveLength(1);

    host.setQuality('cinematic');
    await settle();
    // 档位决定 pass 列表与 pixelRatio，只有重建才能生效。
    expect(state.constructed[0].disposed).toBe(true);
    expect(state.constructed).toHaveLength(2);
    expect(state.constructed[1].quality).toBe('cinematic');
    host.dispose();
  });

  it('重复设置同一档位不重建，避免无谓的 GPU 抖动', async () => {
    const host = new ThreeEffectHost(document.createElement('canvas'));
    host.setQuality('high');
    host.ensure();
    await settle();
    host.setQuality('high');
    await settle();
    expect(state.constructed).toHaveLength(1);
    expect(state.constructed[0].disposed).toBe(false);
    host.dispose();
  });

  it('dispose 后 setQuality 不再重建 renderer', async () => {
    const host = new ThreeEffectHost(document.createElement('canvas'));
    host.setQuality('high');
    host.ensure();
    await settle();
    host.dispose();
    host.setQuality('cinematic');
    await settle();
    expect(state.constructed).toHaveLength(1);
  });
});
