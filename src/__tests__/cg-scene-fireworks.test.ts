/**
 * 场景 41 fireworks 实现验收（设计规格 §4.2 场景 41）。
 *
 * 断言逐条对应规格：9 元素齐备、三幕推进、全域多落点连爆、
 * 三珠形态（百合/牡丹/星芒）并存、残珠雨被连环弹照亮、
 * 独立签名「升空-延时爆开-多形态-连环」全过程。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';

/** 规格时长，测试用它把归一化进度换回毫秒。 */
const DURATION = 1950;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#FF8A3D'),
    energy: 1.3,
    direction: new THREE.Vector2(0, 1),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

/** 递归收集具名节点，用于按元素名核查。 */
function namedNodes(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => { if (o.name) names.push(o.name); });
  return names;
}

function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (o.name === name) hit = o; });
  return hit;
}

function materialOf(node: THREE.Object3D | null): THREE.Material | null {
  const mesh = node as THREE.Mesh | null;
  if (!mesh?.material || Array.isArray(mesh.material)) return null;
  return mesh.material as THREE.Material;
}

function opacityOf(root: THREE.Object3D, name: string): number {
  return materialOf(findNode(root, name))?.opacity ?? 0;
}

/** 扫描时间轴，找某爆珠核首次亮起的归一化进度（用于验证错峰）。 */
function burstOnset(stage: CgStage, root: THREE.Object3D, core: string): number {
  for (let i = 0; i <= 200; i += 1) {
    const t = i / 200;
    stage.update(t, t * DURATION, 'cinematic');
    if (opacityOf(root, core) > 0.2) return t;
  }
  return Number.NaN;
}

/**
 * 一层形态珠的形状指纹：垂直偏置与半径离散度区分三种花型。
 *
 * meanR 用来把 meanY 折算成「占半径几成」，避免拿 lily 与 peony 直接比大小——
 * peony 的黄金角抖动本身就带一点正偏置，那个量级是噪声，不足以证明百合在下垂。
 * groupY 读的是整层的位置，形态珠的运行时垂枝施加在 group 上，珠子局部坐标读不到。
 */
function pearlStats(
  root: THREE.Object3D,
  layer: string,
): { count: number; meanY: number; meanR: number; radiusSd: number; groupY: number } {
  const group = findNode(root, layer);
  const ys: number[] = [];
  const rs: number[] = [];
  for (const pearl of group?.children ?? []) {
    ys.push(pearl.position.y);
    rs.push(Math.hypot(pearl.position.x, pearl.position.y));
  }
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const meanR = mean(rs);
  return {
    count: rs.length,
    meanY: mean(ys),
    meanR,
    radiusSd: Math.sqrt(mean(rs.map((r) => (r - meanR) ** 2))),
    groupY: group?.position.y ?? 0,
  };
}

/** 规格 §4.2 场景 41 的九元素，实现以 name 标注以便验收。 */
const SPEC_ELEMENTS = [
  'rising-shell', 'first-burst', 'form-pearls', 'ember-rain', 'chain-shells',
  'smoke-ring', 'night-sky', 'water-reflection', 'light-haze',
];

/** 三珠形态各自的第一炸层，形态并存的验收对象。 */
const FORM_LAYERS = ['pearl-lily-0', 'pearl-peony-0', 'pearl-starburst-0'];

const scene = resolveScene('fireworks');

describe('场景 41 fireworks', () => {
  it('已注册且签名声明升空-延时爆开-多形态-连环全过程', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('fireworks');
    expect(scene!.config.signature).toContain('连环');
    expect(scene!.config.signature).toContain('形态');
  });

  it('9 个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const names = namedNodes(ctx.root).join('|');
    for (const element of SPEC_ELEMENTS) {
      expect(names, `缺元素 ${element}`).toContain(element);
    }
    // 夜幕背景含城市遥光（规格元素⑦的两个组成部分）。
    expect(names).toContain('city-glow');
    stage.dispose();
  });

  it('三珠形态（百合/牡丹/星芒）作为独立层并存', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.45, 0.45 * DURATION, 'cinematic');

    const lily = pearlStats(ctx.root, 'pearl-lily-0');
    const peony = pearlStats(ctx.root, 'pearl-peony-0');
    const star = pearlStats(ctx.root, 'pearl-starburst-0');
    for (const s of [lily, peony, star]) expect(s.count).toBeGreaterThan(2);

    // 百合下垂：垂直中心要明显低于层心，而不是仅仅小于牡丹的抖动偏置。
    // 阈值取半径的两成半：去掉 droop 后百合重心回到 ~0，这条会立刻失败。
    expect(lily.meanY).toBeLessThan(-lily.meanR * 0.25);
    expect(lily.meanY).toBeLessThan(peony.meanY);
    // 运行时垂枝：整层随爆开进度继续下坠，牡丹/星芒不受重力读法影响。
    expect(lily.groupY).toBeLessThan(peony.groupY);
    expect(star.groupY).toBeCloseTo(peony.groupY, 5);
    // 星芒尖刺：半径长短不齐，牡丹球壳半径近乎等长。
    expect(star.radiusSd).toBeGreaterThan(peony.radiusSd);
    stage.dispose();
  });

  it('多发连环：三枚爆开时刻错峰', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const onsets = ['burst-core-0', 'burst-core-1', 'burst-core-2']
      .map((core) => burstOnset(stage, ctx.root, core));
    for (const onset of onsets) expect(Number.isNaN(onset)).toBe(false);
    // 严格递增：先第一炸，再第二、三枚，绝不同时炸开。
    expect(onsets[0]).toBeLessThan(onsets[1]);
    expect(onsets[1]).toBeLessThan(onsets[2]);
    stage.dispose();
  });

  it('签名因果链：先升空到位，才延时爆开', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const shell = findNode(ctx.root, 'shell-0');
    expect(shell).not.toBeNull();

    stage.update(0.05, 0.05 * DURATION, 'cinematic');
    const low = shell!.position.y;
    stage.update(0.2, 0.2 * DURATION, 'cinematic');
    const high = shell!.position.y;
    // 升空段：弹体上行，且此刻还没炸。
    expect(high).toBeGreaterThan(low);
    expect(opacityOf(ctx.root, 'burst-core-0')).toBeLessThan(0.2);

    stage.update(0.42, 0.42 * DURATION, 'cinematic');
    expect(opacityOf(ctx.root, 'burst-core-0')).toBeGreaterThan(0.2);
    stage.dispose();
  });

  it('互动：残珠雨被连环弹照亮（爆闪时刻更亮）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const ember = findNode(ctx.root, 'ember-rain')?.children[0] ?? null;
    const material = materialOf(ember);
    expect(material).not.toBeNull();
    const luminance = (): number => {
      const color = (material as THREE.MeshBasicMaterial).color;
      return color.r + color.g + color.b;
    };

    const lit = burstOnset(stage, ctx.root, 'burst-core-2');
    stage.update(lit, lit * DURATION, 'cinematic');
    const litLuminance = luminance();
    expect(material!.opacity).toBeGreaterThan(0);

    // 末幕连环弹已熄，只剩残珠自身颜色。
    stage.update(0.97, 0.97 * DURATION, 'cinematic');
    expect(litLuminance).toBeGreaterThan(luminance());
    stage.dispose();
  });

  it('全屏：多落点横跨全域（全库唯一多落点布局）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const xs = ['first-burst', 'chain-burst-1', 'chain-burst-2']
      .map((name) => findNode(ctx.root, name)?.position.x ?? 0);
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(ctx.width * 0.45);

    const sky = findNode(ctx.root, 'night-sky');
    const size = new THREE.Box3().setFromObject(sky!).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThanOrEqual(ctx.width);
    expect(size.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number): string => {
      stage.update(t, t * DURATION, 'cinematic');
      const rows: unknown[] = [];
      ctx.root.traverse((o) => {
        const material = materialOf(o);
        rows.push([
          o.name,
          o.position.toArray().map((n) => Number(n.toFixed(2))),
          o.scale.toArray().map((n) => Number(n.toFixed(3))),
          material ? Number(material.opacity.toFixed(3)) : null,
        ]);
      });
      return JSON.stringify(rows);
    };
    // 0–450 升空 / 450–1450 连爆 / 1450–1950 残珠雨+光雾
    const act1 = snapshot(0.12);
    const act2 = snapshot(0.55);
    const act3 = snapshot(0.93);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('末幕：残珠雨与光雾接管', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.3, 0.3 * DURATION, 'cinematic');
    const hazeAct2 = opacityOf(ctx.root, 'light-haze');
    stage.update(0.95, 0.95 * DURATION, 'cinematic');
    expect(opacityOf(ctx.root, 'light-haze')).toBeGreaterThan(hazeAct2);
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    a.update(0.55, 0.55 * DURATION, 'cinematic');
    b.update(0.55, 0.55 * DURATION, 'medium');

    for (const element of [...SPEC_ELEMENTS, ...FORM_LAYERS]) {
      expect(namedNodes(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(namedNodes(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    const embers = (root: THREE.Object3D): number =>
      namedNodes(root).filter((n) => n.startsWith('ember-') && n !== 'ember-rain').length;
    expect(embers(lo.root)).toBeLessThan(embers(hi.root));
    expect(embers(lo.root)).toBeGreaterThan(0);
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点，且幂等', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => stage.update(0.5, 975, 'cinematic')).not.toThrow();
  });
});
