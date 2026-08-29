/**
 * 场景 06 katana 实现验收（设计规格 §4.2 场景 06）。
 *
 * 断言按规格逐条对应：8 元素齐备、三幕时间轴、斩击线横贯全屏对角线、
 * 三条多元素互动（刀气弧截断绸布 / 火花沿斩击线 / 屏裂闪光全屏白）、
 * 「静场→爆发」签名的量化性质、档位裁剪、资源释放。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage } from '../overlay/cg-scene';
import { arcSweep, iaiEnergy, KATANA_STILL_FLOOR } from '../overlay/cg-scenes/cg-katana';
import { box, makeSceneCtx, names, node, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';

const TOTAL_MS = 1200;
/** 三幕边界（归一化，对应 1200ms）。 */
const ACT1_END = 200 / TOTAL_MS;
const ACT2_END = 700 / TOTAL_MS;

/** 规格 §4.2 场景 06 的八元素，实现里以 name 标注供验收。 */
const REQUIRED = [
  'blade-body', 'slash-line', 'aura-arc', 'slash-sparks',
  'afterimage-ghosts', 'screen-crack-flash', 'silk-cloth', 'moonlight-still',
] as const;

/** 斩击轴：规格要求横贯全屏对角线，故取 atan2(height, width)。 */
const ANGLE = Math.atan2(1080, 1920);
const AXIS = new THREE.Vector2(Math.cos(ANGLE), Math.sin(ANGLE));
/** 斩击线法向，用于量「点是否落在线上」。 */
const NORMAL = new THREE.Vector2(-Math.sin(ANGLE), Math.cos(ANGLE));

const scene = resolveScene('katana');

function ctxAt(quality: 'low' | 'medium' | 'cinematic' = 'cinematic') {
  return makeSceneCtx({ quality, direction: new THREE.Vector2(1, 1).normalize() });
}

function collect(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name.startsWith(prefix)) out.push(o); });
  return out;
}

/** 沿斩击轴的投影（像素），互动①的排序量。 */
function along(p: THREE.Vector3): number {
  return p.x * AXIS.x + p.y * AXIS.y;
}

/** 到斩击线的垂距（像素），互动②的「贴线」量。 */
function perp(p: THREE.Vector3): number {
  return p.x * NORMAL.x + p.y * NORMAL.y;
}

function at(stage: CgStage, t: number): void {
  stage.update(t, t * TOTAL_MS, 'cinematic');
}

/** 按固定小步长推进，让 cannon 的绸布真实积分（单步跨大 dt 会被上限截断）。 */
function step(stage: CgStage, fromT: number, toT: number, frames = 40): void {
  for (let i = 1; i <= frames; i += 1) {
    at(stage, fromT + ((toT - fromT) * i) / frames);
  }
}

/** 绸布节点的世界位置快照。 */
function silkPoints(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  return collect(root, 'silk-node-').map((o) => o.getWorldPosition(new THREE.Vector3()));
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
}

describe('场景 06 katana', () => {
  it('已注册，preset 为 dash，签名声明静场→爆发对比', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('dash');
    expect(scene!.config.signature).toContain('居合');
    expect(scene!.config.signature).toContain('静场');
  });

  it('8 个规格元素在 low / medium / cinematic 三档都齐备', () => {
    for (const quality of ['low', 'medium', 'cinematic'] as const) {
      const ctx = ctxAt(quality);
      const stage = scene!.create(ctx);
      const tree = names(ctx.root);
      for (const element of REQUIRED) {
        expect(tree, `${quality} 档缺元素 ${element}`).toContain(element);
      }
      stage.dispose();
    }
  });

  it('斩击线横贯全屏对角线（规格全屏要求）', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    at(stage, 0.3);
    const size = box(node(ctx.root, 'slash-line')).getSize(new THREE.Vector3());
    // 对角线的 AABB 两边都要够到屏幕两边，只够一边说明它是横线或竖线。
    expect(size.x).toBeGreaterThanOrEqual(ctx.width);
    expect(size.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('屏裂闪光覆盖全屏（互动③的载体）', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    const size = box(node(ctx.root, 'screen-crack-flash')).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThanOrEqual(ctx.width);
    expect(size.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    const shot = (t: number) => { at(stage, t); return visualSnapshot(ctx.root); };
    const act1 = shot(ACT1_END * 0.5);
    const act2 = shot((ACT1_END + ACT2_END) * 0.5);
    const act3 = shot((ACT2_END + 1) * 0.5);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });
});

describe('场景 06 katana — 签名：静场→爆发对比全库最强烈', () => {
  it('iaiEnergy 是纯函数：静场期压在地板值，爆发峰值高出一个数量级', () => {
    // 静场（第一幕）全程贴地板：规格「万籁俱寂」要求这一段几乎不发光。
    for (const t of [0, 0.04, 0.08, 0.12, ACT1_END - 0.001]) {
      expect(iaiEnergy(t)).toBeLessThanOrEqual(KATANA_STILL_FLOOR);
    }
    const still = mean([0, 0.05, 0.1, 0.15].map(iaiEnergy));
    // 峰值在第二幕内取样得到。
    const samples: number[] = [];
    for (let t = ACT1_END; t <= ACT2_END; t += 0.005) samples.push(iaiEnergy(t));
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(0.9);
    // 「全库最强烈」的量化含义：爆发/静场亮度比 ≥ 20 倍。
    expect(peak / Math.max(1e-6, still)).toBeGreaterThanOrEqual(20);
  });

  it('iaiEnergy 爆发是单峰突起：一次上冲一次回落，不是来回抖', () => {
    const xs: number[] = [];
    for (let t = 0; t <= 1; t += 0.002) xs.push(iaiEnergy(t));
    let flips = 0;
    let prev = 0;
    for (let i = 1; i < xs.length; i += 1) {
      const d = xs[i] - xs[i - 1];
      if (Math.abs(d) < 1e-9) continue;
      const sign = Math.sign(d);
      if (prev !== 0 && sign !== prev) flips += 1;
      prev = sign;
    }
    // 上冲→回落恰好一次符号翻转：曲线性质，不随采样步长变化。
    expect(flips).toBe(1);
    expect(iaiEnergy(1)).toBeLessThan(iaiEnergy((ACT1_END + ACT2_END) / 2));
  });

  it('第一幕静场：斩击线/刀气弧/屏裂闪光三者全暗', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    at(stage, ACT1_END * 0.6);
    expect(opacity(node(ctx.root, 'slash-line'))).toBe(0);
    expect(uniformOf(node(ctx.root, 'aura-arc'), 'uSweep')).toBe(0);
    expect(uniformOf(node(ctx.root, 'screen-crack-flash'), 'uFlash')).toBe(0);
    // 月光静场反过来是这一幕唯一在场的元素（规格「背景暗场+月晕」）。
    expect(uniformOf(node(ctx.root, 'moonlight-still'), 'uGlow')).toBeGreaterThan(0);
    stage.dispose();
  });

  it('第二幕边界：200ms 越界即线+弧+火花同帧爆发', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    at(stage, ACT1_END - 0.004);
    const lineBefore = opacity(node(ctx.root, 'slash-line'));
    const arcBefore = uniformOf(node(ctx.root, 'aura-arc'), 'uSweep');
    const sparkBefore = opacity(node(ctx.root, 'spark-streak-0'));

    at(stage, ACT1_END + 0.004);
    // 规格三幕：「线+弧+火花同帧爆发」——三者必须在同一次越界里一起起来。
    expect(lineBefore).toBe(0);
    expect(arcBefore).toBe(0);
    expect(sparkBefore).toBe(0);
    expect(opacity(node(ctx.root, 'slash-line'))).toBeGreaterThan(0);
    expect(uniformOf(node(ctx.root, 'aura-arc'), 'uSweep')).toBeGreaterThan(0);
    expect(opacity(node(ctx.root, 'spark-streak-0'))).toBeGreaterThan(0);
    stage.dispose();
  });

  it('第三幕边界：700ms 前刀身在斩，越界后入鞘暗光+残影散', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    // 残影用 ShaderMaterial，淡出量在 uFade：读 material.opacity 会拿到
    // 恒为 1 的默认值，那样这条断言测的是常量而不是残影散没散。
    const ghostSum = () => collect(ctx.root, 'ghost-layer-').reduce((s, n) => s + uniformOf(n, 'uFade'), 0);

    at(stage, ACT2_END - 0.01);
    const bladeMid = opacity(node(ctx.root, 'blade-edge'));
    const ghostMid = ghostSum();
    at(stage, 0.98);
    // 入鞘：刀身暗下去；残影散：三层 ghost 归零。
    expect(opacity(node(ctx.root, 'blade-edge'))).toBeLessThan(bladeMid);
    expect(ghostMid).toBeGreaterThan(0);
    expect(ghostSum()).toBeLessThan(ghostMid * 0.5);
    stage.dispose();
  });

  it('残影恰好 3 层定格（规格「3 层 ghost 定格」），任何档位不裁', () => {
    for (const quality of ['low', 'cinematic'] as const) {
      const ctx = ctxAt(quality);
      const stage = scene!.create(ctx);
      expect(collect(ctx.root, 'ghost-layer-'), `${quality} 档层数不符`).toHaveLength(3);
      stage.dispose();
    }
  });
});

describe('场景 06 katana — 三条多元素互动', () => {
  it('arcSweep 是纯函数：弧沿斩击轴单调推进，越界前不到位', () => {
    // 弧位置是互动①的唯一驱动量，必须单调——回摆会让绸布「断了又接上」。
    expect(arcSweep(ACT1_END - 0.01)).toBeLessThan(arcSweep(ACT1_END + 0.01));
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const s = arcSweep(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    // 静场期弧还没出发，第二幕末已扫到另一端。
    expect(arcSweep(0)).toBeLessThanOrEqual(0);
    expect(arcSweep(ACT2_END)).toBeGreaterThan(0.9);
  });

  it('互动①：刀气弧扫过绸布才截断——同一个 arcSweep 驱动两端', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    const nodesBefore = silkPoints(ctx.root);
    expect(nodesBefore.length).toBeGreaterThan(5);

    // 推到弧刚扫过一半：只有轴向坐标在弧后方的节点该被切断。
    step(stage, 0, (ACT1_END + ACT2_END) / 2);
    const cutFlags = collect(ctx.root, 'silk-node-').map(
      (o) => (o as THREE.Mesh & { userData: { severed?: boolean } }).userData.severed === true,
    );
    const axial = silkPoints(ctx.root).map(along);

    expect(cutFlags.some(Boolean), '弧扫过后应有节点被截断').toBe(true);
    expect(cutFlags.some((c) => !c), '弧未到之处不该被截断').toBe(true);
    // 被截断的一批平均轴向位置更靠弧的来向：截断顺序由弧位置决定，不是随机。
    const cutMean = mean(axial.filter((_, i) => cutFlags[i]));
    const keepMean = mean(axial.filter((_, i) => !cutFlags[i]));
    expect(cutMean).toBeLessThan(keepMean);
    stage.dispose();
  });

  it('互动①续：截断是不可逆的，且断口两侧自由下落', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    step(stage, 0, ACT2_END);
    const cutCount = () => collect(ctx.root, 'silk-node-').filter(
      (o) => (o as THREE.Mesh & { userData: { severed?: boolean } }).userData.severed === true,
    ).length;
    const cutAtSlash = cutCount();
    const yAtSlash = silkPoints(ctx.root).map((p) => p.y);

    step(stage, ACT2_END, 0.99);
    // 布被斩断后不会自己缝回去。
    expect(cutCount()).toBeGreaterThanOrEqual(cutAtSlash);
    expect(cutAtSlash).toBeGreaterThan(0);
    // 断开的部分继续下落：cloth 是真物理，不是一张停格贴图。
    const dropped = silkPoints(ctx.root).filter((p, i) => p.y < yAtSlash[i] - 1).length;
    expect(dropped).toBeGreaterThan(0);
    stage.dispose();
  });

  it('互动②：火花沿斩击线飞溅——全部火花贴在斩击线上', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    step(stage, 0, (ACT1_END + ACT2_END) / 2);
    const sparks = collect(ctx.root, 'spark-streak-');
    expect(sparks.length).toBeGreaterThan(2);

    ctx.root.updateMatrixWorld(true);
    const offsets = sparks.map((s) => Math.abs(perp(s.getWorldPosition(new THREE.Vector3()))));
    const spans = sparks.map((s) => Math.abs(along(s.getWorldPosition(new THREE.Vector3()))));
    // 贴线的判据：垂距远小于沿线跨度。散布在全屏的粒子过不了这条。
    expect(Math.max(...offsets)).toBeLessThan(ctx.height * 0.16);
    expect(Math.max(...spans)).toBeGreaterThan(ctx.height * 0.3);
    // 火花条纹朝向与斩击轴一致（±π 同轴），不是随机朝向。
    for (const s of sparks) {
      const off = Math.abs(((s.rotation.z - ANGLE) % Math.PI + Math.PI) % Math.PI);
      expect(Math.min(off, Math.PI - off)).toBeLessThan(0.2);
    }
    stage.dispose();
  });

  it('互动③：屏裂闪光在斩击瞬间全屏闪白，且与 iaiEnergy 同源', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    const flash = () => uniformOf(node(ctx.root, 'screen-crack-flash'), 'uFlash');

    at(stage, ACT1_END - 0.005);
    const before = flash();
    let peak = 0;
    let peakT = 0;
    for (let t = ACT1_END; t <= ACT2_END; t += 0.004) {
      at(stage, t);
      if (flash() > peak) { peak = flash(); peakT = t; }
    }
    at(stage, 0.99);
    const after = flash();

    expect(before).toBe(0);
    // 「瞬间」的量化含义：峰值落在第二幕前 1/4，不是拖满整幕的缓亮。
    expect(peak).toBeGreaterThan(0.5);
    expect(peakT).toBeLessThan(ACT1_END + (ACT2_END - ACT1_END) * 0.25);
    expect(after).toBeLessThan(peak * 0.2);
    stage.dispose();
  });
});

describe('场景 06 katana — 档位与资源', () => {
  it('低档只缩火花密度，不删元素', () => {
    const lo = ctxAt('low');
    const hi = ctxAt('cinematic');
    const a = scene!.create(lo);
    const b = scene!.create(hi);
    for (const element of REQUIRED) {
      expect(names(lo.root), `low 档缺 ${element}`).toContain(element);
    }
    const loSparks = collect(lo.root, 'spark-streak-').length;
    expect(loSparks).toBeGreaterThan(0);
    expect(loSparks).toBeLessThan(collect(hi.root, 'spark-streak-').length);
    // 绸布节点同样只稀疏不消失。
    expect(collect(lo.root, 'silk-node-').length).toBeGreaterThan(0);
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等，之后 update 静默失效', () => {
    const ctx = ctxAt();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => stage.update(0.5, 600, 'cinematic')).not.toThrow();
  });
});
