/**
 * CG 粒子工具层契约（阶段 C 工具层）。
 *
 * 42 个场景共用同一套 emitter 工厂：档位裁剪、资源释放、粒子预算三件事
 * 必须由工具层统一保证，否则 42 处各写一份会漏掉其中之一。
 *
 * 设计规格 §4.1 独立性规则 2：共享仅限工具层，工具层不得导出成品场景。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createParticleHub,
  QUALITY_PARTICLE_SCALE,
  scaledCount,
} from '../overlay/cg-particle-kit';

describe('CG 粒子工具层', () => {
  it('档位粒子倍率与设计规格 §3.1 一致', () => {
    expect(QUALITY_PARTICLE_SCALE.cinematic).toBe(1);
    expect(QUALITY_PARTICLE_SCALE.high).toBe(0.75);
    expect(QUALITY_PARTICLE_SCALE.medium).toBe(0.5);
    expect(QUALITY_PARTICLE_SCALE.low).toBe(0.3);
  });

  it('scaledCount 按档位缩放且至少留 1 颗，避免整层消失', () => {
    expect(scaledCount(100, 'cinematic')).toBe(100);
    expect(scaledCount(100, 'high')).toBe(75);
    expect(scaledCount(100, 'medium')).toBe(50);
    // 2 × 0.3 = 0.6 → 向下取整为 0，必须兜到 1：档位不该让元素凭空消失。
    expect(scaledCount(2, 'low')).toBe(1);
  });

  it('hub 把 BatchedRenderer 挂到 root，供渲染循环驱动', () => {
    const root = new THREE.Group();
    const hub = createParticleHub(root, 'high');
    expect(root.children).toContain(hub.batchedRenderer);
    hub.dispose();
  });

  it('emit 返回的系统被 hub 接管，dispose 时一并清空', () => {
    const root = new THREE.Group();
    const hub = createParticleHub(root, 'cinematic');
    hub.emit({ count: 40, lifetime: [0.4, 0.9], speed: [60, 180], size: [6, 14], color: new THREE.Color('#ff5522') });
    hub.emit({ count: 20, lifetime: [0.2, 0.5], speed: [20, 60], size: [3, 8], color: new THREE.Color('#66ccff') });
    expect(hub.systemCount).toBe(2);
    hub.dispose();
    expect(hub.systemCount).toBe(0);
    // 根节点必须复原，否则重复 start 会堆积孤儿节点。
    expect(root.children).toHaveLength(0);
  });

  it('dispose 幂等：重复调用不抛错', () => {
    const hub = createParticleHub(new THREE.Group(), 'medium');
    hub.dispose();
    expect(() => hub.dispose()).not.toThrow();
  });

  it('dispose 后 emit 静默失效，不再创建系统', () => {
    const hub = createParticleHub(new THREE.Group(), 'high');
    hub.dispose();
    hub.emit({ count: 10, lifetime: [0.2, 0.4], speed: [10, 20], size: [2, 4], color: new THREE.Color('#fff') });
    expect(hub.systemCount).toBe(0);
  });

  it('update 推进批渲染器时间，dispose 后调用不抛错', () => {
    const hub = createParticleHub(new THREE.Group(), 'high');
    hub.emit({ count: 10, lifetime: [0.3, 0.6], speed: [40, 80], size: [4, 9], color: new THREE.Color('#ffaa33') });
    expect(() => hub.update(0.016)).not.toThrow();
    hub.dispose();
    expect(() => hub.update(0.016)).not.toThrow();
  });
});
