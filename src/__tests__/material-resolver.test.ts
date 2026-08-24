import { describe, expect, it } from 'vitest';
import type { MaterialPack } from '../shared/material-packs';
import type { Material } from '../shared/materials';
import {
  packListNeedsRefresh,
  resolveMaterial,
  resolvePackMaterial,
} from '../overlay/material-visual';

const material = (id: string, dataUri: string): Material => ({
  id,
  name: id,
  kind: 'image',
  builtin: true,
  imageFile: `${id}.svg`,
  dataUri,
});

const pack = (id: string, dataUri: string): MaterialPack => ({
  id,
  name: id,
  builtin: true,
  imageFile: `${id}.svg`,
  dataUri,
  effect: { preset: 'jet', params: {} },
  sound: {
    layers: [{ type: 'impact', attack: 0, decay: 0.1, gain: 1, delay: 0 }],
    masterGain: 0.8,
  },
  palette: { bodyGradient: ['#000000', '#ffffff'], particleHue: 24 },
});

describe('素材公共入口解析契约', () => {
  it('新建素材不在缓存中时要求刷新，已有素材继续复用缓存', () => {
    const packs = [pack('rocket', 'data:rocket')];
    expect(packListNeedsRefresh(null, 'rocket')).toBe(true);
    expect(packListNeedsRefresh(packs, 'custom-scene')).toBe(true);
    expect(packListNeedsRefresh(packs, 'rocket')).toBe(false);
    expect(packListNeedsRefresh(packs)).toBe(false);
  });

  it('优先返回精确匹配的素材包，并在缺失时回退 rocket', () => {
    const packs = [pack('rocket', 'data:rocket'), pack('flame', 'data:flame')];
    expect(resolvePackMaterial('flame', packs)).toEqual({
      kind: 'image', id: 'flame', url: 'data:flame',
    });
    expect(resolvePackMaterial('missing', packs)).toEqual({
      kind: 'image', id: 'rocket', url: 'data:rocket',
    });
  });

  it('旧素材路径与空列表回退保持兼容', () => {
    const materials = [material('rocket', 'data:rocket'), material('star', 'data:star')];
    expect(resolveMaterial('star', materials)).toEqual({
      kind: 'image', id: 'star', url: 'data:star',
    });
    expect(resolveMaterial('missing', [])).toEqual({
      kind: 'image', id: 'rocket', url: '',
    });
    expect(resolvePackMaterial('missing', [])).toEqual({
      kind: 'image', id: 'rocket', url: '',
    });
  });
});
