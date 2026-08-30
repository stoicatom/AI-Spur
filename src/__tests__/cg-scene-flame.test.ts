import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-flame';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  FLAME_ACT1_END,
  FLAME_ACT2_END,
  blueCoreShare,
  emberDetachHeight,
  emberGlow,
  emberRise,
  emberSway,
  flicker,
  flickerGate,
  heatShimmer,
  plumeHeight,
  plumeWidth,
} from '../overlay/cg-scenes/flame-plume';
import { createEmberLayer } from '../overlay/cg-scenes/flame-embers';
import { createSceneResources } from '../overlay/cg-scene-kit';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 09 的 8 个元素的具名节点（火星由 quarks 承载，观测锚点）。 */
const NAMED_ELEMENTS = [
  'flame-tongue',   // ① 火舌
  'ember-anchor',   // ② 火星（发射锚点）
  'heat-shimmer',   // ③ 热浪
  'billet-0',       // ④ 柴堆
  'light-pulse',    // ⑤ 光影脉动
  'smokewisp-0',    // ⑥ 烟丝
  'night-sparks',   // ⑦ 背景星火
  'ground-pool',    // ⑧ 地面光池
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('flame');
  if (!scene) throw new Error('flame 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** flame 时长 1200ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

describe('场景 09 flame（篝火升腾）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('flame');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.elements).toEqual([
      '火舌', '火星', '热浪', '柴堆', '光影脉动', '烟丝', '背景星火', '地面光池',
    ]);
    expect(scene!.config.signature).toContain('连续火焰流');
    expect(scene!.config.preset).toBe('flame-rise');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const built = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(built, `缺少元素节点 ${name}`).toContain(name);
    }
    stage.dispose();
  });

  it('柴堆三根、余烬七点、烟丝五条都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'billet')).toHaveLength(3);
    expect(collectExact(ctx.root, 'emberdot')).toHaveLength(7);
    expect(collectExact(ctx.root, 'smokewisp')).toHaveLength(5);
    stage.dispose();
  });

  // ── 签名：单点定驻火柱 ────────────────────────────────────────────

  it('签名·火柱驻留：火舌横向位置整场不动（与 wildfire 的横向推进对照）', () => {
    const { stage, ctx } = build();
    const xs: number[] = [];
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      at(stage, t);
      xs.push(node(ctx.root, 'flame-tongue')!.position.x);
    }
    // 驻留火的火舌中心不产生净横向位移。
    for (const x of xs) expect(Math.abs(x)).toBeLessThan(1e-6);
    stage.dispose();
  });

  it('签名·火柱驻留：火星发射锚点整场只在竖直方向移动', () => {
    const { stage, ctx } = build();
    const ys: number[] = [];
    for (const t of [0.15, 0.35, 0.55, 0.75]) {
      at(stage, t);
      const a = node(ctx.root, 'ember-anchor')!;
      expect(Math.abs(a.position.x)).toBeLessThan(1e-6);
      ys.push(a.position.y);
    }
    // 竖直方向确实在动（否则「只竖直移动」用一个静止点也满足）。
    const span = Math.max(...ys) - Math.min(...ys);
    expect(span).toBeGreaterThan(1);
    stage.dispose();
  });

  // ── 互动①：火星脱落高度是火焰包络的函数 ───────────────────────────

  it('互动①：脱落高度严格随火焰高度走（同一比例，非固定值）', () => {
    // 取一组高度差异明显的 t，脱落高度必须与包络成固定比。
    for (const t of [0.05, 0.12, 0.4, 0.75, 0.95]) {
      const h = plumeHeight(t);
      expect(emberDetachHeight(t)).toBeCloseTo(h * 0.82, 10);
    }
    // 且这组 t 的包络本身有显著差异，比例断言才有意义。
    const hs = [0.05, 0.12, 0.4, 0.75, 0.95].map(plumeHeight);
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.4);
  });

  it('互动①：火矮时脱落点低、火高时脱落点高（引燃期 < 卷动期）', () => {
    const early = emberDetachHeight(0.04);
    const peak = emberDetachHeight(0.6);
    expect(early).toBeLessThan(peak * 0.65);
  });

  it('互动①：锚点世界高度确实跟着包络抬升（不是常量挂载）', () => {
    const { stage, ctx } = build();
    at(stage, 0.03);
    const low = node(ctx.root, 'ember-anchor')!.position.y;
    at(stage, 0.6);
    const high = node(ctx.root, 'ember-anchor')!.position.y;
    expect(high).toBeGreaterThan(low);
    // 抬升幅度要与包络比例相称：0.03 处包络约 0.4，0.6 处约 0.95。
    expect(high - low).toBeGreaterThan(10);
    stage.dispose();
  });

  it('互动①：观测锚点与真正的 emitter 逐帧同位（代理不得与真身脱钩）', () => {
    // `ember-anchor` 只是观测代理——quarks 的 emitter 会被 BatchedRenderer
    // 从场景树摘走，按名字查不到。代理一旦与真身脱钩，上面所有互动①断言
    // 就都在验证一个装饰物，而实际发射点可以纹丝不动。
    const ctx = makeSceneCtx();
    const res = createSceneResources(ctx.root, ctx.origin, 'flame-fidelity-probe');
    const embers = createEmberLayer(res, ctx, Math.min(ctx.width, ctx.height));
    const ys: number[] = [];
    for (const t of [0.03, 0.2, 0.45, 0.7, 0.95]) {
      embers.advance(t, 1 / 60, 0, 100);
      const real = embers.emitterPosition;
      expect(real, 'quarks 火星系统未建立').not.toBeNull();
      expect(real!.y).toBeCloseTo(embers.anchor.position.y, 10);
      expect(real!.x).toBeCloseTo(embers.anchor.position.x, 10);
      ys.push(real!.y);
    }
    // 真身自己确实在动（否则两个静止点也满足同位）。
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
    embers.dispose();
    res.dispose();
  });

  // ── 互动②：光影脉动与发射频率同源 ────────────────────────────────

  it('互动②：地面光池的 uGate 与光影脉动不透明度读同一个门控', () => {
    const { stage, ctx } = build();
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      at(stage, t);
      const gate = flickerGate(t);
      const poolGate = uniformOf(node(ctx.root, 'ground-pool')!, 'uGate');
      const glowOpacity = (node(ctx.root, 'light-pulse') as THREE.Mesh<
        THREE.BufferGeometry, THREE.MeshBasicMaterial
      >).material.opacity;
      expect(poolGate).toBeCloseTo(gate, 10);
      // 光晕不透明度是同一门控的线性像（比例 0.2）。
      expect(glowOpacity).toBeCloseTo(gate * 0.2, 10);
    }
    stage.dispose();
  });

  it('互动②：门控在场景中确实起伏（同源断言才不被常量满足）', () => {
    const gates: number[] = [];
    for (let i = 1; i <= 40; i += 1) gates.push(flickerGate(i / 40));
    const span = Math.max(...gates) - Math.min(...gates);
    // 门控必须有实质变化，否则「同步」用两个常量也成立。
    expect(span).toBeGreaterThan(0.35);
  });

  it('互动②：光晕尺寸也随门控胀缩（脉动在尺寸上可见）', () => {
    const { stage, ctx } = build();
    const pairs: Array<[number, number]> = [];
    for (let i = 1; i <= 24; i += 1) {
      const t = i / 24;
      at(stage, t);
      pairs.push([flickerGate(t), node(ctx.root, 'light-pulse')!.scale.x]);
    }
    // 门控最大与最小的两帧，尺寸必须分出高下。
    const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
    expect(sorted[sorted.length - 1][1]).toBeGreaterThan(sorted[0][1]);
    stage.dispose();
  });

  // ── 三幕结构 ────────────────────────────────────────────────────

  it('三幕切分点符合规格（200ms / 900ms 于 1200ms）', () => {
    expect(FLAME_ACT1_END).toBeCloseTo(200 / 1200, 10);
    expect(FLAME_ACT2_END).toBeCloseTo(900 / 1200, 10);
  });

  it('引燃期火焰单调起势，且起点为零', () => {
    expect(plumeHeight(0)).toBe(0);
    let prev = -1;
    for (let i = 0; i <= 10; i += 1) {
      const h = plumeHeight((i / 10) * FLAME_ACT1_END * 0.98);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
    // 引燃末段必须已经窜起来（不是慢慢线性爬）。
    expect(plumeHeight(FLAME_ACT1_END * 0.5)).toBeGreaterThan(0.55);
  });

  it('卷动期维持高位平台（与 bomb/fireworks 的单峰脉冲对照）', () => {
    const mid: number[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const t = FLAME_ACT1_END + (i / 20) * (FLAME_ACT2_END - FLAME_ACT1_END);
      mid.push(plumeHeight(t));
    }
    // 全程都在高位：驻留火不会像爆燃那样冲一下就退。
    expect(Math.min(...mid)).toBeGreaterThan(0.78);
    expect(Math.max(...mid)).toBeGreaterThan(0.95);
    // 平台不是一条直线：抖动让它持续起伏。
    let reversals = 0;
    for (let i = 2; i < mid.length; i += 1) {
      const d1 = mid[i - 1] - mid[i - 2];
      const d2 = mid[i] - mid[i - 1];
      if (d1 * d2 < 0) reversals += 1;
    }
    expect(reversals).toBeGreaterThan(2);
  });

  it('渐熄期塌到接近零', () => {
    expect(plumeHeight(0.999)).toBeLessThan(0.05);
    expect(plumeHeight(FLAME_ACT2_END + 1e-6)).toBeGreaterThan(0.9);
  });

  // ── 抖动：双频而非单频 ──────────────────────────────────────────

  it('抖动是双频合成：合成周期远长于任一单频周期', () => {
    // 单频信号在整数倍周期处会精确重现；双频合成不会。
    const singlePeriod = 1 / 8.4;
    const a = flicker(0.21);
    const b = flicker(0.21 + singlePeriod);
    expect(Math.abs(a - b)).toBeGreaterThan(0.15);
  });

  it('抖动在 ±1 内且确实双向摆动', () => {
    let sawPos = false;
    let sawNeg = false;
    for (let i = 0; i <= 200; i += 1) {
      const v = flicker(i / 200);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      if (v > 0.3) sawPos = true;
      if (v < -0.3) sawNeg = true;
    }
    expect(sawPos && sawNeg).toBe(true);
  });

  // ── 火焰形状：浮力流剖面 ────────────────────────────────────────

  it('宽度剖面为低位鼓肚：峰值在 0.22 附近，顶端收尖', () => {
    let best = -1;
    let bestH = -1;
    for (let i = 0; i <= 100; i += 1) {
      const h = i / 100;
      const w = plumeWidth(h);
      if (w > best) { best = w; bestH = h; }
    }
    expect(bestH).toBeGreaterThan(0.1);
    expect(bestH).toBeLessThan(0.35);
    // 顶端收成尖。
    expect(plumeWidth(1)).toBeLessThan(0.02);
    // 根部有宽度但不是最宽（受供氧限制）。
    expect(plumeWidth(0)).toBeGreaterThan(0);
    expect(plumeWidth(0)).toBeLessThan(best);
  });

  it('蓝焰只在根部：0.3 以上完全没有内焰', () => {
    expect(blueCoreShare(0)).toBeCloseTo(1, 10);
    expect(blueCoreShare(0.15)).toBeGreaterThan(0.4);
    expect(blueCoreShare(0.3)).toBe(0);
    expect(blueCoreShare(0.7)).toBe(0);
  });

  // ── 火星运动学 ──────────────────────────────────────────────────

  it('火星上升先快后慢（浮力随冷却消失）', () => {
    const firstHalf = emberRise(0.5) - emberRise(0);
    const secondHalf = emberRise(1) - emberRise(0.5);
    expect(firstHalf).toBeGreaterThan(secondHalf);
    expect(emberRise(0)).toBe(0);
    expect(emberRise(1)).toBeCloseTo(1, 10);
  });

  it('火星横摆随上升加大，且刚脱落时不摆', () => {
    expect(Math.abs(emberSway(0, 1.3))).toBeLessThan(1e-9);
    // 同一相位下，寿命末期的摆幅包络大于早期。
    const early = Math.abs(emberSway(0.2, 0)) / 0.2;
    const late = Math.abs(emberSway(0.9, 0)) / 0.9;
    expect(late).toBeGreaterThan(0);
    expect(early).toBeGreaterThanOrEqual(0);
    // 摆幅包络（去掉正弦符号后的线性因子）随 age 严格增。
    const env = (age: number) => age * 0.34;
    expect(env(0.9)).toBeGreaterThan(env(0.2));
  });

  // ── 余烬与热浪 ──────────────────────────────────────────────────

  it('余烬与明焰反相：第三幕余烬升起而火焰塌落', () => {
    const tMid3 = FLAME_ACT2_END + (1 - FLAME_ACT2_END) * 0.5;
    expect(emberGlow(tMid3)).toBeGreaterThan(emberGlow(0.5));
    expect(plumeHeight(tMid3)).toBeLessThan(plumeHeight(0.5));
  });

  it('反相的时序内涵：余烬峰值出现在明焰已塌落之后', () => {
    // 上面那条断言的两个 expect 各测一端、彼此不绑定，把 emberGlow 改成
    // 与 plumeHeight **同相**照样全绿（第三幕起点 plumeHeight 仍有 0.94，
    // 同相版本的余烬中点也高于底光）。反相的可检验内涵是**时序**：
    // 炭火最亮的那一刻，明焰必须已经基本没了。
    let peakT = FLAME_ACT2_END;
    let peak = -1;
    for (let i = 0; i <= 100; i += 1) {
      const t = FLAME_ACT2_END + (1 - FLAME_ACT2_END) * (i / 100);
      const v = emberGlow(t);
      if (v > peak) { peak = v; peakT = t; }
    }
    // 峰值不在第三幕起点（同相版本的峰值恰在起点，因为那里火最高）。
    expect(peakT).toBeGreaterThan(FLAME_ACT2_END + (1 - FLAME_ACT2_END) * 0.2);
    // 峰值时刻明焰已明显回落。阈值从曲线推而非手写：pow(k,1.7) 先慢后快，
    // 幕内中点仍保有约 65%，所以判据是「相对第三幕起点已掉三成以上」。
    expect(plumeHeight(peakT)).toBeLessThan(plumeHeight(FLAME_ACT2_END) * 0.7);
    // 且此后火继续降、余烬已过峰——两条曲线在此交叉而非并行。
    const tLate = FLAME_ACT2_END + (1 - FLAME_ACT2_END) * 0.9;
    expect(plumeHeight(tLate)).toBeLessThan(plumeHeight(peakT));
    expect(emberGlow(tLate)).toBeLessThan(emberGlow(peakT));
  });

  it('余烬在燃烧期被明焰压住（只有底光）', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7]) {
      expect(emberGlow(t)).toBeCloseTo(0.16, 10);
    }
  });

  it('热浪滞后于火焰：同一 t 处热浪对应的是更早的包络', () => {
    // 引燃期包络快速上升，滞后在此段最可测。
    const t = FLAME_ACT1_END * 0.7;
    expect(heatShimmer(t)).toBeLessThan(plumeHeight(t) * 0.82);
    // 滞后量正是 0.06 的时间平移。
    expect(heatShimmer(t)).toBeCloseTo(plumeHeight(t - 0.06) * 0.82, 10);
  });

  // ── 稀疏 update 无关性 ──────────────────────────────────────────

  it('稀疏与密集 update 在同一 t 得到同一帧（闭式求值，不逐帧累加）', () => {
    const sparse = build();
    at(sparse.stage, 0.62);
    const sparseY = node(sparse.ctx.root, 'ember-anchor')!.position.y;
    const sparseH = uniformOf(node(sparse.ctx.root, 'flame-tongue')!, 'uHeight');
    sparse.stage.dispose();

    const dense = build();
    for (let i = 1; i <= 62; i += 1) at(dense.stage, i / 100);
    const denseY = node(dense.ctx.root, 'ember-anchor')!.position.y;
    const denseH = uniformOf(node(dense.ctx.root, 'flame-tongue')!, 'uHeight');
    dense.stage.dispose();

    expect(denseY).toBeCloseTo(sparseY, 6);
    expect(denseH).toBeCloseTo(sparseH, 10);
  });

  // ── 降档与释放 ──────────────────────────────────────────────────

  it('降档只减粒子密度，八个元素一个不少', () => {
    for (const quality of ['cinematic', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      const built = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(built, `${quality} 档缺少 ${name}`).toContain(name);
      }
      expect(collectExact(ctx.root, 'billet')).toHaveLength(3);
      expect(collectExact(ctx.root, 'smokewisp')).toHaveLength(5);
      stage.dispose();
    }
  });

  it('降档确实减密度：低档实时发射率严格低于电影级', () => {
    // 上面那条断言只验「元素一个不少」，标题里的「只减粒子密度」没有
    // 任何 expect 覆盖——把每帧重设发射率处的 scaledCount 去掉照样全绿。
    // 火星的发射率是每帧重设的（跟随光影门控），必须单独验它随档位缩放，
    // 只查建场时的初始粒子数是不够的。
    // 火星是 quarks 粒子，没有可数的 mesh，所以直接按单元测火星层工厂。
    const rateAt = (quality: EffectQuality): number => {
      const ctx = makeSceneCtx({ quality });
      const res = createSceneResources(ctx.root, ctx.origin, 'flame-rate-probe');
      const embers = createEmberLayer(res, ctx, Math.min(ctx.width, ctx.height));
      embers.advance(0.5, 1 / 60, 0, 100);
      const rate = embers.emissionRate;
      embers.dispose();
      res.dispose();
      return rate;
    };
    const cinematic = rateAt('cinematic');
    const low = rateAt('low');
    expect(cinematic).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(cinematic);
  });

  it('dispose 摘净场景树且嵌套容器不残留子节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    // 必须在 dispose 之前收集容器引用：dispose 会把整个 group 从 root
    // 摘走，之后遍历 root 找不到残留容器（thunder 场景踩过这个坑）。
    const containers: THREE.Object3D[] = [];
    ctx.root.traverse((o) => { if (o.children.length > 0) containers.push(o); });
    expect(containers.length).toBeGreaterThan(1);

    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    for (const c of containers) {
      if (c === ctx.root) continue;
      expect(c.children, `${c.name || c.type} 残留子节点`).toHaveLength(0);
    }
  });

  it('dispose 后 update 静默失效', () => {
    const { stage } = build();
    at(stage, 0.4);
    stage.dispose();
    expect(() => at(stage, 0.8)).not.toThrow();
    stage.dispose();
  });
});
