import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-bow';
import { resolveScene } from '../overlay/cg-scene-registry';
import { BOW_ACT1_END, BOW_ACT2_END } from '../overlay/cg-scenes/cg-bow';
import {
  DRAW_END,
  FLIGHT_END,
  arrowPassTime,
  arrowProgress,
  limbShake,
  riftOpening,
  stringDraw,
} from '../overlay/cg-scenes/bow-ballistics';
import { RIFT_SEGMENTS } from '../overlay/cg-scenes/bow-shaders';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 24 的 8 个构成件的具名节点（箭羽拖尾由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'bow-body',        // ① 弓身 + 弓弦
  'arrow-shaft',     // ② 箭矢
  'cloud-rift',      // ③ 穿云缝
  'feather-anchor',  // ④ 箭羽拖尾（发射锚点）
  'sonic-cone',      // ⑤ 破空锥
  'ripple-0',        // ⑥ 靶心涟漪
  'wisp-0',          // ⑦ 云絮被卷
  'storm-backdrop',  // ⑧ 远处闪电暗场
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('bow');
  if (!scene) throw new Error('bow 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 读云缝的逐段张开量。 */
function riftOpenArray(root: THREE.Object3D): number[] {
  const cloud = node(root, 'cloud-rift') as THREE.Mesh;
  const mat = cloud.material as THREE.ShaderMaterial;
  return Array.from(mat.uniforms.uOpen.value as Float32Array);
}

describe('场景 24 bow（一箭穿云）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('bow');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('云缝合拢');
    expect(scene!.config.preset).toBe('dash');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'ripple')).toHaveLength(3);
    expect(collectExact(ctx.root, 'wisp')).toHaveLength(7);
    stage.dispose();
  });

  // 签名核心：云缝张开后必须**回落**（愈合）。这是与所有单向破坏
  // 场景（katana 斩痕、glass-shot 裂纹、bomb 碎片）的分界。
  it('签名·云缝张开后回落愈合（不是单向张开）', () => {
    const passAt = 0.4;
    const samples: number[] = [];
    for (let i = 0; i <= 60; i += 1) samples.push(riftOpening(passAt + i * 0.01, passAt));

    const peak = Math.max(...samples);
    const peakIdx = samples.indexOf(peak);
    expect(peak).toBeCloseTo(1, 3);
    // 峰值不在末端——末端必须已经愈合。
    expect(peakIdx).toBeLessThan(samples.length - 1);
    // 峰后单调回落。
    for (let i = peakIdx + 1; i < samples.length; i += 1) {
      expect(samples[i], `愈合段 ${i}`).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
    }
    // 足够久之后基本闭合。
    expect(samples[samples.length - 1], `末值 ${samples[samples.length - 1]}`).toBeLessThan(0.2);
  });

  it('签名·箭未到之处云缝不开（因果不是定时）', () => {
    expect(riftOpening(0.2, 0.5)).toBe(0);
    expect(riftOpening(0.49, 0.5)).toBe(0);
    expect(riftOpening(0.5, 0.5)).toBe(0);
    // 刚过就开。
    expect(riftOpening(0.515, 0.5)).toBeGreaterThan(0.4);
  });

  it('签名·云缝各段依次张开（跟着箭走，不是整条齐开）', () => {
    const { stage, ctx } = build();
    // 取箭飞到中途的时刻：前段应已张开甚至开始愈合，后段还没被划到。
    at(stage, DRAW_END + (FLIGHT_END - DRAW_END) * 0.45);
    const open = riftOpenArray(ctx.root);
    expect(open).toHaveLength(RIFT_SEGMENTS);

    // 前几段（箭已过）必须有开度。
    const front = open.slice(0, 3).reduce((a, b) => a + b, 0);
    expect(front, `前段开度 ${open.slice(0, 3).map((n) => n.toFixed(3)).join(',')}`)
      .toBeGreaterThan(0.1);
    // 末几段（箭未到）必须为零。
    const tail = open.slice(-3);
    for (const v of tail) {
      expect(v, `末段应未开: ${tail.map((n) => n.toFixed(3)).join(',')}`).toBe(0);
    }
    stage.dispose();
  });

  it('签名·末幕云缝整体愈合（缝几乎闭合）', () => {
    const { stage, ctx } = build();
    // 取「最后一段刚张满」的时刻：张开窗口是 0.03 幕，所以是
    // FLIGHT_END + 0.03。选 +0.01 会取到还在张开途中的值（0.33）。
    at(stage, FLIGHT_END + 0.03);
    const justAfter = riftOpenArray(ctx.root);
    const maxJust = Math.max(...justAfter);
    // 末幕：全部段都该收窄。
    at(stage, 0.99);
    const late = riftOpenArray(ctx.root);
    const maxLate = Math.max(...late);

    expect(maxJust).toBeGreaterThan(0.5);
    expect(maxLate, `刚过 ${maxJust.toFixed(3)} / 末幕 ${maxLate.toFixed(3)}`)
      .toBeLessThan(maxJust * 0.35);
    stage.dispose();
  });

  // 弓弦：拉满是渐进的，松弦是瞬时的——两者时间尺度差一个数量级。
  it('弓弦拉满后瞬时回弹（松弦比拉弓快一个数量级）', () => {
    // 拉弓段单调增。
    const draws = [0.02, 0.08, 0.15, 0.22, DRAW_END - 1e-6].map(stringDraw);
    for (let i = 1; i < draws.length; i += 1) {
      expect(draws[i], `拉弓段 ${i}`).toBeGreaterThan(draws[i - 1]);
    }
    expect(draws[draws.length - 1]).toBeCloseTo(1, 3);

    // 松弦：极短窗口内归零。
    expect(stringDraw(DRAW_END + 0.03)).toBe(0);
    // 松弦耗时不足拉弓的十分之一。
    expect(0.025).toBeLessThan(DRAW_END * 0.1 + 1e-9);
  });

  // 互动① 弓身震动由松弦驱动：弦不松弓不震，且震动衰减。
  it('互动·松弦前弓不震，松弦后震动衰减', () => {
    // 拉弓期间无震动。
    for (const t of [0.05, 0.15, DRAW_END - 0.01]) {
      expect(limbShake(t), `t=${t}`).toBe(0);
    }
    // 松弦后按窗口取峰值，序列必须单调下降。
    const peaks: number[] = [];
    for (let w = 0; w < 5; w += 1) {
      let peak = 0;
      for (let i = 0; i < 40; i += 1) {
        peak = Math.max(peak, limbShake(DRAW_END + w * 0.06 + (i / 40) * 0.06));
      }
      peaks.push(peak);
    }
    expect(peaks[0]).toBeGreaterThan(0.5);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i], `窗口 ${i} 未衰减`).toBeLessThan(peaks[i - 1]);
    }
  });

  it('互动·运行期弓身 uShake 与 uDraw 各司其职', () => {
    const { stage, ctx } = build();
    at(stage, 0.15);
    const drawing = uniformOf(node(ctx.root, 'bow-body'), 'uDraw');
    const quietShake = uniformOf(node(ctx.root, 'bow-body'), 'uShake');
    expect(drawing, '拉弓期弦应被拉开').toBeGreaterThan(0.5);
    expect(quietShake, '拉弓期弓不该震').toBe(0);

    // 松弦后：弦已松、弓在震。
    at(stage, DRAW_END + 0.012);
    const released = uniformOf(node(ctx.root, 'bow-body'), 'uDraw');
    const shaking = uniformOf(node(ctx.root, 'bow-body'), 'uShake');
    expect(released).toBeLessThan(drawing);
    expect(shaking).toBeGreaterThan(0);
    stage.dispose();
  });

  // 箭是减速飞行（与 meteor 的再入加速相反）。
  it('箭离弦后减速飞行（进度曲线二阶差分为负）', () => {
    const ts: number[] = [];
    for (let i = 0; i <= 8; i += 1) ts.push(DRAW_END + (FLIGHT_END - DRAW_END) * (i / 8));
    const p = ts.map(arrowProgress);
    const d1: number[] = [];
    for (let i = 1; i < p.length; i += 1) d1.push(p[i] - p[i - 1]);
    // 每段位移都比上一段小 → 减速。
    for (let i = 1; i < d1.length; i += 1) {
      expect(d1[i], `段 ${i} 未减速`).toBeLessThan(d1[i - 1]);
    }
    expect(arrowProgress(DRAW_END)).toBe(0);
    expect(arrowProgress(FLIGHT_END)).toBe(1);
  });

  it('箭路斜贯全屏（横纵跨度都超过屏幕大半）', () => {
    const { stage, ctx } = build();
    at(stage, DRAW_END + 0.001);
    const start = node(ctx.root, 'arrow-shaft').position.clone();
    at(stage, FLIGHT_END);
    const end = node(ctx.root, 'arrow-shaft').position.clone();
    expect(Math.abs(end.x - start.x)).toBeGreaterThan(ctx.width * 0.6);
    expect(Math.abs(end.y - start.y)).toBeGreaterThan(ctx.height * 0.5);
    stage.dispose();
  });

  it('箭在拉弓期不可见，命中后隐没', () => {
    const { stage, ctx } = build();
    at(stage, 0.15);
    expect(opacity(node(ctx.root, 'arrow-shaft')), '拉弓期不该有箭').toBe(0);
    at(stage, 0.45);
    expect(opacity(node(ctx.root, 'arrow-shaft')), '飞行期应可见').toBeGreaterThan(0.5);
    at(stage, 0.99);
    expect(opacity(node(ctx.root, 'arrow-shaft')), '命中后应隐没').toBeLessThan(0.1);
    stage.dispose();
  });

  // 破空锥的马赫数随箭减速而**下降**——与 meteor 的再入加速相反。
  it('破空锥马赫数随箭减速而下降（与 meteor 相反）', () => {
    const { stage, ctx } = build();
    const machs: number[] = [];
    for (let i = 1; i < 6; i += 1) {
      at(stage, DRAW_END + (FLIGHT_END - DRAW_END) * (i / 6));
      machs.push(uniformOf(node(ctx.root, 'sonic-cone'), 'uMach'));
    }
    for (let i = 1; i < machs.length; i += 1) {
      expect(machs[i], `段 ${i}`).toBeLessThan(machs[i - 1]);
    }
    stage.dispose();
  });

  it('破空锥跟着箭头走', () => {
    const { stage, ctx } = build();
    for (const t of [0.3, 0.45, 0.6]) {
      at(stage, t);
      const arrow = node(ctx.root, 'arrow-shaft').position;
      const cone = node(ctx.root, 'sonic-cone').position;
      expect(Math.hypot(cone.x - arrow.x, cone.y - arrow.y), `t=${t}`).toBeLessThan(0.001);
    }
    stage.dispose();
  });

  // 互动② 云絮被卷：各絮在箭经过时被推开，之后回位。
  it('互动·云絮在箭经过时被推开，随后回位', () => {
    const { stage, ctx } = build();
    const wisp = 'wisp-3';
    // 箭未到：在基位。
    at(stage, 0.28);
    const before = node(ctx.root, wisp).position.clone();

    // 找该絮被推得最开的时刻。
    let maxOff = 0;
    for (let i = 0; i <= 60; i += 1) {
      const t = DRAW_END + (i / 60) * (1 - DRAW_END);
      at(stage, t);
      const p = node(ctx.root, wisp).position;
      maxOff = Math.max(maxOff, Math.hypot(p.x - before.x, p.y - before.y));
    }
    expect(maxOff, '云絮从未被卷动').toBeGreaterThan(5);

    // 末幕：已回到基位附近。
    at(stage, 0.99);
    const after = node(ctx.root, wisp).position;
    const back = Math.hypot(after.x - before.x, after.y - before.y);
    expect(back, `末幕偏移 ${back} / 峰值 ${maxOff}`).toBeLessThan(maxOff * 0.35);
    stage.dispose();
  });

  it('靶心涟漪在命中后（第三幕）才出现，三圈错峰', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    for (let i = 0; i < 3; i += 1) {
      expect(opacity(node(ctx.root, `ripple-${i}`)), `命中前 ripple-${i}`).toBe(0);
    }

    const peakAt = [0, 0, 0];
    const peaks = [0, 0, 0];
    for (let i = 0; i <= 40; i += 1) {
      const t = FLIGHT_END + (1 - FLIGHT_END) * (i / 40);
      at(stage, t);
      for (let r = 0; r < 3; r += 1) {
        const o = opacity(node(ctx.root, `ripple-${r}`));
        if (o > peaks[r]) { peaks[r] = o; peakAt[r] = t; }
      }
    }
    for (let r = 0; r < 3; r += 1) {
      expect(peaks[r], `ripple-${r} 未亮`).toBeGreaterThan(0.1);
    }
    expect(peakAt[1]).not.toBe(peakAt[0]);
    expect(peakAt[2]).not.toBe(peakAt[1]);
    stage.dispose();
  });

  it('箭羽拖尾锚点跟在箭尾（不是箭头）', () => {
    const { stage, ctx } = build();
    at(stage, 0.45);
    const arrow = node(ctx.root, 'arrow-shaft').position;
    const feather = node(ctx.root, 'feather-anchor').position;
    // 锚点必须在箭后方（靠起点一侧）。
    const dx = feather.x - arrow.x;
    const dy = feather.y - arrow.y;
    // 箭路方向为右上，锚点应在左下。
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1);
    stage.dispose();
  });

  it('arrowPassTime 是 arrowProgress 的反解（自洽）', () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const t = arrowPassTime(p);
      expect(arrowProgress(t), `progress ${p}`).toBeCloseTo(p, 6);
    }
    expect(arrowPassTime(0)).toBe(DRAW_END);
    expect(arrowPassTime(1)).toBe(FLIGHT_END);
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, BOW_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (BOW_ACT1_END + BOW_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档只减粒子密度，结构件一个不少', () => {
    const hi = build();
    at(hi.stage, 0.5);
    const hiTree = names(hi.ctx.root);

    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.5);
    const loTree = names(lo.ctx.root);

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    expect(collectExact(lo.ctx.root, 'ripple')).toHaveLength(collectExact(hi.ctx.root, 'ripple').length);
    expect(collectExact(lo.ctx.root, 'wisp')).toHaveLength(collectExact(hi.ctx.root, 'wisp').length);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树摘净且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.8)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
  });
});
