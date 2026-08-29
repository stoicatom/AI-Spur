/**
 * 场景 42 black-hole 实现验收（设计规格 §4.2 场景 42）。
 *
 * 断言按规格逐条对应：9 个元素齐备、三幕时间轴、全屏覆盖比例、
 * 独立签名（物质回弹）、资源释放。这是 42 个场景的标杆用例，
 * 后续场景照此结构验收。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStageContext } from '../overlay/cg-scene';

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#8C5FD3'),
    energy: 1.4,
    direction: new THREE.Vector2(1, 0),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

/** 递归收集场景里所有具名节点，用于按元素名核查。 */
function namedNodes(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => { if (o.name) names.push(o.name); });
  return names;
}

const scene = resolveScene('black-hole');

describe('场景 42 black-hole', () => {
  it('已注册且签名声明物质回弹机制', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.signature).toContain('回弹');
  });

  it('9 个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const names = namedNodes(ctx.root).join('|');
    // 元素名取自规格 §4.2，实现里以 name 标注便于验收与调试。
    for (const element of [
      'event-horizon', 'photon-ring', 'accretion-disk', 'infalling-dust',
      'gravitational-lens', 'relativistic-jet', 'star-field',
      'critical-flash', 'final-flare',
    ]) {
      expect(names, `缺元素 ${element}`).toContain(element);
    }
    stage.dispose();
  });

  it('吸积盘直径占全屏 2/3（规格全屏要求）', () => {
    const ctx = makeCtx({ width: 1920, height: 1080 });
    const stage = scene!.create(ctx);
    let disk: THREE.Object3D | null = null;
    ctx.root.traverse((o) => { if (o.name === 'accretion-disk') disk = o; });
    expect(disk).not.toBeNull();
    const box = new THREE.Box3().setFromObject(disk!);
    const diameter = box.getSize(new THREE.Vector3()).x;
    const target = Math.min(ctx.width, ctx.height) * (2 / 3);
    // 允许 25% 浮动：盘是倾斜椭圆，包围盒并非精确直径。
    expect(diameter).toBeGreaterThan(target * 0.75);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 遍历整棵树而非只看顶层：场景挂在一个 group 下，状态变化都在子节点上。
    const snapshot = (t: number) => {
      stage.update(t, t * 1850, 'cinematic');
      const rows: unknown[] = [];
      ctx.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const material = mesh.material && !Array.isArray(mesh.material)
          ? (mesh.material as THREE.Material)
          : null;
        rows.push([
          o.name,
          o.position.toArray().map((n) => Number(n.toFixed(2))),
          o.scale.toArray().map((n) => Number(n.toFixed(3))),
          material ? Number(material.opacity.toFixed(3)) : null,
        ]);
      });
      return JSON.stringify(rows);
    };
    // 0–450 成形 / 450–1450 吞噬 / 1450–1850 白炽
    const act1 = snapshot(0.15);
    const act2 = snapshot(0.6);
    const act3 = snapshot(0.95);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('尾声白炽在第三幕才显现', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    let flare: THREE.Mesh | null = null;
    ctx.root.traverse((o) => { if (o.name === 'final-flare') flare = o as THREE.Mesh; });
    expect(flare).not.toBeNull();

    stage.update(0.3, 555, 'cinematic');
    const duringAct2 = (flare!.material as THREE.Material).opacity;
    stage.update(0.97, 1795, 'cinematic');
    const duringAct3 = (flare!.material as THREE.Material).opacity;
    // 白炽是熄灭瞬间的爆闪，第二幕不该亮。
    expect(duringAct3).toBeGreaterThan(duringAct2);
    stage.dispose();
  });

  it('低档位缩减粒子规模但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    a.update(0.6, 1110, 'cinematic');
    b.update(0.6, 1110, 'medium');

    // 九个规格元素在任何档位都必须齐备——档位只影响密度，不影响构成。
    const required = [
      'event-horizon', 'photon-ring', 'accretion-disk', 'infalling-dust',
      'gravitational-lens', 'relativistic-jet', 'star-field',
      'critical-flash', 'final-flare',
    ];
    for (const element of required) {
      expect(namedNodes(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(namedNodes(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    // 尘埃颗粒数按档位缩减：这正是档位该起作用的地方。
    const dustCount = (root: THREE.Object3D) =>
      namedNodes(root).filter((n) => n.startsWith('dust-')).length;
    expect(dustCount(lo.root)).toBeLessThan(dustCount(hi.root));
    expect(dustCount(lo.root)).toBeGreaterThan(0);

    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点，不泄漏资源', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
  });

  it('dispose 后 update 静默失效，不抛错', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.dispose();
    expect(() => stage.update(0.5, 925, 'cinematic')).not.toThrow();
  });
});
