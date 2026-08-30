import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-aurora';
import { resolveScene } from '../overlay/cg-scene-registry';
import { AURORA_ACT1_END, AURORA_ACT2_END } from '../overlay/cg-scenes/cg-aurora';
import {
  BURST_AT,
  BURST_SPAN,
  BURST_U,
  RIBBON_SEGMENTS,
  burstEnergy,
  foldPhasePosition,
  glowFlowU,
  ribbonAxisY,
  ribbonFold,
  ribbonLocalGain,
} from '../overlay/cg-scenes/aurora-ribbon';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 30 的 8 个构成件的具名节点。 */
const NAMED_ELEMENTS = [
  'aurora-ribbon',     // ① 极光带 + ⑥ 光影翻卷（同层 uFold）
  'flow-0',            // ② 流动光
  'glowflow-anchor',   // ② 流动光的粒子发射锚点
  'star-sky',          // ③ 星光背景
  'snow-ridge',        // ④ 雪山剪影
  'fringe-0',          // ⑤ 极光边缘丝
  'lake-reflection',   // ⑦ 倒影湖面
  'aurora-burst',      // ⑧ 爆发点
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('aurora');
  if (!scene) throw new Error('aurora 场景未注册');
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

/** 读带的逐段起伏量。 */
function foldArray(root: THREE.Object3D): number[] {
  const mesh = node(root, 'aurora-ribbon') as THREE.Mesh;
  const mat = mesh.material as THREE.ShaderMaterial;
  return Array.from(mat.uniforms.uFold.value as Float32Array);
}

/** 读带的逐段局部亮度。 */
function gainArray(root: THREE.Object3D): number[] {
  const mesh = node(root, 'aurora-ribbon') as THREE.Mesh;
  const mat = mesh.material as THREE.ShaderMaterial;
  return Array.from(mat.uniforms.uGain.value as Float32Array);
}

describe('场景 30 aurora（极光绸带）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('aurora');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('时空绸带');
    expect(scene!.config.preset).toBe('wave');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'fringe')).toHaveLength(9);
    expect(collectExact(ctx.root, 'flow')).toHaveLength(8);
    stage.dispose();
  });

  /**
   * 找出 ribbonFold 在某时刻的全部波节（过零点）位置。
   *
   * 波节是区分行波与驻波的**唯一直接特征**：行波的波节随时间沿带
   * 移动，驻波的波节位置固定、只有幅度在变。
   */
  function foldNodes(t: number): number[] {
    const zeros: number[] = [];
    let prev = ribbonFold(0, t);
    for (let i = 1; i < 400; i += 1) {
      const u = i / 399;
      const cur = ribbonFold(u, t);
      if (Math.sign(cur) !== Math.sign(prev) && Math.sign(prev) !== 0) {
        zeros.push(u - 0.5 / 399);
      }
      prev = cur;
    }
    return zeros;
  }

  // 签名核心：起伏是**行波**而非驻波。
  //
  // 断言必须咬住 ribbonFold 本身，不能只测 foldPhasePosition——后者是
  // 独立的解析反函数，把 ribbonFold 改成驻波它照样返回移动的位置，
  // 23 条断言会全绿（本场景实测过这个假绿）。
  it('签名·带面起伏是行波（波节随时间沿带移动，不是驻波）', () => {
    const times = [0.30, 0.32, 0.34, 0.36];
    const nodeSets = times.map(foldNodes);
    for (let i = 0; i < nodeSets.length; i += 1) {
      expect(nodeSets[i].length, `t=${times[i]} 波节数`).toBeGreaterThan(2);
    }

    // 驻波的波节集合在各时刻**完全相同**；行波的必须整体平移。
    // 比较相邻时刻每个波节到「最近波节」的距离，行波下这个距离恒大于 0。
    for (let k = 1; k < nodeSets.length; k += 1) {
      const prevSet = nodeSets[k - 1];
      const curSet = nodeSets[k];
      let minShift = Infinity;
      for (const z of curSet) {
        let best = Infinity;
        for (const p of prevSet) best = Math.min(best, Math.abs(z - p));
        minShift = Math.min(minShift, best);
      }
      // 每个波节都移动了可观测的距离——驻波下这个值会是 0。
      expect(minShift, `t=${times[k]} 最小波节位移 ${minShift}`).toBeGreaterThan(0.005);
    }
  });

  it('签名·相位反解与起伏函数自洽（foldPhasePosition 不是独立摆设）', () => {
    // foldPhasePosition 给出的位置上，主波列的相位应当一致：
    // 换言之该位置的 fold 值在不同时刻应当接近（同一相位点）。
    const phase = 0.8;
    const vals = [0.30, 0.34, 0.38].map((t) => {
      const u = foldPhasePosition(phase, t);
      return { u, fold: ribbonFold(u, t) };
    });
    // 位置必须在动（行波）。
    expect(Math.abs(vals[1].u - vals[0].u)).toBeGreaterThan(1e-6);
    // 该点的起伏值在各时刻同号——同一相位点跟着走，不会一会儿峰一会儿谷。
    const signs = vals.map((v) => Math.sign(v.fold));
    expect(new Set(signs).size, `符号 ${signs.join(',')}`).toBe(1);
  });

  it('签名·带面各处起伏不同步（不是整条一起上下）', () => {
    const t = 0.4;
    const folds: number[] = [];
    for (let i = 0; i < RIBBON_SEGMENTS; i += 1) {
      folds.push(ribbonFold(i / (RIBBON_SEGMENTS - 1), t));
    }
    // 同一时刻必须同时存在上凸与下凹（翻卷的可观测特征）。
    expect(Math.max(...folds), `最大起伏 ${Math.max(...folds)}`).toBeGreaterThan(0.3);
    expect(Math.min(...folds), `最小起伏 ${Math.min(...folds)}`).toBeLessThan(-0.3);
  });

  it('签名·带面起伏在运行期真的写进 uFold（各段不等）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const folds = foldArray(ctx.root);
    expect(folds).toHaveLength(RIBBON_SEGMENTS);
    // 各段不等：写成常量会让这条红。
    const distinct = new Set(folds.map((f) => f.toFixed(4)));
    expect(distinct.size, `不同值 ${distinct.size} / ${folds.length}`).toBeGreaterThan(10);
    // 且同时有正有负。
    expect(Math.max(...folds)).toBeGreaterThan(0.2);
    expect(Math.min(...folds)).toBeLessThan(-0.2);
    stage.dispose();
  });

  it('签名·起伏逐帧推进（同一段的值在变）', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const a = foldArray(ctx.root);
    at(stage, 0.45);
    const b = foldArray(ctx.root);
    let changed = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (Math.abs(a[i] - b[i]) > 0.02) changed += 1;
    }
    expect(changed, `变化段数 ${changed}/${a.length}`).toBeGreaterThan(a.length * 0.5);
    stage.dispose();
  });

  // 与 dragon 的对照：dragon 是实体生物（身段长度守恒），
  // 极光是等离子体幕（可任意拉伸）。这条锁住两者不趋同。
  it('对照 dragon·带宽随翻卷剧烈度变化（非实体，长度不守恒）', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const early = uniformOf(node(ctx.root, 'aurora-ribbon'), 'uSpread');
    at(stage, 0.5);
    const mid = uniformOf(node(ctx.root, 'aurora-ribbon'), 'uSpread');
    // 成形期窄、卷舞期展开——实体生物做不到这个。
    expect(mid).toBeGreaterThan(early);
    stage.dispose();
  });

  it('中轴是缓弧（中央高、两端垂下）', () => {
    const h = 1080;
    const mid = ribbonAxisY(0.5, h);
    const left = ribbonAxisY(0, h);
    const right = ribbonAxisY(1, h);
    expect(mid).toBeGreaterThan(left);
    expect(mid).toBeGreaterThan(right);
    expect(left).toBeCloseTo(right, 6);
  });

  // 互动① 流光照亮带面起伏峰：局部亮度是两个量的乘积。
  it('互动·局部亮度为零的两种情形（流光不在 或 带面平坦）', () => {
    // 流光远离：不亮。
    expect(ribbonLocalGain(0.2, 0.4, [0.8])).toBe(0);
    // 流光就在旁边且该处有起伏：亮。
    const u = 0.3;
    const t = 0.4;
    const crest = Math.abs(ribbonFold(u, t));
    expect(crest, '取样点应有起伏').toBeGreaterThan(0.05);
    expect(ribbonLocalGain(u, t, [u])).toBeGreaterThan(0);
    // 无流光：整带都不亮。
    expect(ribbonLocalGain(u, t, [])).toBe(0);
  });

  it('互动·局部亮度与起伏量成正比（同一流光位置下）', () => {
    // 固定流光就在取样点上，则 gain 应严等于 |fold|。
    for (const u of [0.15, 0.35, 0.55, 0.75]) {
      const t = 0.42;
      const gain = ribbonLocalGain(u, t, [u]);
      expect(gain, `u=${u}`).toBeCloseTo(Math.abs(ribbonFold(u, t)), 9);
    }
  });

  it('互动·运行期 uGain 只在流光附近非零（不是整带均亮）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const gains = gainArray(ctx.root);
    const lit = gains.filter((g) => g > 0.05).length;
    expect(lit, `亮段 ${lit}/${gains.length}`).toBeGreaterThan(0);
    // 不能整带都亮——那说明没有「流光照亮」这回事。
    expect(lit).toBeLessThan(gains.length * 0.85);
    stage.dispose();
  });

  // 互动② 爆发点抬升整带亮度。
  it('互动·爆发是单峰（骤亮缓落），窗口外为零', () => {
    expect(burstEnergy(BURST_AT - 0.01)).toBe(0);
    expect(burstEnergy(BURST_AT + BURST_SPAN + 0.01)).toBe(0);
    const samples: number[] = [];
    for (let i = 0; i <= 40; i += 1) samples.push(burstEnergy(BURST_AT + (i / 40) * BURST_SPAN));
    const peak = Math.max(...samples);
    const peakIdx = samples.indexOf(peak);
    expect(peak).toBeCloseTo(1, 3);
    // 骤亮：峰值出现在窗口前段。
    expect(peakIdx / samples.length, `峰位 ${peakIdx / samples.length}`).toBeLessThan(0.35);
    // 缓落：峰后单调降。
    for (let i = peakIdx + 1; i < samples.length; i += 1) {
      expect(samples[i], `落段 ${i}`).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
    }
    // 必须**真的落下来**：只用「单调不增」的判据会被常量 1 完美满足
    // （indexOf 取到 0、峰位 0<0.35、常量也满足 <=），本场景实测过这个
    // 假绿。末值必须显著低于峰值，且起点必须显著低于峰值（骤亮才成立）。
    expect(samples[samples.length - 1], `末值 ${samples[samples.length - 1]}`)
      .toBeLessThan(peak * 0.2);
    expect(samples[0], `起点 ${samples[0]}`).toBeLessThan(peak * 0.3);
  });

  it('互动·整带亮度由爆发抬升（不爆发只剩基底）', () => {
    const { stage, ctx } = build();
    // 爆发前：只有基底。
    at(stage, 0.35);
    const base = uniformOf(node(ctx.root, 'aurora-ribbon'), 'uAlpha');
    expect(burstEnergy(0.35), '该时刻应无爆发').toBe(0);
    // 爆发峰值：显著更亮。
    at(stage, BURST_AT + BURST_SPAN * 0.2);
    const boosted = uniformOf(node(ctx.root, 'aurora-ribbon'), 'uAlpha');
    expect(burstEnergy(BURST_AT + BURST_SPAN * 0.2)).toBeGreaterThan(0.9);
    expect(boosted, `基底 ${base.toFixed(3)} / 爆发 ${boosted.toFixed(3)}`)
      .toBeGreaterThan(base * 2);
    stage.dispose();
  });

  it('互动·爆发点节点在爆发窗口内才可见，位置锁在 BURST_U', () => {
    const { stage, ctx } = build();
    at(stage, 0.3);
    expect(opacity(node(ctx.root, 'aurora-burst')), '窗口外不该可见').toBe(0);
    at(stage, BURST_AT + BURST_SPAN * 0.2);
    expect(opacity(node(ctx.root, 'aurora-burst'))).toBeGreaterThan(0.5);
    // 横向位置对应 BURST_U。
    const x = node(ctx.root, 'aurora-burst').position.x;
    const expected = (BURST_U - 0.5) * ctx.width * 1.1;
    expect(Math.abs(x - expected), `x=${x} 期望 ${expected}`).toBeLessThan(1);
    stage.dispose();
  });

  // 流光必须沿带流动（u 推进），不是直线飞过。
  it('流光沿带流动（沿带位置单调推进且环绕）', () => {
    const us = [0, 0.2, 0.4, 0.6].map((t) => glowFlowU(t, 0.1, 0.5));
    // 前几步递增。
    for (let i = 1; i < 3; i += 1) {
      expect(us[i], `段 ${i}`).toBeGreaterThan(us[i - 1]);
    }
    // 环绕：越过 1 后回到 0 附近。
    expect(glowFlowU(2.0, 0.1, 0.5)).toBeCloseTo(0.1, 6);
  });

  it('流光在运行期跟着带面上下（不是水平直线）', () => {
    const { stage, ctx } = build();
    const ys: number[] = [];
    for (let i = 0; i <= 12; i += 1) {
      at(stage, 0.3 + i * 0.04);
      ys.push(node(ctx.root, 'flow-0').position.y);
    }
    // 竖直位置必须变化（跟着起伏走）。
    expect(Math.max(...ys) - Math.min(...ys), `y 跨度 ${Math.max(...ys) - Math.min(...ys)}`)
      .toBeGreaterThan(10);
    stage.dispose();
  });

  it('边缘丝挂在带上，起伏峰处更长', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const lens = collectExact(ctx.root, 'fringe').map((o) => o.scale.y);
    // 各丝长度不同（跟着各自位置的起伏）。
    const distinct = new Set(lens.map((n) => n.toFixed(3)));
    expect(distinct.size, `不同长度 ${distinct.size}`).toBeGreaterThan(3);
    stage.dispose();
  });

  it('倒影湖面共享带的翻卷（uFold 与本体一致）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const ribbonFolds = foldArray(ctx.root);
    const lakeMesh = node(ctx.root, 'lake-reflection') as THREE.Mesh;
    const lakeFolds = Array.from(
      (lakeMesh.material as THREE.ShaderMaterial).uniforms.uFold.value as Float32Array,
    );
    for (let i = 0; i < ribbonFolds.length; i += 1) {
      expect(lakeFolds[i], `段 ${i}`).toBeCloseTo(ribbonFolds[i], 9);
    }
    stage.dispose();
  });

  it('全屏：极光带横贯全屏上半部', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const ribbon = node(ctx.root, 'aurora-ribbon') as THREE.Mesh;
    const geo = ribbon.geometry as THREE.PlaneGeometry;
    const w = geo.parameters.width;
    // 带宽超过屏宽。
    expect(w).toBeGreaterThan(ctx.width);
    // 带心在上半屏。
    expect(ribbon.position.y).toBeGreaterThan(0);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, AURORA_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (AURORA_ACT1_END + AURORA_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('稀疏 update 与密集 update 的带面状态一致（时间轴驱动）', () => {
    const sparse = build();
    const dense = build();
    // 稀疏：6 次跨百毫秒。
    for (let i = 0; i <= 6; i += 1) at(sparse.stage, i / 6 * 0.6);
    // 密集：逐步推进到同一时刻。
    for (let i = 0; i <= 72; i += 1) at(dense.stage, i / 72 * 0.6);

    const a = foldArray(sparse.ctx.root);
    const b = foldArray(dense.ctx.root);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i], `段 ${i}`).toBeCloseTo(b[i], 9);
    }
    sparse.stage.dispose();
    dense.stage.dispose();
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
    expect(collectExact(lo.ctx.root, 'fringe')).toHaveLength(collectExact(hi.ctx.root, 'fringe').length);
    expect(collectExact(lo.ctx.root, 'flow')).toHaveLength(collectExact(hi.ctx.root, 'flow').length);

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
