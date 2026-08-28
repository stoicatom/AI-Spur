import { describe, it, expect, beforeEach } from 'vitest';
import { registerScene, resolveScene, resetRegistry, ALL_SCENE_PACK_IDS } from '../overlay/cg-scene-registry';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';

describe('cg scene registry', () => {
  beforeEach(() => resetRegistry());

  it('注册后可按 packId 解析', () => {
    registerScene(
      { packId: 'rocket', title: '发射升空', elements: ['主焰'], signature: '发射台消隐', preset: 'jet' },
      (_ctx: CgStageContext): CgStage => ({ update() {}, dispose() {} }),
    );
    const scene = resolveScene('rocket');
    expect(scene?.config.packId).toBe('rocket');
    expect(resolveScene('bomb')).toBeNull();
  });

  it('重复注册同一 packId 抛错', () => {
    const factory = (): CgStage => ({ update() {}, dispose() {} });
    registerScene({ packId: 'rocket', title: 'x', elements: [], signature: 'x', preset: 'jet' }, factory);
    expect(() =>
      registerScene({ packId: 'rocket', title: 'y', elements: [], signature: 'y', preset: 'jet' }, factory),
    ).toThrow(/duplicate|重复/);
  });

  it('42 个内置素材全部有注册项', () => {
    expect(ALL_SCENE_PACK_IDS.length).toBe(42);
  });
});
