/**
 * 场景 10 ice 实现验收（设计规格 §4.2 场景 10）。
 *
 * 结构照标杆用例 cg-scene-black-hole.test.ts：八元素齐备、三幕推进、
 * 全屏覆盖、多元素互动、独立签名、资源释放。
 * 额外验收「漫天雪」规模：雪粒数量必须够铺满全屏，不是稀疏几片。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStageContext } from '../overlay/cg-scene';

/** 场景总时长（ms），三幕断言用它把归一化进度换回毫秒。 */
const DURATION = 1200;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#9FE8FF'),
    energy: 1.3,
    direction: new THREE.Vector2(1, 0),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

/** 递归收集具名节点，用于按规格元素逐条核查。 */
function namedNodes(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => { if (o.name) names.push(o.name); });
  return names;
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (o.name === name && hit === null) hit = o; });
  return hit;
}

/** 取某层雪幕当帧的顶点坐标副本（雪粒以 Points 承载，逐粒可寻址）。 */
function flakeArray(root: THREE.Object3D, layer: string): Float32Array {
  const points = findByName(root, layer) as THREE.Points | null;
  const attr = points?.geometry.getAttribute('position');
  return attr ? Float32Array.from(attr.array as ArrayLike<number>) : new Float32Array();
}

function flakeCount(root: THREE.Object3D, layer: string): number {
  return flakeArray(root, layer).length / 3;
}

/** 顶点坐标的跨度，用于验证雪幕铺满全屏。 */
function span(points: Float32Array): { x: number; y: number } {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]); maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: maxX - minX, y: maxY - minY };
}

/**
 * 按「距爆心远近」分组统计雪粒位移**方向偏离风向的角度**。
 *
 * 不用总位移当涡旋证据：横风位移（两帧间约 300px）比旋转弧长大一个数量级，
 * 总位移里读不出涡旋。涡旋真正改变的是**流向**——近爆心的雪片被拽着拐弯，
 * 远处仍顺风直走。参考风向取自涡旋半径外的粒子，即雪幕本身的平流方向。
 *
 * @param wrapGuard 跨度超过此值视为环绕重入，剔除
 */
function swirlByRadius(
  before: Float32Array, after: Float32Array,
  innerR: number, outerR: number, wrapGuard: number,
  centerX: number, centerY: number,
): { inner: number; outer: number } {
  // 参考风向：涡旋区外粒子的平均位移方向。
  let refX = 0; let refY = 0; let refN = 0;
  for (let i = 0; i < before.length; i += 3) {
    const r = Math.hypot(before[i] - centerX, before[i + 1] - centerY);
    const dx = after[i] - before[i]; const dy = after[i + 1] - before[i + 1];
    if (Math.hypot(dx, dy) > wrapGuard) continue;
    if (r > outerR) { refX += dx; refY += dy; refN += 1; }
  }
  if (refN === 0) return { inner: 0, outer: 0 };
  const refAngle = Math.atan2(refY / refN, refX / refN);

  let innerSum = 0; let innerN = 0; let outerSum = 0; let outerN = 0;
  for (let i = 0; i < before.length; i += 3) {
    const r = Math.hypot(before[i] - centerX, before[i + 1] - centerY);
    const dx = after[i] - before[i]; const dy = after[i + 1] - before[i + 1];
    const d = Math.hypot(dx, dy);
    if (d > wrapGuard || d < 1e-6) continue;
    // 夹角取绝对值并折到 [0, π]，顺逆时针都算偏离。
    let deviation = Math.abs(Math.atan2(dy, dx) - refAngle);
    if (deviation > Math.PI) deviation = Math.PI * 2 - deviation;
    if (r < innerR) { innerSum += deviation; innerN += 1; }
    else if (r > outerR) { outerSum += deviation; outerN += 1; }
  }
  return {
    inner: innerN > 0 ? innerSum / innerN : 0,
    outer: outerN > 0 ? outerSum / outerN : 0,
  };
}

/** 冰棱是否已落地：以冰裂纹平面（地面）自身高度为基准线，不写死常量。 */
function landedIcicles(root: THREE.Object3D, tolerance: number): number {
  const cracks = findByName(root, 'ice-cracks');
  const shards = findByName(root, 'icicle-shards');
  if (!cracks || !shards) return 0;
  let landed = 0;
  for (const shard of shards.children) {
    if (shard.position.y <= cracks.position.y + tolerance) landed += 1;
  }
  return landed;
}

function crackSpread(root: THREE.Object3D): number {
  const cracks = findByName(root, 'ice-cracks') as THREE.Mesh | null;
  const material = cracks?.material;
  if (!material || Array.isArray(material)) return -1;
  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  return typeof uniforms?.uSpread?.value === 'number' ? uniforms.uSpread.value : -1;
}

/** 规格 §4.2 场景 10 的八元素；雪幕两层单独点名，因为它就是本场景签名。 */
const REQUIRED_ELEMENTS = [
  'snow-veil', 'snow-veil-near', 'snow-veil-far',
  'wind-shear', 'cold-fog', 'crystal-siphon',
  'ice-cracks', 'frost-flash', 'icicle-shards', 'aurora-band',
];

const scene = resolveScene('ice');

describe('场景 10 ice', () => {
  it('已注册且签名声明两层视差雪幕与冰裂纹扩散', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.signature).toContain('视差');
    expect(scene!.config.signature).toContain('裂纹');
    expect(scene!.config.preset).toBe('shatter-ice');
  });

  it('八个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const names = namedNodes(ctx.root).join('|');
    for (const element of REQUIRED_ELEMENTS) {
      expect(names, `缺元素 ${element}`).toContain(element);
    }
    stage.dispose();
  });

  it('漫天规模：电影级雪粒过三千，且铺满全屏', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const near = flakeCount(ctx.root, 'snow-veil-near');
    const far = flakeCount(ctx.root, 'snow-veil-far');
    // 「漫天飘雪」的下限：远近两层合计达千级，稀疏几十片不算暴雪。
    expect(near).toBeGreaterThan(800);
    expect(far).toBeGreaterThan(1600);
    expect(near + far).toBeGreaterThan(3000);

    stage.update(0.45, 0.45 * DURATION, 'cinematic');
    for (const layer of ['snow-veil-near', 'snow-veil-far']) {
      const s = span(flakeArray(ctx.root, layer));
      expect(s.x, `${layer} 横向未铺满`).toBeGreaterThanOrEqual(ctx.width);
      expect(s.y, `${layer} 纵向未铺满`).toBeGreaterThanOrEqual(ctx.height);
    }
    stage.dispose();
  });

  it('寒雾在主幕覆盖全屏且分层', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.45, 0.45 * DURATION, 'cinematic');
    const fog = findByName(ctx.root, 'cold-fog');
    expect(fog).not.toBeNull();
    // 体积感来自多层错位漂移，单层雾只是一块贴图。
    expect(fog!.children.length).toBeGreaterThanOrEqual(2);
    const size = new THREE.Box3().setFromObject(fog!).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThanOrEqual(ctx.width);
    expect(size.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      stage.update(t, t * DURATION, 'cinematic');
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
    // 0–250 风暴蓄势 / 250–800 冰晶炸裂 / 800–1200 寒雾收拢
    const act1 = snapshot(0.12);
    const act2 = snapshot(0.5);
    const act3 = snapshot(0.93);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('第一幕雪幕从屏幕两侧压入，主幕才铺满中央', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const veil = findByName(ctx.root, 'snow-veil');
    expect(veil).not.toBeNull();

    // 「从两侧压入」的可观测特征是**中央留空、雪堆在屏缘**，
    // 因此这里直接统计雪粒的横向分布，而不是看整层的 scale。
    // 整层 scale 变大意味着「从中心向外扩张」，与两侧压入正好相反；
    // 且用 scale 压缩会连带把粒子间距一起压扁（密度虚高、屏缘反而无雪）。
    const centerRatio = (): number => {
      const layer = findByName(ctx.root, 'snow-veil-near') as THREE.Points | null;
      expect(layer).not.toBeNull();
      const world = new THREE.Vector3();
      const arr = layer!.geometry.getAttribute('position').array as ArrayLike<number>;
      const half = ctx.width * 1.35 * 0.5;
      let center = 0;
      const total = arr.length / 3;
      for (let i = 0; i < arr.length; i += 3) {
        world.set(arr[i], arr[i + 1], arr[i + 2]);
        layer!.localToWorld(world);
        if (Math.abs(world.x) < half * 0.3) center += 1;
      }
      return center / total;
    };

    stage.update(0.02, 0.02 * DURATION, 'cinematic');
    const pressingIn = centerRatio();
    // 蓄势幕：两道雪墙贴着左右屏缘，中央基本是空的。
    expect(pressingIn).toBeLessThan(0.05);
    stage.update(0.5, 0.5 * DURATION, 'cinematic');
    // 主幕：前沿推进到满幅风刀，中央被雪填上。
    expect(centerRatio()).toBeGreaterThan(pressingIn + 0.15);
    stage.dispose();
  });

  it('冰晶虹吸在第二幕生长后被风卷起', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const siphon = findByName(ctx.root, 'crystal-siphon');
    expect(siphon).not.toBeNull();
    stage.update(0.1, 0.1 * DURATION, 'cinematic');
    const seeded = siphon!.scale.y;
    stage.update(0.55, 0.55 * DURATION, 'cinematic');
    const grown = siphon!.scale.y;
    const liftedAt = siphon!.position.y;
    stage.update(0.95, 0.95 * DURATION, 'cinematic');
    expect(grown).toBeGreaterThan(seeded);
    // 被风卷起：主幕末到尾幕持续抬升，不是原地缩放。
    expect(siphon!.position.y).toBeGreaterThan(liftedAt);
    stage.dispose();
  });

  it('霜白闪光在冰晶炸裂瞬间脉冲，蓄势幕不亮', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const flash = findByName(ctx.root, 'frost-flash') as THREE.Mesh | null;
    expect(flash).not.toBeNull();
    stage.update(0.1, 0.1 * DURATION, 'cinematic');
    const beforeBurst = (flash!.material as THREE.Material).opacity;
    stage.update(0.24, 0.24 * DURATION, 'cinematic');
    const atBurst = (flash!.material as THREE.Material).opacity;
    expect(atBurst).toBeGreaterThan(beforeBurst);
    stage.dispose();
  });

  it('互动一：冰晶炸开扰动雪幕形成涡旋（近爆心流向被拽偏，远处顺风直走）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 同一时刻取不到「无涡旋」对照，改测空间差异：涡旋是局部力场，
    // 近爆心雪片的流向被拽离风向，远处不受影响。
    stage.update(0.32, 0.32 * DURATION, 'cinematic');
    const before = flakeArray(ctx.root, 'snow-veil-near');
    stage.update(0.4, 0.4 * DURATION, 'cinematic');
    const after = flakeArray(ctx.root, 'snow-veil-near');
    expect(before.length).toBeGreaterThan(0);

    const short = Math.min(ctx.width, ctx.height);
    // 爆心从场景树取（虹吸层就在爆点），不在测试里复制坐标常量——
    // 实现挪动爆点时测试跟着走，而不是悄悄测错位置。
    const siphon = findByName(ctx.root, 'crystal-siphon')!;
    const { inner, outer } = swirlByRadius(
      before, after, short * 0.3, short * 0.62, short * 0.5,
      siphon.position.x, siphon.position.y,
    );
    // 近爆心偏离至少 0.2rad（约 11°）才看得出在打旋。
    expect(inner).toBeGreaterThan(0.2);
    // 远处必须基本顺风，否则「局部」不成立——是整片雪幕在转。
    expect(outer).toBeLessThan(0.1);
    expect(inner).toBeGreaterThan(outer * 3);
    stage.dispose();
  });

  it('互动二：冰裂纹扩展与冰棱落地同步', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const tolerance = Math.min(ctx.width, ctx.height) * 0.04;

    stage.update(0.3, 0.3 * DURATION, 'cinematic');
    const earlySpread = crackSpread(ctx.root);
    const earlyLanded = landedIcicles(ctx.root, tolerance);
    // 晚点取在第三幕：冰棱在第二幕陆续释放，飞完约 1000px 的落差后
    // 落地必然发生在第三幕。取样点必须落在落地真实发生的区间，
    // 否则测的是「还在空中」而非同步关系。
    stage.update(0.95, 0.95 * DURATION, 'cinematic');
    const lateSpread = crackSpread(ctx.root);
    const lateLanded = landedIcicles(ctx.root, tolerance);

    expect(earlySpread).toBeGreaterThanOrEqual(0);
    // 同步 = 两条曲线同向推进：落地数增长时裂纹也在扩展。
    expect(lateLanded).toBeGreaterThan(earlyLanded);
    expect(lateSpread).toBeGreaterThan(earlySpread);
    stage.dispose();
  });

  it('独立签名：两层雪幕视差 + 风力切变随时间扫掠', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.35, 0.35 * DURATION, 'cinematic');
    const nearBefore = flakeArray(ctx.root, 'snow-veil-near');
    const farBefore = flakeArray(ctx.root, 'snow-veil-far');
    stage.update(0.45, 0.45 * DURATION, 'cinematic');
    const nearAfter = flakeArray(ctx.root, 'snow-veil-near');
    const farAfter = flakeArray(ctx.root, 'snow-veil-far');

    const meanShift = (a: Float32Array, b: Float32Array, guard: number) => {
      let sum = 0; let n = 0;
      for (let i = 0; i < a.length; i += 3) {
        const d = Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1]);
        if (d > guard) continue;
        sum += d; n += 1;
      }
      return n > 0 ? sum / n : 0;
    };
    const guard = Math.min(ctx.width, ctx.height) * 0.5;
    // 视差的定义：近景层比远景层跑得快，两层不是同一套运动。
    expect(meanShift(nearBefore, nearAfter, guard))
      .toBeGreaterThan(meanShift(farBefore, farAfter, guard) * 1.4);

    // 风力切变随时间扫掠：方向指示器的朝向在推进中改变。
    const shear = findByName(ctx.root, 'wind-shear');
    expect(shear).not.toBeNull();
    stage.update(0.3, 0.3 * DURATION, 'cinematic');
    const earlyAngle = shear!.rotation.z;
    stage.update(0.75, 0.75 * DURATION, 'cinematic');
    expect(shear!.rotation.z).not.toBeCloseTo(earlyAngle, 3);
    stage.dispose();
  });

  it('极光带在远处微光层，位于雪幕之后', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const aurora = findByName(ctx.root, 'aurora-band');
    const near = findByName(ctx.root, 'snow-veil-near');
    expect(aurora).not.toBeNull();
    expect(aurora!.position.z).toBeLessThan(near!.position.z);
    stage.dispose();
  });

  it('低档位缩减雪量但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    a.update(0.5, 600, 'cinematic');
    b.update(0.5, 600, 'medium');

    for (const element of REQUIRED_ELEMENTS) {
      expect(namedNodes(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(namedNodes(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    for (const layer of ['snow-veil-near', 'snow-veil-far']) {
      expect(flakeCount(lo.root, layer)).toBeLessThan(flakeCount(hi.root, layer));
      expect(flakeCount(lo.root, layer), `${layer} 在 medium 档消失`).toBeGreaterThan(0);
    }
    // 冰棱刚体按档减半，但不能一根不剩。
    const shardCount = (root: THREE.Object3D) =>
      findByName(root, 'icicle-shards')?.children.length ?? 0;
    expect(shardCount(lo.root)).toBeLessThan(shardCount(hi.root));
    expect(shardCount(lo.root)).toBeGreaterThan(0);

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

  it('dispose 幂等，且之后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.dispose();
    expect(() => stage.dispose()).not.toThrow();
    expect(() => stage.update(0.5, 600, 'cinematic')).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });
});
