import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCgStage } from '../overlay/cg-stage';
import { registerScene } from '../overlay/cg-scene-registry';
import type { CgStageContext } from '../overlay/cg-scene';

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#ff5500'),
    energy: 1.2,
    direction: new THREE.Vector2(1, 0),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

describe('createCgStage', () => {
  it('已注册素材在中高档创建 CG 场景', () => {
    const stage = createCgStage('black-hole', makeCtx({ quality: 'cinematic' }));
    expect(stage).not.toBeNull();
    stage?.dispose();
  });

  it('low 档不创建 CG 场景（走 legacy 保底）', () => {
    // 低档必须回退到既有程序化 Stage：动画/音效/宏发送在任何档位都要工作。
    expect(createCgStage('black-hole', makeCtx({ quality: 'low' }))).toBeNull();
  });

  it('未注册素材（用户自定义包）返回 null', () => {
    expect(createCgStage('my-custom-pack', makeCtx())).toBeNull();
  });

  it('场景工厂抛错时降级为 null，不冒泡打断渲染', () => {
    // 单个场景的实现错误不该让整个覆盖层黑屏。
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerScene(
      {
        packId: '__throwing-scene__' as never,
        title: '故障场景',
        elements: ['x'],
        signature: '仅测试用',
        preset: 'jet',
      },
      () => {
        throw new Error('boom');
      },
    );
    const stage = createCgStage('__throwing-scene__', makeCtx());
    expect(stage).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('42 个内置素材在电影级档全部可创建', () => {
    const failed: string[] = [];
    for (const id of BUILTIN_IDS) {
      const ctx = makeCtx();
      try {
        const stage = createCgStage(id, ctx);
        if (!stage) failed.push(id);
        else stage.dispose();
      } catch {
        failed.push(id);
      }
    }
    expect(failed).toEqual([]);
  });
});

const BUILTIN_IDS = [
  'rocket', 'phoenix', 'lightning', 'dragon', 'ninja-star', 'katana',
  'crystal', 'skull', 'flame', 'ice', 'thunder', 'water', 'wind',
  'star', 'moon', 'sun', 'meteor', 'comet', 'guitar', 'drum',
  'bell', 'harp', 'trumpet', 'bow', 'shield', 'axe', 'spear',
  'bomb', 'lotus', 'aurora', 'tornado', 'downpour', 'wildfire',
  'revolver', 'glass-shot', 'boxing-glove', 'bullwhip', 'piano',
  'saxophone', 'vinyl', 'fireworks', 'black-hole',
];
