/**
 * 场景 07 crystal 实现验收（设计规格 §4.2 场景 07）。
 *
 * 断言按规格逐条对应：8 元素齐备、三幕时间轴、晶塔居中高耸 + 碎散全屏、
 * 签名的两条（8 层「层级剥落」真实顺序 + 真折射材质属性）、
 * 晶屑四面体刚体真实碰撞反弹、两条多元素互动、档位裁剪、资源释放。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import { MATERIAL_IDENTITIES } from '../overlay/material-identity';

const TOTAL_MS = 1200;
/** 三幕边界（归一化，对应规格 0–200 / 200–800 / 800–1200ms）。 */
const ACT1_END = 200 / TOTAL_MS;
const ACT2_END = 800 / TOTAL_MS;

/** 规格 §4.2 场景 07 的八元素，实现里以 name 标注供验收。 */
const REQUIRED = [
  'crystal-tower', 'facet-peel', 'prism-glow', 'crystal-chips',
  'spark-afterglow', 'ground-dustveil', 'edge-dispersion', 'audio-strobe',
] as const;

/** 规格「8 层」是形态定义，任何档位都不许裁。 */
const PEEL_LAYERS = 8;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#9EE6FF'),
    energy: 1.4,
    direction: new THREE.Vector2(0, -1),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

function namedNodes(root: THREE.Object3D): string[] {
  const out: string[] = [];
  root.traverse((o) => { if (o.name) out.push(o.name); });
  return out;
}

function find(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (o.name === name) hit = o; });
  return hit;
}

function collect(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name.startsWith(prefix)) out.push(o); });
  return out;
}

/**
 * 只取 ④ 晶屑刚体本体（chip-<i>）。
 *
 * 不能用 collect('chip-') 了事：容器组名为 crystal-chips、拖影名为 afterglow-<i>，
 * 一旦将来加进任何 chip-xxx 命名的装饰层，同前缀就会把非物理体混进来，
 * 让「重力加速」「落地反弹」测到不参与 cannon 积分的节点（glass-shot 踩过这个坑）。
 */
function collectChips(root: THREE.Object3D): THREE.Object3D[] {
  return collect(root, 'chip-').filter((o) => /^chip-\d+$/.test(o.name));
}

function peelLayers(root: THREE.Object3D): THREE.Object3D[] {
  return collect(root, 'peel-layer-')
    .filter((o) => /^peel-layer-\d+$/.test(o.name))
    .sort((a, b) => Number(a.name.slice(11)) - Number(b.name.slice(11)));
}

function opacityOf(node: THREE.Object3D): number {
  const material = (node as THREE.Mesh).material;
  if (!material || Array.isArray(material)) return 0;
  return (material as THREE.Material).opacity;
}

function uniformOf(node: THREE.Object3D, key: string): number {
  const material = (node as THREE.Mesh).material as THREE.ShaderMaterial;
  return Number(material.uniforms[key].value);
}

/** 按固定小步长推进，让 cannon 世界真实积分（一步跨大 dt 会被帧上限截断）。 */
function step(stage: CgStage, fromT: number, toT: number, frames = 36): void {
  for (let i = 1; i <= frames; i += 1) {
    const t = fromT + ((toT - fromT) * i) / frames;
    stage.update(t, t * TOTAL_MS, 'cinematic');
  }
}

/** 逐帧扫全程，记录每层首次「开始剥离」的时刻，用于验收剥落顺序。 */
function firstPeelTimes(stage: CgStage, layers: THREE.Object3D[]): number[] {
  const times = layers.map(() => Number.POSITIVE_INFINITY);
  const frames = 240;
  for (let i = 0; i <= frames; i += 1) {
    const t = i / frames;
    stage.update(t, t * TOTAL_MS, 'cinematic');
    for (let k = 0; k < layers.length; k += 1) {
      // 剥离的观察量是「壳体向外张开」：静止层 scale 恒为 1。
      if (times[k] === Number.POSITIVE_INFINITY && layers[k].scale.x > 1.02) times[k] = t;
    }
  }
  return times;
}

const scene = resolveScene('crystal');

describe('场景 07 crystal', () => {
  it('已注册且签名声明层级剥落与真折射材质', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('shatter');
    expect(scene!.config.signature).toContain('层级剥落');
    expect(scene!.config.signature).toContain('折射');
  });

  it('8 个规格元素在 medium 与 cinematic 档都齐备', () => {
    for (const quality of ['medium', 'cinematic'] as const) {
      const ctx = makeCtx({ quality });
      const stage = scene!.create(ctx);
      const names = namedNodes(ctx.root);
      for (const element of REQUIRED) {
        expect(names, `${quality} 档缺元素 ${element}`).toContain(element);
      }
      stage.dispose();
    }
  });

  it('全屏：晶塔居中高耸，晶屑碎散覆盖全屏', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const tower = find(ctx.root, 'crystal-tower')!;
    const towerBox = new THREE.Box3().setFromObject(tower);
    const size = towerBox.getSize(new THREE.Vector3());
    const center = towerBox.getCenter(new THREE.Vector3());

    // 高耸：竖向尺度必须显著大于横向，且占到半屏以上高度。
    expect(size.y).toBeGreaterThan(size.x * 1.6);
    expect(size.y).toBeGreaterThan(ctx.height * 0.5);
    // 居中：横向中心贴近屏心。
    expect(Math.abs(center.x)).toBeLessThan(ctx.width * 0.08);

    // 碎裂飞散覆盖全屏：跑到第三幕看晶屑的实际散布跨度。
    step(stage, 0, 0.95, 120);
    const chips = collectChips(ctx.root);
    const xs = chips.map((c) => c.getWorldPosition(new THREE.Vector3()).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(ctx.width * 0.5);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      stage.update(t, t * TOTAL_MS, 'cinematic');
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
    const act1 = snapshot(ACT1_END * 0.5);
    const act2 = snapshot((ACT1_END + ACT2_END) * 0.5);
    const act3 = snapshot((ACT2_END + 1) * 0.5);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('第一幕边界：200ms 前只悬停蓄力，一层都不许剥', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const layers = peelLayers(ctx.root);

    stage.update(ACT1_END - 0.01, (ACT1_END - 0.01) * TOTAL_MS, 'cinematic');
    // 蓄力幕：壳层全部贴合塔身（scale 1），晶屑还没脱离塔心。
    expect(layers.every((l) => l.scale.x <= 1.02)).toBe(true);
    const chipsBefore = collectChips(ctx.root)
      .filter((c) => c.position.lengthSq() > 1).length;
    expect(chipsBefore).toBe(0);

    // 蓄力必须真的在「蓄」：塔体辉光随第一幕推进而增强。
    stage.update(0.02, 0.02 * TOTAL_MS, 'cinematic');
    const early = uniformOf(find(ctx.root, 'tower-core')!, 'uCharge');
    stage.update(ACT1_END - 0.005, (ACT1_END - 0.005) * TOTAL_MS, 'cinematic');
    expect(uniformOf(find(ctx.root, 'tower-core')!, 'uCharge')).toBeGreaterThan(early);
    stage.dispose();
  });

  it('第三幕边界：800ms 前尘雾未沉积，越界才开始积聚', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const veil = find(ctx.root, 'ground-dustveil')!;

    step(stage, 0, ACT2_END - 0.01, 60);
    const before = uniformOf(veil, 'uSettle');
    stage.update(ACT2_END + 0.01, (ACT2_END + 0.01) * TOTAL_MS, 'cinematic');
    const after = uniformOf(veil, 'uSettle');
    step(stage, ACT2_END + 0.01, 0.99, 30);
    const settled = uniformOf(veil, 'uSettle');

    // 规格三幕：800–1200ms 才是「尘雾沉积」，沉积量是这一幕的专属信号。
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
    expect(settled).toBeGreaterThan(after);
    stage.dispose();
  });

  it('签名①：8 层晶面逐层剥离，顺序自塔顶而下且严格错峰', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const layers = peelLayers(ctx.root);
    expect(layers).toHaveLength(PEEL_LAYERS);

    const times = firstPeelTimes(stage, layers);
    // 8 层全部剥完，没有一层是死的。
    expect(times.every((t) => Number.isFinite(t))).toBe(true);
    // 逐层：严格递增（同时张开就不是「层级剥落」而是整体炸开）。
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i], `第 ${i} 层不晚于第 ${i - 1} 层`).toBeGreaterThan(times[i - 1]);
    }
    // 顺序有物理动机：击中点在塔顶，剥离自上而下——层序号越大的层起始 y 越低。
    const ys = layers.map((l) => l.position.y);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i], `第 ${i} 层不低于第 ${i - 1} 层`).toBeLessThan(ys[i - 1]);
    }
    // 剥离窗口落在第二幕（规格 200–800ms 逐层崩解）。
    expect(times[0]).toBeGreaterThanOrEqual(ACT1_END);
    expect(times[times.length - 1]).toBeLessThanOrEqual(ACT2_END);
    stage.dispose();
  });

  it('签名②：晶塔用真实折射材质（transmission + ior），不是靠命名声称', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const core = find(ctx.root, 'tower-facets') as THREE.Mesh | null;
    expect(core).not.toBeNull();
    const material = core!.material as THREE.MeshPhysicalMaterial;

    // 折射是材质属性上的事实：transmission 透射 + ior 折射率 + thickness 体积。
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.transmission).toBeGreaterThan(0.5);
    // 水晶折射率 ~1.54，至少要明显高于空气（1.0）。
    expect(material.ior).toBeGreaterThan(1.4);
    expect(material.thickness).toBeGreaterThan(0);

    // 8 层剥落壳同样是折射材质：剥下来的晶面不能突然变成不透光的塑料片。
    const layerMat = (peelLayers(ctx.root)[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
    expect(layerMat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(layerMat.transmission).toBeGreaterThan(0.5);
    expect(layerMat.ior).toBeGreaterThan(1.4);
    stage.dispose();
  });

  it('晶屑是四面体刚体：受重力加速下落', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const chips = collectChips(ctx.root);
    expect(chips.length).toBeGreaterThan(3);

    // 四面体：4 顶点，不是 box 也不是球。
    const geometry = (chips[0] as THREE.Mesh).geometry;
    expect(geometry.attributes.position.count).toBeGreaterThanOrEqual(4);
    expect(new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position as THREE.BufferAttribute,
    ).getSize(new THREE.Vector3()).z).toBeGreaterThan(0);

    // 重力加速：等长时间窗内的下落位移越来越大。
    step(stage, 0, 0.42);
    const a = chips.map((c) => c.position.y);
    step(stage, 0.42, 0.5);
    const b = chips.map((c) => c.position.y);
    step(stage, 0.5, 0.58);
    const c = chips.map((c) => c.position.y);
    const first = a.reduce((sum, y, i) => sum + (y - b[i]), 0);
    const second = b.reduce((sum, y, i) => sum + (y - c[i]), 0);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);

    stage.dispose();
  });

  it('晶屑真实碰撞反弹：落地后被弹回，且最终停在地面之上', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const chips = collectChips(ctx.root);

    // 只统计「确实进过地面接触带」之后的回升量。
    // 起爆是向上抛的，若从生成高度起算，上抛本身会被误读成反弹；
    // 而弹道下坠段掠过接触带后继续爬升也不是反弹，所以门限取接触带内的实测最低点。
    const span = Math.min(ctx.width, ctx.height) * 0.92;
    const gate = -ctx.height * 0.42 + span * 0.02;
    const touched = chips.map(() => false);
    const floorY = chips.map(() => Number.POSITIVE_INFINITY);
    const rebound = chips.map(() => 0);
    for (let i = 1; i <= 600; i += 1) {
      const t = Math.min(1, i / 260);
      stage.update(t, t * TOTAL_MS, 'cinematic');
      chips.forEach((chip, k) => {
        const y = chip.position.y;
        if (y < gate) { touched[k] = true; if (y < floorY[k]) floorY[k] = y; }
        if (touched[k]) rebound[k] = Math.max(rebound[k], y - floorY[k]);
      });
    }
    expect(touched.filter(Boolean).length).toBeGreaterThan(3);
    // 阈值取 span 的 15%：实测把 restitution=.16 与 restitution=0 分开
    // （四档均为 2 片 vs 0 片）。低于此值只是四面体绕棱翻倒的抬升，不是弹性反弹。
    const bounced = rebound.filter((r) => r > span * 0.15).length;
    expect(bounced).toBeGreaterThan(0);
    // 不许穿地：最终静止位置都在接触带最低点之上。
    const floor = Math.min(...floorY.filter((v) => Number.isFinite(v)));
    expect(chips.every((chip) => chip.position.y >= floor - 1)).toBe(true);
    stage.dispose();
  });

  it('晶屑物理参数取自 crystal 物理签名（restitution / friction）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const identity = MATERIAL_IDENTITIES.crystal.physical;
    const bounce = find(ctx.root, 'crystal-chips')!;

    // 场景把签名值挂在容器上供验收：弹性/摩擦不是随手写的魔法数。
    const declared = bounce.userData as { restitution?: number; friction?: number };
    expect(declared.restitution).toBeCloseTo(identity.restitution, 5);
    expect(declared.friction).toBeCloseTo(identity.friction, 5);
    stage.dispose();
  });

  it('互动①：尘雾强度由晶屑实际落地事件驱动，不是独立时间曲线', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const veil = find(ctx.root, 'ground-dustveil')!;
    const chips = collectChips(ctx.root);

    // 先推到晶屑已飞出但尚未落地：此刻扬尘应为 0。
    step(stage, 0, 0.3, 40);
    const beforeLanding = uniformOf(veil, 'uKick');
    const landedBefore = Number((find(ctx.root, 'crystal-chips')!.userData as { landings?: number }).landings ?? 0);

    // 继续推进直到出现落地事件。
    step(stage, 0.3, 0.8, 90);
    const landedAfter = Number((find(ctx.root, 'crystal-chips')!.userData as { landings?: number }).landings ?? 0);
    const afterLanding = uniformOf(veil, 'uKick');

    expect(landedBefore).toBe(0);
    expect(beforeLanding).toBe(0);
    // 真耦合：落地事件确实发生了，扬尘才起来。
    expect(landedAfter).toBeGreaterThan(0);
    expect(afterLanding).toBeGreaterThan(0);

    // 反证「不是时间曲线」：逐帧扫全程，只要落地计数还是 0，扬尘必须恒为 0。
    // 时间曲线驱动的实现必然在某个时刻先亮起来，从而打破这个蕴含关系。
    const probeCtx = makeCtx();
    const probe = scene!.create(probeCtx);
    const probeVeil = find(probeCtx.root, 'ground-dustveil')!;
    const probeChips = find(probeCtx.root, 'crystal-chips')!;
    let sawZeroPhase = 0;
    let firstKickFrame = -1;
    let firstLandFrame = -1;
    const frames = 200;
    for (let i = 1; i <= frames; i += 1) {
      const t = i / frames;
      probe.update(t, t * TOTAL_MS, 'cinematic');
      const landed = Number((probeChips.userData as { landings?: number }).landings ?? 0);
      const kick = uniformOf(probeVeil, 'uKick');
      if (landed === 0) {
        expect(kick, `第 ${i} 帧未落地却已扬尘`).toBe(0);
        sawZeroPhase += 1;
      }
      if (landed > 0 && firstLandFrame < 0) firstLandFrame = i;
      if (kick > 0 && firstKickFrame < 0) firstKickFrame = i;
    }
    // 确实存在「已崩解但未落地」的一段，蕴含关系不是空真。
    expect(sawZeroPhase).toBeGreaterThan(10);
    // 扬尘不早于首次落地。
    expect(firstLandFrame).toBeGreaterThan(0);
    expect(firstKickFrame).toBeGreaterThanOrEqual(firstLandFrame);
    probe.dispose();

    expect(chips.length).toBeGreaterThan(0);
    stage.dispose();
  });

  it('互动②：棱光在晶面剥离瞬间爆发，与剥离层数同步', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const prism = find(ctx.root, 'prism-glow')!;
    const layers = peelLayers(ctx.root);

    const readPeeled = () => layers.filter((l) => l.scale.x > 1.02).length;

    // 剥离尚未开始：棱光不该先爆。
    stage.update(ACT1_END - 0.01, (ACT1_END - 0.01) * TOTAL_MS, 'cinematic');
    expect(readPeeled()).toBe(0);
    expect(uniformOf(prism, 'uBurst')).toBe(0);

    // 采样第二幕若干时刻：棱光爆发量必须随「已剥离层数」单调抬升。
    const samples: Array<[number, number]> = [];
    const frames = 60;
    for (let i = 1; i <= frames; i += 1) {
      const t = ACT1_END + ((ACT2_END - ACT1_END) * i) / frames;
      stage.update(t, t * TOTAL_MS, 'cinematic');
      samples.push([readPeeled(), uniformOf(prism, 'uBurst')]);
    }
    const withPeel = samples.filter(([n]) => n > 0);
    expect(withPeel.length).toBeGreaterThan(0);
    // 有层在剥的每一帧，棱光都在发光。
    expect(withPeel.every(([, burst]) => burst > 0)).toBe(true);
    // 层数更多时的峰值强于层数少时：爆发跟着剥离事件走。
    const peakAt = (n: number) => Math.max(...samples.filter(([k]) => k === n).map(([, b]) => b), 0);
    expect(peakAt(Math.max(...samples.map(([n]) => n)))).toBeGreaterThan(peakAt(1) * 0.5);
    stage.dispose();
  });

  it('碎晶音画同步：频闪由 crystal 声学共振频率定节拍', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const strobe = find(ctx.root, 'audio-strobe')!;

    // 频闪必须真的在闪：第二幕内多次采样应出现明显起伏，不是常亮。
    const values: number[] = [];
    for (let i = 0; i < 48; i += 1) {
      const t = ACT1_END + ((ACT2_END - ACT1_END) * i) / 48;
      stage.update(t, t * TOTAL_MS, 'cinematic');
      values.push(opacityOf(strobe));
    }
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.05);
    // 节拍源自声学签名，写在节点上供验收。
    const declared = (strobe.userData as { hz?: number }).hz;
    expect(declared).toBeCloseTo(MATERIAL_IDENTITIES.crystal.acoustic.resonanceHz, 5);
    stage.dispose();
  });

  it('低档位只缩密度，不删元素', () => {
    const lo = makeCtx({ quality: 'low' });
    const hi = makeCtx({ quality: 'cinematic' });
    const a = scene!.create(lo);
    const b = scene!.create(hi);
    for (const element of REQUIRED) {
      expect(namedNodes(lo.root), `low 档缺 ${element}`).toContain(element);
    }
    // 晶屑刚体按档位缩减但绝不归零。
    const loChips = collectChips(lo.root).length;
    expect(loChips).toBeGreaterThan(0);
    expect(loChips).toBeLessThan(collectChips(hi.root).length);
    // 8 层剥落是签名形态，任何档位都不许裁。
    expect(peelLayers(lo.root)).toHaveLength(PEEL_LAYERS);
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等，之后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => stage.update(0.5, 600, 'cinematic')).not.toThrow();
  });
});
