import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreeEffectSpec } from '../overlay/three-effects';

const state = vi.hoisted(() => ({
  created: [] as Array<{ packId: string; quality: string }>,
  updates: [] as number[],
  disposes: 0,
}));

vi.mock('../overlay/cg-stage', () => ({
  cgEnabledFor: (q: string) => q !== 'low',
  createCgStage: (packId: string, ctx: { quality: string }) => {
    if (ctx.quality === 'low') return null;
    if (packId === 'custom-spiral') return null;
    state.created.push({ packId, quality: ctx.quality });
    return {
      update: (t: number) => { state.updates.push(t); },
      dispose: () => { state.disposes += 1; },
    };
  },
}));

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    outputColorSpace: unknown;
    toneMapping: unknown;
    toneMappingExposure = 1;
    setClearColor = vi.fn();
    setClearAlpha = vi.fn();
    getClearAlpha = vi.fn(() => 0);
    getClearColor = vi.fn((t: { set: (v: number) => void }) => { t.set(0); return t; });
    getPixelRatio = vi.fn(() => 1);
    getSize = vi.fn((t: { set: (w: number, h: number) => void }) => { t.set(1, 1); return t; });
    getRenderTarget = vi.fn(() => null);
    setRenderTarget = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    clear = vi.fn();
    clearDepth = vi.fn();
    autoClear = true;
    autoClearColor = true;
    autoClearDepth = true;
    autoClearStencil = true;
    dispose = vi.fn();
    setAnimationLoop = vi.fn();
    renderLists = { dispose: vi.fn() };
  }
  class MockTextureLoader {
    load(_url: string) { return new actual.Texture(); }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer, TextureLoader: MockTextureLoader };
});

import { ThreeEffectRenderer } from '../overlay/three-effects';

const spec = (packId: string): ThreeEffectSpec => ({
  packId, url: '', preset: 'singularity', hue: 24, x: 160, y: 90,
  vel: { vx: 3, vy: -2, speed: 4, dir: -0.59 }, params: {},
});

describe('ThreeEffectRenderer × CG 场景接入（Task A6）', () => {
  beforeEach(() => { state.created.length = 0; state.updates.length = 0; state.disposes = 0; });

  it('中高档已注册素材创建 CG 场景', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'), 'cinematic');
    effect.start(spec('black-hole'), 0);
    expect(state.created).toEqual([{ packId: 'black-hole', quality: 'cinematic' }]);
    effect.dispose();
  });

  it('low 档不创建 CG 场景，走 legacy 保底', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'), 'low');
    effect.start(spec('black-hole'), 0);
    expect(state.created).toHaveLength(0);
    effect.dispose();
  });

  it('未注册素材（用户自定义包）走 legacy，不报错', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'), 'high');
    expect(() => effect.start(spec('custom-spiral'), 0)).not.toThrow();
    expect(state.created).toHaveLength(0);
    effect.dispose();
  });

  it('update 把归一化进度传给 CG 场景', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'), 'high');
    effect.start(spec('black-hole'), 0);
    effect.update(100);
    expect(state.updates.length).toBeGreaterThan(0);
    expect(state.updates[0]).toBeGreaterThan(0);
    expect(state.updates[0]).toBeLessThanOrEqual(1);
    effect.dispose();
  });

  it('cancel 释放 CG 场景资源', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'), 'high');
    effect.start(spec('black-hole'), 0);
    effect.cancel();
    expect(state.disposes).toBe(1);
    effect.dispose();
  });

  it('重新 start 先释放上一个 CG 场景，不泄漏', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'), 'high');
    effect.start(spec('black-hole'), 0);
    effect.start(spec('bomb'), 0);
    expect(state.disposes).toBe(1);
    expect(state.created).toHaveLength(2);
    effect.dispose();
  });
});
