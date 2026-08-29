/**
 * 场景 28 bomb 实现验收（设计规格 §4.2 场景 28）。
 *
 * 断言按规格逐条对应：9 个元素齐备、三幕时间轴、全屏覆盖、
 * 三条多元素互动、独立签名（四层同爆）、碎片刚体物理、资源释放。
 * 结构照标杆用例 cg-scene-black-hole.test.ts。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';

/** 规格时长，三幕边界 300 / 750ms 都以它为分母。 */
const DURATION = 1200;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#FF5A1F'),
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

function find(root: THREE.Object3D, name: string): THREE.Object3D {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (o.name === name) hit = o; });
  if (!hit) throw new Error(`场景缺少节点 ${name}`);
  return hit;
}

/** 取单材质节点的不透明度；非 mesh 或多材质返回 0。 */
function opacityOf(node: THREE.Object3D): number {
  const material = (node as THREE.Mesh).material;
  if (!material || Array.isArray(material)) return 0;
  return (material as THREE.Material).opacity;
}

/** 组内子节点的最大不透明度，用于判断「这一层是否活跃」。 */
function layerOpacity(node: THREE.Object3D): number {
  let peak = opacityOf(node);
  node.traverse((o) => { peak = Math.max(peak, opacityOf(o)); });
  return peak;
}

/** 按归一化进度推进一帧。 */
function step(stage: CgStage, t: number): void {
  stage.update(t, t * DURATION, 'cinematic');
}

/** 以固定小步长把场景推进到 t，让刚体积分出真实轨迹。 */
function runTo(stage: CgStage, t: number, frames = 60): void {
  for (let i = 1; i <= frames; i += 1) step(stage, (t * i) / frames);
}

const scene = resolveScene('bomb');

/** 规格 §4.2 场景 28 的九元素，实现里以 name 标注便于验收。 */
const SPEC_ELEMENTS = [
  'fuse-spark', 'fireball', 'shockwave', 'mushroom-cloud', 'shrapnel',
  'blast-flash', 'pressure-warp', 'ash-rain', 'scorch-ring',
];

describe('场景 28 bomb', () => {
  it('已注册且签名声明四层同爆机制', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('explode');
    expect(scene!.config.signature).toContain('四层同爆');
  });

  it('9 个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const names = namedNodes(ctx.root).join('|');
    for (const element of SPEC_ELEMENTS) {
      expect(names, `缺元素 ${element}`).toContain(element);
    }
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 遍历整棵树而非只看顶层：状态变化都落在子节点的位置/缩放/透明度上。
    const snapshot = (t: number) => {
      step(stage, t);
      const rows: unknown[] = [];
      ctx.root.traverse((o) => {
        rows.push([
          o.name,
          o.position.toArray().map((n) => Number(n.toFixed(2))),
          o.scale.toArray().map((n) => Number(n.toFixed(3))),
          Number(opacityOf(o).toFixed(3)),
        ]);
      });
      return JSON.stringify(rows);
    };
    // 0–300 引信 / 300–750 四层同爆 / 750–1200 蘑菇云+灰烬
    const act1 = snapshot(0.15);
    const act2 = snapshot(0.5);
    const act3 = snapshot(0.9);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('独立签名：第二幕火/波/烟/片四层同时活跃，第一幕只有引信', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);

    step(stage, 0.15);
    expect(opacityOf(find(ctx.root, 'fuse-spark'))).toBeGreaterThan(0);
    // 引信幕里爆炸四层都还没起来，"同爆"才是第二幕独有的事件。
    expect(opacityOf(find(ctx.root, 'fireball'))).toBeLessThan(0.02);
    expect(opacityOf(find(ctx.root, 'shockwave'))).toBeLessThan(0.02);

    runTo(stage, 0.5);
    for (const layer of ['fireball', 'shockwave', 'mushroom-cloud', 'shrapnel']) {
      expect(layerOpacity(find(ctx.root, layer)), `${layer} 未参与同爆`).toBeGreaterThan(0);
    }
    stage.dispose();
  });

  it('全屏覆盖：冲击波触达四缘、蘑菇云占上半屏、灰烬雨铺满全屏', () => {
    const ctx = makeCtx({ width: 1920, height: 1080 });
    const stage = scene!.create(ctx);
    runTo(stage, 0.62);

    const wave = new THREE.Box3().setFromObject(find(ctx.root, 'shockwave'));
    const waveSize = wave.getSize(new THREE.Vector3());
    // 触达四缘：横竖都要盖过屏幕范围。
    expect(waveSize.x).toBeGreaterThanOrEqual(ctx.width);
    expect(waveSize.y).toBeGreaterThanOrEqual(ctx.height);

    runTo(stage, 0.95);
    const cloud = new THREE.Box3().setFromObject(find(ctx.root, 'mushroom-cloud'));
    const cloudSize = cloud.getSize(new THREE.Vector3());
    expect(cloudSize.x).toBeGreaterThan(ctx.width * 0.5);
    expect(cloudSize.y).toBeGreaterThan(ctx.height * 0.3);
    // 占「上」半屏：云体重心在爆心之上。
    expect(cloud.getCenter(new THREE.Vector3()).y).toBeGreaterThan(0);

    const ash = new THREE.Box3().setFromObject(find(ctx.root, 'ash-rain'));
    const ashSize = ash.getSize(new THREE.Vector3());
    expect(ashSize.x).toBeGreaterThan(ctx.width * 0.85);
    expect(ashSize.y).toBeGreaterThan(ctx.height * 0.7);
    stage.dispose();
  });

  it('互动①：冲击波赶上火球后把火球压扁', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const fireball = find(ctx.root, 'fireball');
    const wave = find(ctx.root, 'shockwave');

    // 刚爆开时波还在火球内部，火球应保持浑圆。
    runTo(stage, 0.34, 12);
    const waveEarly = wave.scale.x;
    const roundness = fireball.scale.y / fireball.scale.x;
    expect(roundness).toBeGreaterThan(0.9);

    // 波跑得比火球快，追过之后火球被压成扁球。
    runTo(stage, 0.6, 24);
    expect(wave.scale.x).toBeGreaterThan(waveEarly);
    expect(fireball.scale.y / fireball.scale.x).toBeLessThan(roundness * 0.85);
    stage.dispose();
  });

  it('互动②：碎片穿过浓烟时在烟体上留下烟隙，数量与几何真值一致', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    runTo(stage, 0.7);

    const cloud = find(ctx.root, 'mushroom-cloud') as THREE.Mesh;
    const material = cloud.material as THREE.ShaderMaterial;
    expect(material.uniforms.uGaps, '烟体缺少烟隙 uniform').toBeDefined();

    // 由碎片实际位置独立算一遍「穿烟数」，必须与 shader 拿到的值吻合，
    // 否则烟隙只是装饰而非真互动。
    const box = new THREE.Box3().setFromObject(cloud);
    let crossing = 0;
    find(ctx.root, 'shrapnel').traverse((o) => {
      if (!o.name.startsWith('shrapnel-')) return;
      const p = o.getWorldPosition(new THREE.Vector3());
      if (box.containsPoint(p)) crossing += 1;
    });
    expect(crossing, '第二幕末应有碎片正穿过烟体').toBeGreaterThan(0);
    expect(material.uniforms.uGaps.value).toBe(crossing);
    stage.dispose();
  });

  it('互动③：灰烬雨从蘑菇云顶落下，云升则落点上移', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const ashTop = () => {
      let top = -Infinity;
      find(ctx.root, 'ash-rain').traverse((o) => {
        if (o.name.startsWith('ash-')) top = Math.max(top, o.position.y);
      });
      return top;
    };
    const cloudTop = () => new THREE.Box3().setFromObject(find(ctx.root, 'mushroom-cloud')).max.y;

    runTo(stage, 0.8);
    const earlyAsh = ashTop();
    const earlyCloud = cloudTop();
    runTo(stage, 1, 20);
    // 云顶随第三幕升腾抬高，灰烬的出发线必须跟着抬高。
    expect(cloudTop()).toBeGreaterThan(earlyCloud);
    expect(ashTop()).toBeGreaterThan(earlyAsh);
    stage.dispose();
  });

  it('碎片受重力下落并在焦圈所在地面反弹，不穿透', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const groundY = find(ctx.root, 'scorch-ring').position.y;
    const pieces: THREE.Object3D[] = [];
    find(ctx.root, 'shrapnel').traverse((o) => {
      if (o.name.startsWith('shrapnel-')) pieces.push(o);
    });
    expect(pieces.length).toBeGreaterThan(0);

    const history = pieces.map(() => [] as number[]);
    for (let i = 1; i <= 90; i += 1) {
      step(stage, i / 90);
      pieces.forEach((p, idx) => history[idx].push(p.position.y));
    }

    // 重力：整体末态低于爆心。
    const settled = pieces.filter((p) => p.position.y < 0).length;
    expect(settled).toBeGreaterThan(pieces.length * 0.5);
    // 不穿透地面。
    for (const ys of history) {
      expect(Math.min(...ys)).toBeGreaterThan(groundY - 2);
    }
    // 反弹：至少一片先降后升（触地回跳）。
    const bounced = history.some((ys) => {
      let low = Infinity;
      let fell = false;
      for (const y of ys) {
        if (y < low) { low = y; fell = true; }
        else if (fell && y > low + 4) return true;
      }
      return false;
    });
    expect(bounced, '碎片应有触地反弹').toBe(true);
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    runTo(a, 0.6, 20);
    b.update(0.6, 720, 'medium');

    for (const element of SPEC_ELEMENTS) {
      expect(namedNodes(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(namedNodes(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    const countOf = (root: THREE.Object3D, prefix: string) =>
      namedNodes(root).filter((n) => n.startsWith(prefix)).length;
    for (const prefix of ['shrapnel-', 'ash-']) {
      expect(countOf(lo.root, prefix), `${prefix} 低档应更稀疏`).toBeLessThan(countOf(hi.root, prefix));
      expect(countOf(lo.root, prefix), `${prefix} 低档不得归零`).toBeGreaterThan(0);
    }
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等，dispose 后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => step(stage, 0.5)).not.toThrow();
  });
});
