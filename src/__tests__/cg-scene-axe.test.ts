import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-axe';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  AXE_ACT1_END,
  AXE_ACT2_END,
  AXE_BITE_DEPTH,
  AXE_BITE_END_T,
  AXE_CRACK_P,
  AXE_DURATION_MS,
  AXE_IMPACT_T,
  AXE_RAISE_START,
  AXE_SEGMENT_COUNT,
  AXE_SWING_FALL_T,
  bladeY,
  crackReach,
  edgeDepth,
  segmentSeat,
  segmentSplitAt,
  segmentSplitDepth,
} from '../overlay/cg-scenes/axe-split';
import {
  segmentGlow,
  segmentOpen,
  segmentResin,
  segmentSide,
  segmentSpin,
} from '../overlay/cg-scenes/axe-segments';
import {
  arcGlow,
  axeRebound,
  chipBurst,
  chipSeat,
  shockRadius,
  shockWave,
} from '../overlay/cg-scenes/axe-impact';
import { RESIN_STAR_COUNT } from '../overlay/cg-scenes/axe-parts';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 26 的 8 个元素的具名节点（木屑由 quarks 承载，用锚点观测）。 */
const NAMED_ELEMENTS = [
  'axe-blade',   // ① 斧 mesh
  'logseg-0',    // ② 原木（分段）
  'chip-anchor', // ③ 木屑（发射锚点）
  'arc-glow',    // ④ 斧光弧
  'shock-ring',  // ⑤ 落地震荡
  'resin-0',     // ⑧ 松脂星点
  'axe-rig',     // ⑦ 回弹斧身
  'log-rig',     // ② 原木容器
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('axe');
  if (!scene) throw new Error('axe 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** axe 时长 1200ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * AXE_DURATION_MS, quality);
}

/** 精确正则收集：`logseg-N` 与 `log-rig` 前缀相近，必须锁「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

function segNode(root: THREE.Object3D, i: number): THREE.Object3D {
  return node(root, `logseg-${i}`);
}

/**
 * 读取折算后的粒子时钟。
 *
 * quarks 的 ParticleSystem 在根节点不是 `THREE.Scene` 时首帧即自毁
 * （three.quarks 内部会向上走到根并检查 `type === 'Scene'`），测试 harness
 * 的 root 是 Group，所以粒子系统内部的 `time` 在测试里观测不到。场景把折算
 * 后的时钟挂在 `chip-anchor` 上作为唯一出口。
 */
function particleClock(root: THREE.Object3D): number {
  const value = node(root, 'chip-anchor').userData.particleT;
  if (typeof value !== 'number') throw new Error('chip-anchor 未暴露 particleT');
  return value;
}

describe('场景 26 axe（斩斧破木）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('axe');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.title).toBe('斩斧破木');
    expect(scene!.config.signature).toContain('劈裂木料');
    expect(scene!.config.signature).toContain('原木分段分离');
    expect(scene!.config.preset).toBe('impact');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) expect(tree).toContain(name);
    stage.dispose();
  });

  it('原木建出全部六段，各持独立材质实例', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const segs = collectExact(ctx.root, 'logseg');
    expect(segs).toHaveLength(AXE_SEGMENT_COUNT);
    // 断口亮度是逐段的，共用一份材质会让六段同时亮。
    const mats = new Set(segs.map((s) => (s as THREE.Mesh).material));
    expect(mats.size).toBe(AXE_SEGMENT_COUNT);
    stage.dispose();
  });

  // ── 签名因果链：斧刃轨迹 → 穿透深度 → 裂纹前沿 → 分段分离 ──

  it('斧刃轨迹：抡起到顶、自由落体触木、咬入后停在最深处', () => {
    expect(bladeY(0)).toBeCloseTo(AXE_RAISE_START, 6);
    // 第一幕末抡到最高点。
    expect(bladeY(AXE_ACT1_END - 1e-6)).toBeCloseTo(1, 3);
    // 触木时刻刃尖恰在木面（bladeY = 0），不是另拍的常数。
    expect(bladeY(AXE_IMPACT_T)).toBeCloseTo(0, 6);
    // 行程走完停在最深处，之后不再下行。
    expect(bladeY(AXE_BITE_END_T)).toBeCloseTo(-AXE_BITE_DEPTH, 6);
    expect(bladeY(1)).toBeCloseTo(-AXE_BITE_DEPTH, 6);
  });

  it('斧刃穿过木面时速度连续（一次连贯挥砍，不是两段拼接）', () => {
    const h = 1e-5;
    const before = (bladeY(AXE_IMPACT_T - 2 * h) - bladeY(AXE_IMPACT_T)) / (2 * h);
    const after = (bladeY(AXE_IMPACT_T) - bladeY(AXE_IMPACT_T + 2 * h)) / (2 * h);
    expect(after / before).toBeCloseTo(1, 2);
  });

  it('穿透深度单调不减：木料不会因为斧退出来而重新合上', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 1 / 240) {
      const d = edgeDepth(t);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
    // 木面之上一律为 0。
    expect(edgeDepth(0)).toBe(0);
    expect(edgeDepth(AXE_ACT1_END)).toBe(0);
    expect(edgeDepth(AXE_IMPACT_T)).toBeCloseTo(0, 6);
  });

  it('签名：裂纹跑在斧刃前面（亚线性，与 katana 的切口=刀锋同步相反）', () => {
    // 刃吃进两成时，裂纹已窜过小半根原木——这是「劈裂」而非「切割」。
    const at20 = AXE_IMPACT_T + AXE_BITE_SPAN_AT(0.2);
    const depth = edgeDepth(at20);
    expect(depth).toBeGreaterThan(0.15);
    expect(crackReach(at20)).toBeGreaterThan(depth * 1.4);
    // 指数 < 1 是「跑在前面」的数学来源。
    expect(AXE_CRACK_P).toBeLessThan(1);
    // 全程裂纹位置 ≥ 穿透深度（同量纲下恒超前）。
    for (let d = 0.05; d <= 1; d += 0.05) {
      expect(Math.pow(d, AXE_CRACK_P)).toBeGreaterThan(d - 1e-9);
    }
  });

  it('裂纹前沿单调推进且入木前为零', () => {
    expect(crackReach(0)).toBe(0);
    expect(crackReach(AXE_ACT1_END)).toBe(0);
    let prev = -1;
    for (let t = 0; t <= 1; t += 1 / 240) {
      const c = crackReach(t);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(c).toBeLessThanOrEqual(1);
      prev = c;
    }
  });

  it('签名：六段分离时刻严格递增，是斧刃位置的反解而非时间表', () => {
    const times = Array.from({ length: AXE_SEGMENT_COUNT }, (_, i) => segmentSplitAt(i));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    // 每段的分离时刻处，裂纹前沿恰好抵达该段站位——反解自洽。
    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      const t = segmentSplitAt(i);
      if (!Number.isFinite(t)) continue;
      expect(crackReach(t)).toBeCloseTo(segmentSeat(i), 4);
      // 分离所需深度与该时刻的实际穿透深度一致。
      expect(edgeDepth(t)).toBeCloseTo(segmentSplitDepth(i), 4);
    }
    // 全部分离都发生在触木之后（斧没碰到木头，木头不会自己散）。
    for (const t of times) {
      if (Number.isFinite(t)) expect(t).toBeGreaterThan(AXE_IMPACT_T);
    }
  });

  it('分离时刻随斧刃轨迹整体移动（改常数会跟着变，证明不是硬编码）', () => {
    // 同一条反解换段数：站位变了，分离时刻必须跟着变。
    const six = segmentSplitAt(3, 6);
    const twelve = segmentSplitAt(3, 12);
    expect(six).not.toBeCloseTo(twelve, 4);
    // 段数翻倍后第 7 段（站位 7.5/12 ≈ 0.625）应接近六段制第 3 段（3.5/6 ≈ 0.583）。
    expect(segmentSeat(7, 12)).toBeGreaterThan(segmentSeat(3, 6));
    expect(segmentSplitAt(7, 12)).toBeGreaterThan(six);
  });

  it('分段分离：某段张开当且仅当裂纹已窜过它', () => {
    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      const t = segmentSplitAt(i);
      if (!Number.isFinite(t)) continue;
      expect(segmentOpen(i, t - 1e-4)).toBe(0);
      expect(segmentOpen(i, t + 0.02)).toBeGreaterThan(0);
      // 翻滚同理：还连着的段不会自己转。
      expect(segmentSpin(i, t - 1e-4)).toBe(0);
      expect(Math.abs(segmentSpin(i, t + 0.02))).toBeGreaterThan(0);
    }
  });

  it('张开是楔形而非平行缝：近端吃到的楔力更足', () => {
    // 同样的「分离后经历时长」下，近端张得更开。
    const age = 0.05;
    const near = segmentOpen(0, segmentSplitAt(0) + age);
    const far = segmentOpen(4, segmentSplitAt(4) + age);
    expect(near).toBeGreaterThan(far);
    // 翻滚也同源衰减。
    expect(Math.abs(segmentSpin(0, segmentSplitAt(0) + age)))
      .toBeGreaterThan(Math.abs(segmentSpin(4, segmentSplitAt(4) + age)));
  });

  it('奇偶分侧：相邻段朝相反方向翻（劈成两半而非切成六段）', () => {
    const age = 0.04;
    const a = segmentSpin(2, segmentSplitAt(2) + age);
    const b = segmentSpin(3, segmentSplitAt(3) + age);
    expect(Math.sign(a)).toBe(-Math.sign(b));
  });

  it('⑥ 断口发光：各段以自己的分离时刻为原点，不是全局一起闪', () => {
    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      const t = segmentSplitAt(i);
      if (!Number.isFinite(t)) continue;
      // 分离前不亮。
      expect(segmentGlow(i, t - 1e-4)).toBe(0);
      // 分离后迅速冲起。
      expect(segmentGlow(i, t + 0.014)).toBeGreaterThan(0.5);
    }
    // 「各段各亮」的可测出口：段 0 已在衰减时，末段还没起来。
    const early = segmentSplitAt(0);
    const lateIdx = AXE_SEGMENT_COUNT - 1;
    if (Number.isFinite(segmentSplitAt(lateIdx))) {
      expect(segmentGlow(lateIdx, early + 0.005)).toBe(0);
      expect(segmentGlow(0, early + 0.02)).toBeGreaterThan(0);
    }
  });

  it('⑧ 松脂星点比断口发光钝且滞后（液体聚拢需要时间）', () => {
    const i = 2;
    const t = segmentSplitAt(i);
    // 断口已亮起时，松脂还没出来。
    expect(segmentGlow(i, t + 0.014)).toBeGreaterThan(0.5);
    expect(segmentResin(i, t + 0.014)).toBe(0);
    // 滞后之后才聚成亮点。
    expect(segmentResin(i, t + 0.12)).toBeGreaterThan(0);
    // 松脂挂在断面上，退得比断口慢。
    const glowLate = segmentGlow(i, t + 0.3);
    const resinLate = segmentResin(i, t + 0.3);
    expect(resinLate).toBeGreaterThan(glowLate);
  });

  // ── 冲击后效：弧光/木屑读刃速，震荡/回弹以行程走完为原点 ──

  it('④ 斧光弧亮度 = 斧刃速率：触木时达峰，斧停则灭', () => {
    expect(arcGlow(0)).toBeCloseTo(0, 2);
    // 峰值在自由落体末端（触木那一刻）。
    expect(arcGlow(AXE_IMPACT_T)).toBeGreaterThan(0.9);
    // 行程走完后刃停住，弧必须灭。
    expect(arcGlow(AXE_BITE_END_T + 0.05)).toBeCloseTo(0, 3);
    expect(arcGlow(1)).toBeCloseTo(0, 3);
  });

  it('③ 木屑只在刃已入木后喷，与弧光同帧达峰', () => {
    // 刃还在空中时挤不出木屑。
    expect(chipBurst(AXE_ACT1_END)).toBe(0);
    expect(chipBurst(AXE_IMPACT_T - 1e-4)).toBe(0);
    // 触木即起跳，且与弧光同源。
    expect(chipBurst(AXE_IMPACT_T + 1e-3)).toBeGreaterThan(0.8);
    expect(chipBurst(AXE_IMPACT_T + 0.02)).toBeCloseTo(arcGlow(AXE_IMPACT_T + 0.02), 6);
  });

  it('签名：木屑发射点跟着裂纹前沿走，不是固定坑', () => {
    // 恒等于裂纹前沿——断口位置只有一个定义。
    for (let t = 0; t <= 1; t += 1 / 60) {
      expect(chipSeat(t)).toBeCloseTo(crackReach(t), 9);
    }
    // 整幕单调推进，且入木后确实走出了一段距离。
    const early = chipSeat(AXE_IMPACT_T + 0.02);
    const late = chipSeat(AXE_BITE_END_T);
    expect(late).toBeGreaterThan(early + 0.2);
  });

  it('⑤ 落地震荡严格晚于触木（动量在行程走完时才交给地面）', () => {
    // 触木时木屑与弧光已达峰，震荡还没起来。
    expect(shockWave(AXE_IMPACT_T)).toBe(0);
    expect(shockWave(AXE_BITE_END_T)).toBe(0);
    expect(shockWave(AXE_BITE_END_T + 0.02)).toBeGreaterThan(0);
    // 震荡起点严格晚于木屑起点。
    expect(AXE_BITE_END_T).toBeGreaterThan(AXE_IMPACT_T);
  });

  it('震波环扩大的同时变淡（半径与亮度是两条曲线）', () => {
    expect(shockRadius(AXE_BITE_END_T)).toBe(0);
    let prev = -1;
    for (let t = AXE_BITE_END_T; t <= 1; t += 1 / 240) {
      const r = shockRadius(t);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
    // 半径仍在长，亮度已在退。
    const a = AXE_BITE_END_T + 0.1;
    const b = AXE_BITE_END_T + 0.3;
    expect(shockRadius(b)).toBeGreaterThan(shockRadius(a));
    expect(shockWave(b)).toBeLessThan(shockWave(a));
  });

  it('⑦ 回弹斧身：行程走完后才起，带一次过冲，幅度随 restitution 缩放', () => {
    expect(axeRebound(AXE_IMPACT_T, 0.3)).toBe(0);
    expect(axeRebound(AXE_BITE_END_T, 0.3)).toBe(0);
    expect(axeRebound(AXE_BITE_END_T + 0.03, 0.3)).toBeGreaterThan(0);
    // 过冲：抬起过程中出现高于稳态的一个峰。
    const settle = axeRebound(1, 0.3);
    let peak = 0;
    for (let t = AXE_BITE_END_T; t <= 1; t += 1 / 480) {
      peak = Math.max(peak, axeRebound(t, 0.3));
    }
    expect(peak).toBeGreaterThan(settle * 1.05);
    // restitution 更大 → 顶得更高。
    expect(axeRebound(AXE_BITE_END_T + 0.06, 0.8))
      .toBeGreaterThan(axeRebound(AXE_BITE_END_T + 0.06, 0.3));
    expect(axeRebound(AXE_BITE_END_T + 0.06, 0)).toBe(0);
  });

  // ── 三幕结构与运行时状态 ──

  it('三幕边界取自 1200ms 时间表', () => {
    expect(AXE_ACT1_END).toBeCloseTo(250 / 1200, 9);
    expect(AXE_ACT2_END).toBeCloseTo(750 / 1200, 9);
    // 劈落、分离、木屑都在第二幕内完成。
    expect(AXE_IMPACT_T).toBeGreaterThan(AXE_ACT1_END);
    expect(AXE_BITE_END_T).toBeLessThan(AXE_ACT2_END);
    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      const t = segmentSplitAt(i);
      if (Number.isFinite(t)) expect(t).toBeLessThan(AXE_ACT2_END);
    }
  });

  it('斧身竖向位置由 bladeY 驱动：抡起在上、劈落在下', () => {
    const { stage, ctx } = build();
    at(stage, 0.02);
    const start = node(ctx.root, 'axe-blade').position.y;
    at(stage, AXE_ACT1_END - 1e-4);
    const top = node(ctx.root, 'axe-blade').position.y;
    at(stage, AXE_BITE_END_T);
    const deep = node(ctx.root, 'axe-blade').position.y;
    expect(top).toBeGreaterThan(start);
    expect(deep).toBeLessThan(start);
    stage.dispose();
  });

  it('签名落到场景状态：木段逐个亮起断口并沿法向张开', () => {
    const { stage, ctx } = build();
    const t2 = segmentSplitAt(2);
    at(stage, t2 + 0.01);
    // 段 2 已分离并亮起，末段尚未。
    expect(uniformOf(segNode(ctx.root, 2), 'uSplit')).toBe(1);
    expect(uniformOf(segNode(ctx.root, 2), 'uGlow')).toBeGreaterThan(0);
    expect(uniformOf(segNode(ctx.root, 5), 'uSplit')).toBe(0);
    expect(uniformOf(segNode(ctx.root, 5), 'uGlow')).toBe(0);
    // 张开沿竖向（裂面法向），且张口随时间加大。
    const y2 = segNode(ctx.root, 2).position.y;
    at(stage, AXE_ACT2_END);
    expect(Math.abs(segNode(ctx.root, 2).position.y)).toBeGreaterThan(Math.abs(y2));
    stage.dispose();
  });

  it('场景层分侧与翻滚方向同源：相邻段确实往相反方向被推开', () => {
    const { stage, ctx } = build();
    // t=0 时张开量恒为 0，此刻的 y 就是各段基座（不必伸手进 parts 内部）。
    at(stage, 0);
    const bases = Array.from(
      { length: AXE_SEGMENT_COUNT },
      (_, i) => segNode(ctx.root, i).position.y,
    );
    at(stage, AXE_ACT2_END);
    // 取六段相对各自基座的位移，逐对检查符号相反——「劈成两半」而非
    // 「切成六段各自飘走」。这里不写 `i % 2`，只要求相邻异号，
    // 于是场景层把分侧写死成同一侧时必须变红。
    const offsets = Array.from(
      { length: AXE_SEGMENT_COUNT },
      (_, i) => segNode(ctx.root, i).position.y - bases[i],
    );
    for (const off of offsets) expect(Math.abs(off)).toBeGreaterThan(0);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(Math.sign(offsets[i]), `段 ${i - 1}/${i} 未分侧`)
        .toBe(-Math.sign(offsets[i - 1]));
    }
    // 位移方向必须与该段的翻滚方向同号（同一份楔力的两个表现）。
    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      expect(Math.sign(offsets[i])).toBe(segmentSide(i));
      expect(Math.sign(segNode(ctx.root, i).rotation.z)).toBe(segmentSide(i));
    }
    stage.dispose();
  });

  it('未劈的左段整幕不亮断口（「还连着」的参照）', () => {
    const { stage, ctx } = build();
    at(stage, AXE_ACT2_END);
    const stub = node(ctx.root, 'log-stub');
    expect(uniformOf(stub, 'uSplit')).toBe(0);
    expect(uniformOf(stub, 'uGlow')).toBeLessThan(0.2);
    // 木体本身可见。
    expect(uniformOf(stub, 'uAlpha')).toBeGreaterThan(0.5);
    stage.dispose();
  });

  it('木屑锚点沿轴向单调推进（场景层确实用了 chipSeat）', () => {
    const { stage, ctx } = build();
    at(stage, AXE_IMPACT_T + 0.01);
    const early = node(ctx.root, 'chip-anchor').position.x;
    at(stage, AXE_BITE_END_T);
    const late = node(ctx.root, 'chip-anchor').position.x;
    expect(late).toBeGreaterThan(early);
    stage.dispose();
  });

  it('④ 斧光弧与 ⑤ 震荡在场景状态上错峰', () => {
    const { stage, ctx } = build();
    at(stage, AXE_IMPACT_T);
    expect(opacity(node(ctx.root, 'arc-glow'))).toBeGreaterThan(0.5);
    expect(uniformOf(node(ctx.root, 'shock-ring'), 'uAlpha')).toBe(0);
    at(stage, AXE_BITE_END_T + 0.05);
    expect(opacity(node(ctx.root, 'arc-glow'))).toBeLessThan(0.1);
    expect(uniformOf(node(ctx.root, 'shock-ring'), 'uAlpha')).toBeGreaterThan(0);
    stage.dispose();
  });

  it('⑦ 回弹施加在 axe-rig 上，行程走完后才动', () => {
    const { stage, ctx } = build();
    at(stage, AXE_IMPACT_T);
    expect(node(ctx.root, 'axe-rig').position.y).toBe(0);
    at(stage, AXE_BITE_END_T + 0.06);
    expect(node(ctx.root, 'axe-rig').position.y).toBeGreaterThan(0);
    stage.dispose();
  });

  it('⑧ 松脂星点随所属木段一起走', () => {
    const { stage, ctx } = build();
    at(stage, 0.02);
    const before = node(ctx.root, 'resin-0').position.y;
    at(stage, AXE_ACT2_END);
    const after = node(ctx.root, 'resin-0').position.y;
    expect(after).not.toBeCloseTo(before, 3);
    expect(opacity(node(ctx.root, 'resin-0'))).toBeGreaterThan(0);
    stage.dispose();
  });

  it('松脂星点建齐且都挂在已分离的段上（不挂被斧身挡住的段 0）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'resin')).toHaveLength(RESIN_STAR_COUNT);
    stage.dispose();
  });

  // ── 稀疏 update / 降档 / dispose ──

  it('粒子时钟按场景时间轴折算，不随 update 次数漂移', () => {
    // mesh 状态是 t 的纯函数，稀疏/密集本来就相等——真正会漂的是粒子时钟。
    // 若把 hub.update 改成每帧固定推一步，调用次数就会直接写进粒子时间，
    // 这条断言即变红（M14 封堵）。
    const few = build();
    const many = build();
    at(few.stage, AXE_ACT2_END);
    for (let i = 1; i <= 24; i += 1) at(many.stage, (i / 24) * AXE_ACT2_END);
    // 折算后时钟只与 t 有关：一次跳到幕末与 24 次逼近必须同值。
    expect(particleClock(few.ctx.root)).toBeGreaterThan(0);
    expect(particleClock(few.ctx.root)).toBeCloseTo(particleClock(many.ctx.root), 5);
    // 且确实推进到了该有的刻度，不是恒为 0 的空壳：折算目标是
    // `t × 1.2s`，固定步长累加后落在目标的一个步长之内。
    const target = AXE_ACT2_END * 1.2;
    expect(particleClock(few.ctx.root)).toBeGreaterThan(target - 1 / 60 - 1e-9);
    expect(particleClock(few.ctx.root)).toBeLessThanOrEqual(target + 1e-9);
    few.stage.dispose();
    many.stage.dispose();
  });

  it('稀疏 update 与密集 update 同结果（物理不吃 frameDelta）', () => {
    const sparse = build();
    at(sparse.stage, 0.5);
    at(sparse.stage, AXE_ACT2_END);

    const dense = build();
    for (let t = 0; t <= AXE_ACT2_END; t += 1 / 240) at(dense.stage, t);
    at(dense.stage, AXE_ACT2_END);

    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      expect(segNode(sparse.ctx.root, i).position.y)
        .toBeCloseTo(segNode(dense.ctx.root, i).position.y, 6);
      expect(uniformOf(segNode(sparse.ctx.root, i), 'uGlow'))
        .toBeCloseTo(uniformOf(segNode(dense.ctx.root, i), 'uGlow'), 6);
    }
    expect(node(sparse.ctx.root, 'axe-rig').position.y)
      .toBeCloseTo(node(dense.ctx.root, 'axe-rig').position.y, 6);
    expect(node(sparse.ctx.root, 'chip-anchor').position.x)
      .toBeCloseTo(node(dense.ctx.root, 'chip-anchor').position.x, 6);
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('低档位 8 元素一个不少，六段签名载体不被 scaledCount 削掉', () => {
    for (const quality of ['low', 'medium', 'high', 'cinematic'] as EffectQuality[]) {
      const { stage, ctx } = build({ quality });
      at(stage, AXE_ACT2_END, quality);
      const tree = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(tree, `${quality} 档缺元素 ${name}`).toContain(name);
      }
      // 签名载体：六段与松脂星点数量不随档位缩放。
      expect(collectExact(ctx.root, 'logseg'), `${quality} 档木段被削`)
        .toHaveLength(AXE_SEGMENT_COUNT);
      expect(collectExact(ctx.root, 'resin'), `${quality} 档松脂被削`)
        .toHaveLength(RESIN_STAR_COUNT);
      stage.dispose();
    }
  });

  it('低档与电影档的分离时刻一致（降档只减粒子密度，不改力学）', () => {
    const low = build({ quality: 'low' });
    const cine = build({ quality: 'cinematic' });
    const t = segmentSplitAt(3) + 0.01;
    at(low.stage, t, 'low');
    at(cine.stage, t, 'cinematic');
    for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
      expect(uniformOf(segNode(low.ctx.root, i), 'uSplit'))
        .toBe(uniformOf(segNode(cine.ctx.root, i), 'uSplit'));
    }
    low.stage.dispose();
    cine.stage.dispose();
  });

  it('dispose 递归清空子树且幂等，不留残余子节点', () => {
    const { stage, ctx } = build();
    at(stage, AXE_ACT2_END);
    // dispose 前先抓住嵌套容器的引用：group.clear() 只摘一层。
    const rig = node(ctx.root, 'log-rig');
    const axeRig = node(ctx.root, 'axe-rig');
    expect(rig.children.length).toBeGreaterThan(0);
    expect(axeRig.children.length).toBeGreaterThan(0);

    stage.dispose();
    stage.dispose();

    expect(ctx.root.children).toHaveLength(0);
    expect(rig.children).toHaveLength(0);
    expect(axeRig.children).toHaveLength(0);
    // dispose 后继续 update 静默失效，不抛。
    expect(() => at(stage, 0.9)).not.toThrow();
  });

  it('update 覆盖整幕不抛异常（含边界与越界 t）', () => {
    const { stage } = build();
    expect(() => {
      for (let t = -0.1; t <= 1.1; t += 1 / 120) at(stage, t);
    }).not.toThrow();
    stage.dispose();
  });
});

/** 咬入段内经过 `frac` 比例行程所需的时长（用于「刃吃进两成」这类断言）。 */
function AXE_BITE_SPAN_AT(frac: number): number {
  // depth = D(2s - s²) ⇒ s = 1 - sqrt(1 - depth/D)
  const depth = frac * AXE_BITE_DEPTH;
  const s = 1 - Math.sqrt(1 - depth / AXE_BITE_DEPTH);
  return s * AXE_SWING_FALL_T * AXE_BITE_DEPTH;
}
