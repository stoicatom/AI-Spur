import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-guitar';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  GUITAR_ACT1_END,
  GUITAR_ACT2_END,
  sweepLight,
  waveRadius,
} from '../overlay/cg-scenes/cg-guitar';
import {
  BRIDGE_DELAY,
  RADIATE_DELAY,
  acousticChain,
  harmonicNodes,
  stringDisplacement,
  stringEnvelope,
} from '../overlay/cg-scenes/guitar-acoustics';
import { STRING_SEGMENTS } from '../overlay/cg-scenes/guitar-parts';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 19 的 8 个构成件的具名节点（碎尘由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'guitar-body',      // ① 琴身
  'gstring-0',        // ② 琴弦
  'wave-0',           // ④ 音浪环（③弦波传导由弦顶点位移承载）
  'pick-flash',       // ⑤ 拨片闪光
  'body-resonance',   // ⑥ 共鸣光
  'overtone-0',       // ⑦ 泛音点
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('guitar');
  if (!scene) throw new Error('guitar 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/**
 * 精确正则收集。
 *
 * 前缀撞车会让断言测错对象却照样通过（本项目真实事故：`shard-` 同时
 * 命中刚体与反光片）。琴弦故意命名 `gstring-` 而非 `string-`，
 * 避免与其它以 string 开头的节点混淆。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 读一根弦当前的顶点 y 序列。 */
function stringShape(root: THREE.Object3D, index: number): number[] {
  const line = node(root, `gstring-${index}`) as THREE.Line;
  const attr = line.geometry.getAttribute('position');
  const ys: number[] = [];
  for (let i = 0; i < attr.count; i += 1) ys.push(attr.getY(i));
  return ys;
}

describe('场景 19 guitar（声弦）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('guitar');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('弦振传波');
    expect(scene!.config.preset).toBe('pulse');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    // 六弦、四环。
    expect(collectExact(ctx.root, 'gstring')).toHaveLength(6);
    expect(collectExact(ctx.root, 'wave')).toHaveLength(4);
    expect(collectExact(ctx.root, 'overtone').length).toBeGreaterThan(5);
    stage.dispose();
  });

  // 签名核心：弦→腔→环三段串联，峰值时刻必须依次滞后。
  // 若三层各跑一条曲线，峰值会重合或次序错乱，这条红。
  it('签名·三段传导链的峰值时刻依次滞后（弦→腔→环）', () => {
    const pluckAt = 0.02;
    let sPeak = 0; let sAt = 0;
    let bPeak = 0; let bAt = 0;
    let rPeak = 0; let rAt = 0;
    for (let i = 0; i <= 400; i += 1) {
      const t = i / 400;
      const c = acousticChain(t, pluckAt);
      if (c.string > sPeak) { sPeak = c.string; sAt = t; }
      if (c.body > bPeak) { bPeak = c.body; bAt = t; }
      if (c.radiate > rPeak) { rPeak = c.radiate; rAt = t; }
    }
    // 三段都真的有能量。
    expect(sPeak).toBeGreaterThan(0.9);
    expect(bPeak).toBeGreaterThan(0.5);
    expect(rPeak).toBeGreaterThan(0.4);
    // 严格依次滞后。
    expect(bAt, `弦 ${sAt} / 腔 ${bAt}`).toBeGreaterThan(sAt);
    expect(rAt, `腔 ${bAt} / 环 ${rAt}`).toBeGreaterThan(bAt);
    // 滞后量与声明的延时一致（容差一个采样步）。
    expect(Math.abs((bAt - sAt) - BRIDGE_DELAY)).toBeLessThan(0.01);
    expect(Math.abs((rAt - bAt) - RADIATE_DELAY)).toBeLessThan(0.01);
  });

  it('签名·切断弦振则下游两段必然归零（真串联，不是并联）', () => {
    // 拨弦之前：三段全为零。
    const before = acousticChain(0.005, 0.02);
    expect(before.string).toBe(0);
    expect(before.body).toBe(0);
    expect(before.radiate).toBe(0);

    // 弦振为零的任意时刻，下游也必须为零。
    for (const t of [0, 0.001, 0.01]) {
      const c = acousticChain(t, 0.05);
      if (c.string === 0) {
        expect(c.body, `t=${t} 弦停腔却响`).toBe(0);
        expect(c.radiate, `t=${t} 弦停环响`).toBe(0);
      }
    }
  });

  it('签名·每级传导都有损耗（幅度递减）', () => {
    // 取链最活跃的时刻比较三段峰值。
    let best = { s: 0, b: 0, r: 0 };
    for (let i = 0; i <= 400; i += 1) {
      const c = acousticChain(i / 400, 0.02);
      if (c.string + c.body + c.radiate > best.s + best.b + best.r) {
        best = { s: c.string, b: c.body, r: c.radiate };
      }
    }
    // 峰值序列递减：能量逐级损耗。
    const peaks = [0, 0, 0];
    for (let i = 0; i <= 400; i += 1) {
      const c = acousticChain(i / 400, 0.02);
      peaks[0] = Math.max(peaks[0], c.string);
      peaks[1] = Math.max(peaks[1], c.body);
      peaks[2] = Math.max(peaks[2], c.radiate);
    }
    expect(peaks[1]).toBeLessThan(peaks[0]);
    expect(peaks[2]).toBeLessThan(peaks[1]);
  });

  // 弦是两端固定的驻波：端点必须恒为零。
  it('物理·弦两端固定（端点位移恒为零）', () => {
    for (const t of [0.05, 0.2, 0.5, 0.9]) {
      for (const h of [1, 2, 3]) {
        expect(stringDisplacement(0, t, 0.02, h, 62), `t=${t} h=${h} 左端`).toBeCloseTo(0, 10);
        expect(stringDisplacement(1, t, 0.02, h, 62), `t=${t} h=${h} 右端`).toBeCloseTo(0, 10);
      }
    }
  });

  it('物理·弦振幅按 exp 衰减（拨弦包络，不是常幅）', () => {
    // 取每个小窗口的振幅峰值，峰值序列必须单调下降。
    const peaks: number[] = [];
    for (let w = 0; w < 5; w += 1) {
      let peak = 0;
      for (let i = 0; i < 50; i += 1) {
        const t = 0.05 + w * 0.15 + (i / 50) * 0.15;
        peak = Math.max(peak, stringEnvelope(t, 0.02));
      }
      peaks.push(peak);
    }
    expect(peaks[0]).toBeGreaterThan(0.5);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i], `窗口 ${i} 未衰减`).toBeLessThan(peaks[i - 1]);
    }
  });

  it('物理·泛音点落在谐波波节上', () => {
    expect(harmonicNodes(1)).toEqual([]);
    expect(harmonicNodes(2)).toEqual([0.5]);
    expect(harmonicNodes(3)).toEqual([1 / 3, 2 / 3]);
    // 波节处 n 次谐波的模态为零。
    for (const h of [2, 3, 4]) {
      for (const x of harmonicNodes(h)) {
        expect(Math.abs(Math.sin(h * Math.PI * x)), `h=${h} x=${x}`).toBeLessThan(1e-9);
      }
    }
  });

  it('运行期弦形状真的在振（顶点序列逐帧变化且端点不动）', () => {
    const { stage, ctx } = build();
    at(stage, 0.06);
    const a = stringShape(ctx.root, 0);
    at(stage, 0.075);
    const b = stringShape(ctx.root, 0);

    expect(a).toHaveLength(STRING_SEGMENTS + 1);
    // 中段必须动。
    const mid = Math.floor(a.length / 2);
    expect(Math.abs(a[mid] - b[mid])).toBeGreaterThan(0.01);
    // 两端必须不动（驻波节点）。
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[a.length - 1]).toBeCloseTo(b[b.length - 1], 6);
    stage.dispose();
  });

  it('六弦依次拨响（扫弦，不是齐拨）', () => {
    const { stage, ctx } = build();
    const peakAt: number[] = [];
    for (let s = 0; s < 6; s += 1) {
      let peak = 0;
      let when = 0;
      for (let i = 0; i <= 120; i += 1) {
        const t = (i / 120) * 0.3;
        at(stage, t);
        const o = opacity(node(ctx.root, `gstring-${s}`));
        if (o > peak) { peak = o; when = t; }
      }
      expect(peak, `弦 ${s} 未响`).toBeGreaterThan(0.3);
      peakAt.push(when);
    }
    // 峰值时刻必须**严格**递增。用 >= 会让「六弦齐拨」（峰值全等）
    // 照样满足计数，扫弦断言随之失效——这条已由变异验证证实。
    const trace = peakAt.map((n) => n.toFixed(4)).join(',');
    for (let i = 1; i < peakAt.length; i += 1) {
      expect(peakAt[i], `峰序 ${trace} 在 ${i} 处未推进`).toBeGreaterThan(peakAt[i - 1]);
    }
    // 且首末间隔足够大（真的是一记扫弦，不是数值抖动）。
    expect(peakAt[5] - peakAt[0], `扫弦跨度 ${trace}`).toBeGreaterThan(0.02);
    stage.dispose();
  });

  // 音浪环必须线性外扩且四圈错峰发出。
  it('音浪环线性外扩，四圈错峰发出', () => {
    const launch = 0.07;
    // 单圈：半径随时间线性增长。
    const rs = [0.1, 0.2, 0.3, 0.4].map((t) => waveRadius(t, 0, launch));
    for (const r of rs) expect(r).toBeGreaterThan(0);
    const d1 = rs[1] - rs[0];
    const d2 = rs[3] - rs[2];
    // 线性：两段增量相等（声速恒定）。
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-9);

    // 四圈：同一时刻半径依次更小（后发的还在内圈）。
    const at05 = [0, 1, 2, 3].map((i) => waveRadius(0.5, i, launch));
    const visible = at05.filter((r) => r >= 0);
    expect(visible.length).toBeGreaterThan(1);
    for (let i = 1; i < visible.length; i += 1) {
      expect(visible[i], `环 ${i}`).toBeLessThan(visible[i - 1]);
    }
  });

  // 环的亮度必须由传导链驱动。写成常量（如 0.6）时，弦已完全衰减的
  // 末幕环仍会亮着——「弦振传波」就断在最后一环上。
  it('互动·环亮度由传导链驱动（弦停环暗）', () => {
    const { stage, ctx } = build();
    // 链最活跃时刻：某圈环应当明显亮。
    let busiest = 0;
    for (let i = 0; i <= 60; i += 1) {
      const t = (i / 60) * 0.6;
      at(stage, t);
      for (let w = 0; w < 4; w += 1) {
        busiest = Math.max(busiest, uniformOf(node(ctx.root, `wave-${w}`), 'uAlpha'));
      }
    }
    expect(busiest, '环从未被链点亮').toBeGreaterThan(0.15);

    // 找一个「环仍在飞行途中、但弦已基本衰减」的时刻做对照。
    // 环 3 发出于 0.07+3*0.13=0.46，飞行到 0.88；此时弦包络已很低。
    at(stage, 0.86);
    const lateRing = uniformOf(node(ctx.root, 'wave-3'), 'uAlpha');
    const lateChain = uniformOf(node(ctx.root, 'body-resonance'), 'uAlpha');
    // 环仍在半径窗口内（不是靠 radius<0 归零），亮度却已随链跌落。
    expect(uniformOf(node(ctx.root, 'wave-3'), 'uRadius')).toBeGreaterThan(0);
    expect(lateRing, `末段环 ${lateRing} 应随衰减`).toBeLessThan(busiest * 0.35);
    expect(lateChain).toBeLessThan(0.3);
    stage.dispose();
  });

  it('音浪环铺满全屏（末端半径覆盖屏缘）', () => {
    // 贴片是 1.5 倍屏幕，UV 0.5 即屏缘，环最大半径必须超过 1/3（=屏缘 UV 距离）。
    const maxR = waveRadius(0.07 + 0.42 - 1e-6, 0, 0.07);
    expect(maxR).toBeGreaterThan(1 / 3);
  });

  it('环未发出时不可见（uAlpha 与 uRadius 归零）', () => {
    const { stage, ctx } = build();
    at(stage, 0.01);
    for (let i = 0; i < 4; i += 1) {
      expect(uniformOf(node(ctx.root, `wave-${i}`), 'uAlpha'), `环 ${i}`).toBe(0);
    }
    stage.dispose();
  });

  // 互动① 环扫到才亮：sweepLight 是纯函数因果本体。
  it('互动·泛音点只在环扫到时亮（环没到就不亮）', () => {
    // 环在 0.3，点在 0.3：全亮。
    expect(sweepLight(0.3, 0.3)).toBeCloseTo(1, 6);
    // 环在 0.1，点在 0.5：环还没到，不亮。
    expect(sweepLight(0.1, 0.5)).toBe(0);
    // 环已过（0.9 vs 0.5）：也不亮。
    expect(sweepLight(0.9, 0.5)).toBe(0);
    // 环未发出：不亮。
    expect(sweepLight(-1, 0.3)).toBe(0);
    // 窄带内单峰：越接近越亮。
    expect(sweepLight(0.32, 0.3)).toBeLessThan(sweepLight(0.305, 0.3));
  });

  it('互动·运行期泛音点确实被环扫亮（有亮起窗口且不是全程常亮）', () => {
    const { stage, ctx } = build();
    let lit = 0;
    let peak = 0;
    const total = 90;
    for (let i = 0; i <= total; i += 1) {
      const t = (i / total) * GUITAR_ACT2_END;
      at(stage, t);
      const o = opacity(node(ctx.root, 'overtone-0'));
      if (o > 0.15) lit += 1;
      peak = Math.max(peak, o);
    }
    expect(peak, '泛音点从未被扫亮').toBeGreaterThan(0.3);
    // 亮过，但不是全程常亮。
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(total * 0.8);
    stage.dispose();
  });

  it('互动·共鸣光滞后于弦振（链的第二段）', () => {
    const { stage, ctx } = build();
    let stringPeak = 0; let stringAt = 0;
    let bodyPeak = 0; let bodyAt = 0;
    for (let i = 0; i <= 120; i += 1) {
      const t = (i / 120) * 0.5;
      at(stage, t);
      const s = opacity(node(ctx.root, 'gstring-0'));
      if (s > stringPeak) { stringPeak = s; stringAt = t; }
      const b = uniformOf(node(ctx.root, 'body-resonance'), 'uAlpha');
      if (b > bodyPeak) { bodyPeak = b; bodyAt = t; }
    }
    expect(bodyPeak).toBeGreaterThan(0.2);
    expect(bodyAt, `弦峰 ${stringAt} / 腔峰 ${bodyAt}`).toBeGreaterThan(stringAt);
    stage.dispose();
  });

  it('拨片闪光在每根弦被拨时闪一下（不是常亮）', () => {
    const { stage, ctx } = build();
    let lit = 0;
    let peak = 0;
    for (let i = 0; i <= 100; i += 1) {
      at(stage, i / 100);
      const o = opacity(node(ctx.root, 'pick-flash'));
      if (o > 0.1) lit += 1;
      peak = Math.max(peak, o);
    }
    expect(peak).toBeGreaterThan(0.4);
    // 只在拨弦段亮（前 ~10% 幕），不是全程。
    expect(lit).toBeLessThan(25);
    stage.dispose();
  });

  it('琴身抖动幅度跟随弦振（弦停身静）', () => {
    const { stage, ctx } = build();
    at(stage, 0.08);
    const busy = uniformOf(node(ctx.root, 'guitar-body'), 'uShake');
    at(stage, 0.99);
    const calm = uniformOf(node(ctx.root, 'guitar-body'), 'uShake');
    expect(busy).toBeGreaterThan(0.3);
    expect(calm).toBeLessThan(busy * 0.3);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, GUITAR_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (GUITAR_ACT1_END + GUITAR_ACT2_END) / 2);
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
    at(hi.stage, 0.4);
    const hiTree = names(hi.ctx.root);

    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.4);
    const loTree = names(lo.ctx.root);

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    expect(collectExact(lo.ctx.root, 'gstring')).toHaveLength(collectExact(hi.ctx.root, 'gstring').length);
    expect(collectExact(lo.ctx.root, 'wave')).toHaveLength(collectExact(hi.ctx.root, 'wave').length);
    expect(collectExact(lo.ctx.root, 'overtone')).toHaveLength(collectExact(hi.ctx.root, 'overtone').length);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树摘净且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.7)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
  });
});
