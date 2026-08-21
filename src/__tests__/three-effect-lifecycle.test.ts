import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreeEffectSpec } from '../overlay/three-effects';

const state = vi.hoisted(() => ({
  renderers: [] as Array<Record<string, ReturnType<typeof vi.fn>>>,
  loads: [] as Array<{
    texture: { dispose: ReturnType<typeof vi.fn> };
    onLoad: (texture: never) => void;
    onError?: () => void;
  }>,
}));

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    outputColorSpace: unknown;
    toneMapping: unknown;
    setClearColor = vi.fn();
    setClearAlpha = vi.fn();
    getClearAlpha = vi.fn(() => 0);
    getClearColor = vi.fn((target: { set: (value: number) => void }) => { target.set(0); return target; });
    getPixelRatio = vi.fn(() => 1);
    getSize = vi.fn((target: { set: (width: number, height: number) => void }) => { target.set(1, 1); return target; });
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

    constructor() { state.renderers.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>); }
  }
  class MockTextureLoader {
    load(_url: string, onLoad: (texture: never) => void, _progress?: unknown, onError?: () => void) {
      const texture = new actual.Texture();
      vi.spyOn(texture, 'dispose');
      state.loads.push({ texture: texture as unknown as { dispose: ReturnType<typeof vi.fn> }, onLoad, onError });
      return texture;
    }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer, TextureLoader: MockTextureLoader };
});

import * as THREE from 'three';
import { ThreeEffectRenderer } from '../overlay/three-effects';

const spec = (url = 'asset://sprite'): ThreeEffectSpec => ({
  url, preset: 'spiral', hue: 24, x: 160, y: 90,
  vel: { vx: 3, vy: -2, speed: 4, dir: -0.59 }, params: {},
});

describe('ThreeEffectRenderer GPU 生命周期', () => {
  beforeEach(() => { state.renderers.length = 0; state.loads.length = 0; vi.restoreAllMocks(); });

  it('取消后的迟到纹理回调只释放自身资源，不会重建旧精灵', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'));
    effect.start(spec(), 0);
    const pending = state.loads[0];
    effect.cancel();
    expect(pending.texture.dispose).toHaveBeenCalledTimes(1);

    pending.onLoad(pending.texture as never);
    expect(pending.texture.dispose).toHaveBeenCalledTimes(1);
    expect(effect.isAlive).toBe(false);
    expect((effect as unknown as { root: THREE.Group }).root.children).toHaveLength(0);
    effect.dispose();
  });

  it('共享几何体、材质和纹理在一次清场中只释放一次', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'));
    const root = (effect as unknown as { root: THREE.Group }).root;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));

    effect.cancel();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    effect.dispose();
  });

  it('新运行会废弃旧纹理请求，dispose 是幂等的且停止内部动画循环', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'));
    effect.start(spec('asset://first'), 0);
    const first = state.loads[0];
    effect.start(spec('asset://second'), 1);
    const second = state.loads[1];
    expect(first.texture.dispose).toHaveBeenCalledTimes(1);

    first.onLoad(first.texture as never);
    second.onLoad(second.texture as never);
    expect(first.texture.dispose).toHaveBeenCalledTimes(1);
    effect.dispose();
    effect.dispose();

    expect(second.texture.dispose).toHaveBeenCalledTimes(1);
    expect(state.renderers[0].setAnimationLoop).toHaveBeenCalledWith(null);
    expect(state.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(effect.update(2)).toBe(false);
    expect(() => effect.start(spec(), 2)).toThrow('disposed');
  });

  it('专属场景不加载不会被使用的素材纹理，慢帧仍保留全部固定物理步长', () => {
    const effect = new ThreeEffectRenderer(document.createElement('canvas'));
    effect.start({ ...spec('asset://storm'), preset: 'downpour', params: { dropDensity: 2.8 } }, 0);
    expect(state.loads).toHaveLength(0);

    effect.start(spec(''), 0);
    effect.update(100);
    const states = (effect as unknown as { states: Array<{ age: number }> }).states;
    expect(states[0]?.age).toBeCloseTo(.1, 5);
    effect.dispose();
  });
});
