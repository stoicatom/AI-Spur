/**
 * 场景 37 bullwhip 验收。
 *
 * 两条签名各自独立取证：
 * ① 链段 + 音爆——相位滞后沿段序严格单增、鞭鞘效应放大梢速、
 *    音爆时刻可从 tipSpeed 反解且随参数变化、音爆环源点 = 音爆瞬间梢的位置。
 * ② 阻尼摆动衰减——连续摆动峰幅度比恒定（指数特征）、末态趋静不突然归零。
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBullwhipStage } from '../overlay/cg-scenes/cg-bullwhip';
import { GHOST_SEGMENTS } from '../overlay/cg-scenes/bullwhip-parts';
import {
  CHAIN_SEGMENTS,
  CRACK_SPEED,
  LAG_SPAN,
  SEGMENT_LENGTH,
  WHIP_ACT1_END,
  WHIP_ACT2_END,
  crackOrigin,
  crackTime,
  handSpeed,
  jointSpeed,
  segmentAngle,
  segmentLag,
  segmentPos,
  segmentStroke,
  tipPeakSpeed,
  tipSpeed,
} from '../overlay/cg-scenes/whip-chain';
import {
  DECAY_TAU_S,
  SWAY_AMPLITUDE,
  SWAY_HZ,
  swayAngle,
  swayDecayRatio,
  swayEnvelope,
  swayExtremumTime,
} from '../overlay/cg-scenes/whip-damping';
import { makeSceneCtx, names, node, opacity, uniformOf } from './cg-scene-harness';

const ELEMENTS = [
  'lash-0', 'tip-glow', 'sonic-ring', 'spark-anchor',
  'acoustic-ring', 'ghostseg-0', 'hand-silhouette', 'ground-vortex',
];

function run(t: number, quality: 'cinematic' | 'high' | 'medium' | 'low' = 'cinematic') {
  const ctx = makeSceneCtx({ quality });
  const stage = createBullwhipStage(ctx);
  stage.update(t, t * 1100, quality);
  return { ctx, stage };
}

describe('bullwhip 元素完备', () => {
  it('8 元素各有具名节点', () => {
    const { ctx, stage } = run(0.5);
    const tree = names(ctx.root);
    for (const name of ELEMENTS) expect(tree).toContain(name);
    stage.dispose();
  });

  it('链段铺满 CHAIN_SEGMENTS 段，残影 GHOST_SEGMENTS 段', () => {
    const { ctx, stage } = run(0.3);
    const tree = names(ctx.root).split('|');
    expect(tree.filter((n) => n.startsWith('lash-')).length).toBe(CHAIN_SEGMENTS);
    expect(tree.filter((n) => n.startsWith('ghostseg-')).length).toBe(GHOST_SEGMENTS);
    stage.dispose();
  });

  it('鞭身与残影前缀互不包含（防前缀匹配测错对象）', () => {
    expect('ghostseg-0'.startsWith('lash-')).toBe(false);
    expect('lash-0'.startsWith('ghostseg-')).toBe(false);
    // 环也要分得开：sonic 与 acoustic 不能互为前缀。
    expect('acoustic-ring'.startsWith('sonic-ring')).toBe(false);
  });
});

describe('签名① 链段波传播：相位滞后严格单增', () => {
  it('segmentLag 沿段序严格单增', () => {
    for (let i = 1; i < CHAIN_SEGMENTS; i += 1) {
      expect(segmentLag(i)).toBeGreaterThan(segmentLag(i - 1));
    }
  });

  it('手端段无滞后，梢端段滞后恰为 LAG_SPAN', () => {
    expect(segmentLag(0)).toBeCloseTo(0, 10);
    expect(segmentLag(CHAIN_SEGMENTS - 1)).toBeCloseTo(LAG_SPAN, 10);
  });

  it('滞后总跨度非零——否则整鞭齐动，不是波传播', () => {
    const spanLag = segmentLag(CHAIN_SEGMENTS - 1) - segmentLag(0);
    expect(spanLag).toBeGreaterThan(0.1);
  });

  it('相邻滞后差沿链递减（指数锥度：梢端传得更快）', () => {
    const diffs: number[] = [];
    for (let i = 1; i < CHAIN_SEGMENTS; i += 1) diffs.push(segmentLag(i) - segmentLag(i - 1));
    for (let i = 1; i < diffs.length; i += 1) {
      expect(diffs[i]).toBeLessThan(diffs[i - 1]);
    }
  });

  it('波真的在传：手端段先转到位，梢端段此刻还没动', () => {
    // 取手端段刚转完的时刻。
    const tHandDone = segmentLag(0) + segmentStroke(0);
    const handTurned = Math.abs(segmentAngle(0, tHandDone) - segmentAngle(0, 0));
    const tipTurned = Math.abs(
      segmentAngle(CHAIN_SEGMENTS - 1, tHandDone) - segmentAngle(CHAIN_SEGMENTS - 1, 0),
    );
    expect(handTurned).toBeGreaterThan(1.0);
    expect(tipTurned).toBeLessThan(handTurned * 0.5);
  });

  it('每段的转角起始时刻沿链推后（逐段接力）', () => {
    // 段 i 在 segmentLag(i) 之前一定没动过。
    for (let i = 0; i < CHAIN_SEGMENTS; i += 1) {
      const before = segmentLag(i) - 1e-6;
      if (before <= 0) continue;
      expect(segmentAngle(i, before)).toBeCloseTo(segmentAngle(i, 0), 9);
    }
  });
});

describe('签名① 鞭鞘效应：梢速远大于手端', () => {
  it('梢速峰值远超手端峰值（不是一根匀速摆动的棍）', () => {
    let handPeak = 0;
    for (let n = 0; n <= 2000; n += 1) handPeak = Math.max(handPeak, handSpeed(n / 2000));
    // 匀质棍绕手端转时峰值比 = 长度比（≤ 24）；链段的行程压缩把它推到 40 倍以上。
    expect(tipPeakSpeed() / handPeak).toBeGreaterThan(30);
  });

  it('各关节速度峰值沿链严格单增', () => {
    const peaks: number[] = [];
    for (let i = 0; i <= CHAIN_SEGMENTS; i += 1) {
      let p = 0;
      for (let n = 0; n <= 1200; n += 1) p = Math.max(p, jointSpeed(i, n / 1200));
      peaks.push(p);
    }
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
    }
  });

  it('段行程沿链递减——鞭鞘效应的来源', () => {
    for (let i = 1; i < CHAIN_SEGMENTS; i += 1) {
      expect(segmentStroke(i)).toBeLessThan(segmentStroke(i - 1));
    }
  });

  it('段长恒定：链是刚性的，不是可拉伸的带面', () => {
    for (const t of [0, 0.2, crackTime(), 0.8]) {
      for (let i = 0; i < CHAIN_SEGMENTS; i += 1) {
        const a = segmentPos(i, t);
        const b = segmentPos(i + 1, t);
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(SEGMENT_LENGTH, 10);
      }
    }
  });
});

describe('签名① 音爆时刻反解自洽', () => {
  it('crackTime 处梢速恰等于 CRACK_SPEED', () => {
    expect(tipSpeed(crackTime())).toBeCloseTo(CRACK_SPEED, 6);
  });

  it('音爆前梢速不足阈值，音爆后曾经超过', () => {
    expect(tipSpeed(crackTime() - 0.01)).toBeLessThan(CRACK_SPEED);
    expect(tipPeakSpeed()).toBeGreaterThan(CRACK_SPEED);
  });

  it('音爆时刻落在第二幕内（音爆幕），不是硬编码在别处', () => {
    expect(crackTime()).toBeGreaterThan(WHIP_ACT1_END);
    expect(crackTime()).toBeLessThan(WHIP_ACT2_END);
  });

  it('梢速在上升沿单增——保证反解的根唯一', () => {
    const ct = crackTime();
    let prev = -1;
    for (let n = 0; n <= 1500; n += 1) {
      const v = tipSpeed((ct * n) / 1500);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('音爆时刻随阈值而动——证明它是解出来的，不是常数', () => {
    // 同一条 tipSpeed 曲线上，阈值越高、穿过得越晚。
    // 只在上升沿上二分（峰后梢速回落，越过峰会解到另一条支上）。
    let peakAt = 0;
    let peak = 0;
    for (let n = 0; n <= 2000; n += 1) {
      const t = n / 2000;
      const v = tipSpeed(t);
      if (v > peak) { peak = v; peakAt = t; }
    }
    const solveAt = (target: number): number => {
      let lo = 0;
      let hi = peakAt;
      for (let k = 0; k < 60; k += 1) {
        const mid = (lo + hi) / 2;
        if (tipSpeed(mid) < target) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const tLow = solveAt(CRACK_SPEED * 0.6);
    const tHigh = solveAt(CRACK_SPEED * 1.35);
    expect(tLow).toBeLessThan(crackTime());
    expect(tHigh).toBeGreaterThan(crackTime());
    // 三个阈值必须解出三个不同时刻——写死常数时这条必红。
    expect(Math.abs(tHigh - tLow)).toBeGreaterThan(0.01);
  });
});

describe('签名① 音爆环源点 = 音爆瞬间梢的位置', () => {
  it('crackOrigin 等于 segmentPos(尖, crackTime())', () => {
    const tip = segmentPos(CHAIN_SEGMENTS, crackTime());
    expect(crackOrigin().x).toBeCloseTo(tip.x, 12);
    expect(crackOrigin().y).toBeCloseTo(tip.y, 12);
  });

  it('源点远离屏心——不是偷懒放在原点', () => {
    const { ctx, stage } = run(0.5);
    const ring = node(ctx.root, 'sonic-ring');
    // 场景 group 对齐 origin(0,0)，故 ring 的 local 位置即相对屏心的偏移。
    expect(Math.hypot(ring.position.x, ring.position.y)).toBeGreaterThan(
      Math.min(ctx.width, ctx.height) * 0.1,
    );
    stage.dispose();
  });

  it('音爆环与声纹同源点（同一次音爆的两种表现）', () => {
    const { ctx, stage } = run(0.5);
    const ring = node(ctx.root, 'sonic-ring');
    const acoustic = node(ctx.root, 'acoustic-ring');
    expect(acoustic.position.x).toBeCloseTo(ring.position.x, 9);
    expect(acoustic.position.y).toBeCloseTo(ring.position.y, 9);
    stage.dispose();
  });

  it('火花也从音爆点崩出，不是从手端', () => {
    const { ctx, stage } = run(0.5);
    const spark = node(ctx.root, 'spark-anchor');
    const ring = node(ctx.root, 'sonic-ring');
    expect(spark.position.x).toBeCloseTo(ring.position.x, 6);
    expect(spark.position.y).toBeCloseTo(ring.position.y, 6);
    stage.dispose();
  });

  it('源点跟着梢端走：换阈值则源点位置随之改变', () => {
    // 用较低阈值反解出的更早时刻，梢还在别处。
    const earlier = crackTime() - 0.06;
    const p = segmentPos(CHAIN_SEGMENTS, earlier);
    const o = crackOrigin();
    expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeGreaterThan(0.02);
  });
});

describe('签名② 阻尼摆动指数衰减', () => {
  it('连续摆动峰的幅度比恒定（指数特征，不是线性递减）', () => {
    const amps = [0, 1, 2, 3, 4].map((n) => Math.abs(swayAngle(swayExtremumTime(n))));
    const ratios: number[] = [];
    for (let i = 1; i < amps.length; i += 1) ratios.push(amps[i] / amps[i - 1]);
    // 每一个比值都等于同一个常数——线性递减做不到这一点。
    for (const r of ratios) expect(r).toBeCloseTo(swayDecayRatio(), 8);
    // 比值之间彼此相等（线性衰减时后面的比值会明显更小）。
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]).toBeCloseTo(ratios[0], 8);
    }
  });

  it('摆动峰幅度严格递减，且比值恒小于 1', () => {
    const amps = [0, 1, 2, 3, 4, 5].map((n) => Math.abs(swayAngle(swayExtremumTime(n))));
    for (let i = 1; i < amps.length; i += 1) expect(amps[i]).toBeLessThan(amps[i - 1]);
    expect(swayDecayRatio()).toBeLessThan(1);
    expect(swayDecayRatio()).toBeGreaterThan(0);
  });

  it('线性递减会被这条断言排除', () => {
    // 若把包络换成线性 (1 - s/τ)，相邻峰比 = (1-s2/τ)/(1-s1/τ)，随 n 单减。
    const linear = (s: number): number => Math.max(0, SWAY_AMPLITUDE * (1 - s / DECAY_TAU_S));
    const lin = [0, 1, 2].map((n) => linear(swayExtremumTime(n)));
    const linRatios = [lin[1] / lin[0], lin[2] / lin[1]];
    // 线性时两个比值不相等——这正是本场景断言能区分的地方。
    expect(Math.abs(linRatios[0] - linRatios[1])).toBeGreaterThan(0.05);
  });

  it('确实在振荡：摆动过零、左右交替', () => {
    const signs = [0, 1, 2, 3].map((n) => Math.sign(swayAngle(swayExtremumTime(n))));
    for (let i = 1; i < signs.length; i += 1) {
      expect(signs[i]).toBe(-signs[i - 1]);
    }
  });

  it('末态趋于静止但不突然归零', () => {
    const tail = swayEnvelope(0.7);
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThan(SWAY_AMPLITUDE * 0.02);
    // 更晚仍严格为正——exp 不会到 0。
    expect(swayEnvelope(1.2)).toBeGreaterThan(0);
    expect(swayEnvelope(1.2)).toBeLessThan(tail);
  });

  it('音爆前没有摆动', () => {
    expect(swayAngle(-0.1)).toBe(0);
    expect(swayAngle(0)).toBe(0);
  });

  it('包络严格单减，且 τ 处恰衰到 1/e', () => {
    expect(swayEnvelope(DECAY_TAU_S) / SWAY_AMPLITUDE).toBeCloseTo(Math.exp(-1), 10);
    let prev = Infinity;
    for (let n = 0; n <= 60; n += 1) {
      const v = swayEnvelope(n / 60);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it('摆动峰间隔为半周期（频率自洽）', () => {
    const gap = swayExtremumTime(1) - swayExtremumTime(0);
    expect(gap).toBeCloseTo(1 / (2 * SWAY_HZ), 12);
  });

  it('鞭身摆动由枢轴承载：音爆后枢轴转角非零并随时间衰减', () => {
    const first = run(crackTime() + 0.03);
    const rigEarly = node(first.ctx.root, 'sway-rig').rotation.z;
    first.stage.dispose();
    expect(Math.abs(rigEarly)).toBeGreaterThan(1e-4);

    const later = run(0.98);
    const rigLate = node(later.ctx.root, 'sway-rig').rotation.z;
    later.stage.dispose();
    expect(Math.abs(rigLate)).toBeLessThan(Math.abs(rigEarly));
  });
});

describe('bullwhip 三幕', () => {
  it('第一幕：扬鞭，鞭身可见而音爆环未起', () => {
    const { ctx, stage } = run(0.12);
    expect(opacity(node(ctx.root, 'lash-0'))).toBeGreaterThan(0);
    expect(uniformOf(node(ctx.root, 'sonic-ring'), 'uAlpha')).toBe(0);
    expect(uniformOf(node(ctx.root, 'acoustic-ring'), 'uAlpha')).toBe(0);
    stage.dispose();
  });

  it('第二幕：音爆后激波与声纹都亮起', () => {
    const { ctx, stage } = run(crackTime() + 0.05);
    expect(uniformOf(node(ctx.root, 'sonic-ring'), 'uAlpha')).toBeGreaterThan(0);
    expect(uniformOf(node(ctx.root, 'acoustic-ring'), 'uAlpha')).toBeGreaterThan(0);
    stage.dispose();
  });

  it('两环都在外扩：uProgress 随时间单增，且激波跑在声纹之前', () => {
    const ct = crackTime();
    const sonic: number[] = [];
    const acoustic: number[] = [];
    for (const dt of [0.02, 0.08, 0.16, 0.26]) {
      const { ctx, stage } = run(ct + dt);
      sonic.push(uniformOf(node(ctx.root, 'sonic-ring'), 'uProgress'));
      acoustic.push(uniformOf(node(ctx.root, 'acoustic-ring'), 'uProgress'));
      stage.dispose();
    }
    // 冻住半径（uProgress 写常数）时这两条必红。
    for (let i = 1; i < sonic.length; i += 1) {
      expect(sonic[i]).toBeGreaterThan(sonic[i - 1]);
      expect(acoustic[i]).toBeGreaterThan(acoustic[i - 1]);
    }
    // 激波寿命短、扩得快；声纹跑得远、衰得慢 —— 同源两种波不能同速。
    for (let i = 0; i < sonic.length; i += 1) {
      expect(sonic[i]).toBeGreaterThan(acoustic[i]);
    }
  });

  it('音爆前两环半径均为 0（没有提前铺开）', () => {
    const { ctx, stage } = run(0.1);
    expect(uniformOf(node(ctx.root, 'sonic-ring'), 'uProgress')).toBe(0);
    expect(uniformOf(node(ctx.root, 'acoustic-ring'), 'uProgress')).toBe(0);
    stage.dispose();
  });

  it('梢光点在音爆瞬间最亮（过曝）', () => {
    const at = run(crackTime() + 0.004);
    const flash = opacity(node(at.ctx.root, 'tip-glow'));
    at.stage.dispose();
    const late = run(0.95);
    const dim = opacity(node(late.ctx.root, 'tip-glow'));
    late.stage.dispose();
    expect(flash).toBeGreaterThan(dim);
  });

  it('第三幕：激波已散，鞭身淡出但未归零', () => {
    const { ctx, stage } = run(0.98);
    expect(uniformOf(node(ctx.root, 'sonic-ring'), 'uAlpha')).toBeLessThan(0.1);
    expect(opacity(node(ctx.root, 'lash-0'))).toBeGreaterThan(0);
    stage.dispose();
  });

  it('气流在音爆后被搅起，第三幕逐渐退去', () => {
    const early = run(crackTime() + 0.02);
    const strong = uniformOf(node(early.ctx.root, 'ground-vortex'), 'uAlpha');
    early.stage.dispose();
    const late = run(0.99);
    const weak = uniformOf(node(late.ctx.root, 'ground-vortex'), 'uAlpha');
    late.stage.dispose();
    expect(strong).toBeGreaterThan(weak);
  });

  it('手部剪影全程可见（持柄的手不会消失）', () => {
    for (const t of [0.05, 0.4, 0.99]) {
      const { ctx, stage } = run(t);
      expect(opacity(node(ctx.root, 'hand-silhouette'))).toBeGreaterThan(0);
      stage.dispose();
    }
  });
});

describe('bullwhip 闭式求值', () => {
  it('稀疏 update 与密集 update 在同一 t 同帧', () => {
    const target = 0.72;
    const sparse = makeSceneCtx();
    const sparseStage = createBullwhipStage(sparse);
    sparseStage.update(target, target * 1100, 'cinematic');

    const dense = makeSceneCtx();
    const denseStage = createBullwhipStage(dense);
    for (let n = 1; n <= 60; n += 1) {
      const t = (target * n) / 60;
      denseStage.update(t, t * 1100, 'cinematic');
    }

    // 姿态：逐帧累加会让两条路径分叉。
    for (let i = 0; i < CHAIN_SEGMENTS; i += 1) {
      const a = node(sparse.root, `lash-${i}`);
      const b = node(dense.root, `lash-${i}`);
      expect(b.position.x).toBeCloseTo(a.position.x, 9);
      expect(b.position.y).toBeCloseTo(a.position.y, 9);
      expect(b.rotation.z).toBeCloseTo(a.rotation.z, 9);
    }
    const rigA = node(sparse.root, 'sway-rig').rotation.z;
    const rigB = node(dense.root, 'sway-rig').rotation.z;
    expect(rigB).toBeCloseTo(rigA, 9);
    const tipA = node(sparse.root, 'tip-glow');
    const tipB = node(dense.root, 'tip-glow');
    expect(tipB.position.x).toBeCloseTo(tipA.position.x, 9);
    expect(tipB.position.y).toBeCloseTo(tipA.position.y, 9);

    sparseStage.dispose();
    denseStage.dispose();
  });

  it('乱序回放同一 t 得同一帧（无隐藏状态）', () => {
    const ctx = makeSceneCtx();
    const stage = createBullwhipStage(ctx);
    stage.update(0.45, 495, 'cinematic');
    const forward = node(ctx.root, 'lash-12').rotation.z;
    stage.update(0.9, 990, 'cinematic');
    stage.update(0.45, 495, 'cinematic');
    expect(node(ctx.root, 'lash-12').rotation.z).toBeCloseTo(forward, 12);
    stage.dispose();
  });
});

describe('bullwhip 降档', () => {
  const QUALITIES = ['cinematic', 'high', 'medium', 'low'] as const;

  it('8 元素在所有档位一个不少', () => {
    for (const quality of QUALITIES) {
      const { ctx, stage } = run(0.5, quality);
      const tree = names(ctx.root);
      for (const name of ELEMENTS) expect(tree).toContain(name);
      stage.dispose();
    }
  });

  it('链段数是签名载体：low 档仍是 CHAIN_SEGMENTS 段', () => {
    for (const quality of QUALITIES) {
      const { ctx, stage } = run(0.5, quality);
      const tree = names(ctx.root).split('|');
      expect(tree.filter((n) => n.startsWith('lash-')).length).toBe(CHAIN_SEGMENTS);
      expect(tree.filter((n) => n.startsWith('ghostseg-')).length).toBe(GHOST_SEGMENTS);
      stage.dispose();
    }
  });

  it('降档不改签名数学：音爆时刻与源点与档位无关', () => {
    const ct = crackTime();
    const origin = crackOrigin();
    for (const quality of QUALITIES) {
      const { ctx, stage } = run(0.5, quality);
      const ring = node(ctx.root, 'sonic-ring');
      const first = run(0.5, 'cinematic');
      const ref = node(first.ctx.root, 'sonic-ring');
      expect(ring.position.x).toBeCloseTo(ref.position.x, 9);
      expect(ring.position.y).toBeCloseTo(ref.position.y, 9);
      first.stage.dispose();
      stage.dispose();
    }
    expect(crackTime()).toBe(ct);
    expect(crackOrigin().x).toBe(origin.x);
  });

  it('低档鞭身姿态与电影级一致', () => {
    const low = run(0.6, 'low');
    const cine = run(0.6, 'cinematic');
    for (let i = 0; i < CHAIN_SEGMENTS; i += 1) {
      const a = node(low.ctx.root, `lash-${i}`);
      const b = node(cine.ctx.root, `lash-${i}`);
      expect(a.rotation.z).toBeCloseTo(b.rotation.z, 12);
    }
    low.stage.dispose();
    cine.stage.dispose();
  });
});

describe('bullwhip dispose', () => {
  it('dispose 后场景树摘净且递归清空', () => {
    const ctx = makeSceneCtx();
    const stage = createBullwhipStage(ctx);
    stage.update(0.5, 550, 'cinematic');
    // 容器引用必须在 dispose 前收集：dispose 后取不到节点。
    const containers = [node(ctx.root, 'sway-rig'), node(ctx.root, 'bullwhip-scene')];
    const lashNodes = [node(ctx.root, 'lash-0'), node(ctx.root, 'ghostseg-0')];
    expect(containers[0].children.length).toBeGreaterThan(0);

    stage.dispose();
    expect(ctx.root.children.length).toBe(0);
    for (const c of containers) expect(c.children.length).toBe(0);
    for (const n of lashNodes) expect(n.children.length).toBe(0);
  });

  it('dispose 幂等，且 dispose 后 update 静默失效', () => {
    const ctx = makeSceneCtx();
    const stage = createBullwhipStage(ctx);
    stage.update(0.4, 440, 'cinematic');
    stage.dispose();
    stage.dispose();
    expect(() => stage.update(0.6, 660, 'cinematic')).not.toThrow();
    expect(ctx.root.children.length).toBe(0);
  });

  it('几何体与材质被释放', () => {
    const ctx = makeSceneCtx();
    const stage = createBullwhipStage(ctx);
    stage.update(0.5, 550, 'cinematic');
    const mesh = node(ctx.root, 'lash-0') as THREE.Mesh;
    let disposed = 0;
    mesh.geometry.addEventListener('dispose', () => { disposed += 1; });
    stage.dispose();
    expect(disposed).toBe(1);
  });
});
