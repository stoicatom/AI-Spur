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
});
