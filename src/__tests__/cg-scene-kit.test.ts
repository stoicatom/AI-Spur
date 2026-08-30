import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes';
import { resolveScene } from '../overlay/cg-scene-registry';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';
import { createSceneResources } from '../overlay/cg-scene-kit';
import { makeSceneCtx } from './cg-scene-harness';

describe('CG 场景资源容器', () => {
  it('dispose 递归清空整棵子树（嵌套容器不留残子）', () => {
    const root = new THREE.Group();
    const res = createSceneResources(root, new THREE.Vector3(), 'probe-scene');

    // 造一棵三层嵌套：group → outer → inner → 叶子。
    const outer = new THREE.Group();
    outer.name = 'outer-container';
    res.group.add(outer);
    const inner = new THREE.Group();
    inner.name = 'inner-container';
    outer.add(inner);
    for (let i = 0; i < 5; i += 1) {
      inner.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1)));
    }

    expect(inner.children).toHaveLength(5);
    res.dispose();

    // 三层都必须清空。`group.clear()` 只摘直接子节点，嵌套容器会留下
    // 互相引用的整片 mesh——42 个场景里曾有 17 个中招，最重一处残留
    // 150 个子节点。这条断言锁住递归清理不被改回去。
    expect(res.group.children, '场景 group 未清空').toHaveLength(0);
    expect(outer.children, '中层容器未清空').toHaveLength(0);
    expect(inner.children, '内层容器未清空').toHaveLength(0);
    expect(root.children, 'group 未从宿主摘除').toHaveLength(0);
  });

  it('dispose 幂等且释放全部登记资源', () => {
    const root = new THREE.Group();
    const res = createSceneResources(root, new THREE.Vector3(), 'probe-scene');
    let disposedCount = 0;
    res.track({ dispose() { disposedCount += 1; } });
    res.track({ dispose() { disposedCount += 1; } });

    res.dispose();
    expect(disposedCount).toBe(2);
    expect(res.disposed).toBe(true);

    // 再次调用不得重复释放（幂等）。
    res.dispose();
    expect(disposedCount).toBe(2);
  });

  // 全场景回归：任何场景在 dispose 后都不该留下持有子节点的容器。
  // 这条是上面单元断言的端到端版本——新场景引入嵌套容器时会在此暴露。
  it('42 个场景 dispose 后均无残留容器', () => {
    const leaks: string[] = [];
    for (const id of BUILTIN_PACK_IDS) {
      const scene = resolveScene(id);
      if (!scene) continue;
      const ctx = makeSceneCtx();
      const stage = scene.create(ctx);
      stage.update(0.5, 600, 'cinematic');

      // dispose 前登记所有容器（含嵌套）。
      const groups: THREE.Object3D[] = [];
      ctx.root.traverse((o) => {
        if (o.type === 'Group' && o !== ctx.root) groups.push(o);
      });
      stage.dispose();

      const held = groups.filter((g) => g.children.length > 0);
      if (held.length > 0) {
        leaks.push(`${id}: ${held.map((g) => `${g.name || '(匿名)'}=${g.children.length}`).join(' ')}`);
      }
    }
    expect(leaks, `残留容器:\n${leaks.join('\n')}`).toEqual([]);
  });
});
