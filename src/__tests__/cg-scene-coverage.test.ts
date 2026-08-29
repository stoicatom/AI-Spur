import { describe, it, expect } from 'vitest';
import '../overlay/cg-scenes';
import { resolveScene } from '../overlay/cg-scene-registry';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';

describe('42 场景覆盖', () => {
  it('每个内置素材都有独立场景注册项', () => {
    const missing = BUILTIN_PACK_IDS.filter((id) => resolveScene(id) === null);
    expect(missing).toEqual([]);
  });

  it('场景工厂互不相同（同 preset 素材场景独立）', () => {
    const factories = BUILTIN_PACK_IDS.map((id) => resolveScene(id)?.create);
    expect(new Set(factories).size).toBe(BUILTIN_PACK_IDS.length);
  });

  it('每个场景声明了非空元素清单与独立签名', () => {
    for (const id of BUILTIN_PACK_IDS) {
      const scene = resolveScene(id);
      expect(scene, id).not.toBeNull();
      expect(scene!.config.signature.length, id).toBeGreaterThan(0);
      expect(scene!.config.elements.length, id).toBeGreaterThan(0);
    }
  });

  // 规格 §4.2 给每个场景开列了 6~9 个构成件。只断言「非空」的话，
  // 一个 elements: ['x'] 的桩实现也能过——桩正是这轮实现里出现过的失败模式。
  it('每个场景的元素清单达到规格的构成件量级（≥6）', () => {
    const thin = BUILTIN_PACK_IDS
      .map((id) => ({ id, count: resolveScene(id)!.config.elements.length }))
      .filter(({ count }) => count < 6);
    expect(thin).toEqual([]);
  });

  // 独立性规则要求每个场景有「其它素材不具备的唯一机制」。签名撞车
  // 意味着两个场景在讲同一件事，是共享成品场景的直接信号。
  it('42 个签名两两不同', () => {
    const signatures = BUILTIN_PACK_IDS.map((id) => resolveScene(id)!.config.signature);
    expect(new Set(signatures).size).toBe(BUILTIN_PACK_IDS.length);
  });
});
