import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CinematicRenderPipeline } from '../overlay/three-render-pipeline';
import { budgetFor } from '../overlay/effect-quality-budget';

/**
 * pipeline 只在有 WebGL 上下文时能真正构造 composer，jsdom 里没有。
 * 这里断言的是「pass 列表按档位装配」这条决策逻辑，用假 renderer 驱动。
 */
function fakeRenderer(): THREE.WebGLRenderer {
  return {
    getContext: () => ({ getExtension: () => null }),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    getSize: (v: THREE.Vector2) => v.set(800, 600),
    getPixelRatio: () => 1,
    domElement: { width: 800, height: 600 },
    capabilities: { isWebGL2: true },
    renderLists: { dispose: vi.fn() },
    dispose: vi.fn(),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
}

function makePipeline(quality: Parameters<typeof budgetFor>[0]) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  return new CinematicRenderPipeline(fakeRenderer(), scene, camera, budgetFor(quality));
}

describe('CinematicRenderPipeline 按档位装配', () => {
  it('电影级启用 bloom', () => {
    expect(makePipeline('cinematic').passNames()).toContain('bloom');
  });

  it('低档不启用 bloom（规格 §3.1 低档仅 SMAA）', () => {
    expect(makePipeline('low').passNames()).not.toContain('bloom');
  });

  it('所有档位都有 render 与 output pass 兜底', () => {
    for (const q of ['cinematic', 'high', 'medium', 'low'] as const) {
      const names = makePipeline(q).passNames();
      expect(names[0], q).toBe('render');
      expect(names.at(-1), q).toBe('output');
    }
  });

  it('档位越高 pass 越多', () => {
    const counts = (['low', 'medium', 'high', 'cinematic'] as const).map(
      (q) => makePipeline(q).passNames().length,
    );
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts.at(-1)).toBeGreaterThan(counts[0]);
  });

  it('缺省预算时不抛错（向后兼容既有调用点）', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    expect(() => new CinematicRenderPipeline(fakeRenderer(), scene, camera)).not.toThrow();
  });
});
