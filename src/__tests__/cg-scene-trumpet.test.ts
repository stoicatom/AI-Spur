import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-trumpet';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  TRUMPET_ACT1_END,
  TRUMPET_ACT2_END,
  pipeFront,
} from '../overlay/cg-scenes/cg-trumpet';
import {
  HORN_AXIS,
  HORN_HALF_ANGLE,
  HORN_RING_FIRST,
  HORN_RING_INTERVAL,
  HORN_RING_TRAVEL,
  VALVE_PRESSES,
  hornGain,
  hornRingRadius,
  valveEnergy,
  valveExcite,
} from '../overlay/cg-scenes/trumpet-horn';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 23 的 8 个构成件的具名节点（音符粒子由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'trumpet-body',   // ① 喇叭
  'hring-0',        // ② 号口音波
  'valve-0',        // ③ 按键光点
  'note-anchor',    // ④ 音符粒子（发射锚点）
  'gleam-0',        // ⑤ 金属光泽
  'pipe-wave',      // ⑥ 共鸣管波
  'gold-wash',      // ⑦ 号声金光
  'stage-curtain',  // ⑧ 背景暖幕
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('trumpet');
  if (!scene) throw new Error('trumpet 场景未注册');
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

describe('场景 23 trumpet（号角鸣奏）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('trumpet');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('定向号口');
    expect(scene!.config.preset).toBe('ring');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'hring')).toHaveLength(3);
    expect(collectExact(ctx.root, 'valve')).toHaveLength(3);
    expect(collectExact(ctx.root, 'gleam')).toHaveLength(4);
    stage.dispose();
  });

  // 签名核心：定向。轴向能量必须比背向高一个数量级。
  // 若实现写成全向均匀（bell 那样），这条会红。
  it('签名·号口定向：轴向增益比背向高一个数量级', () => {
    const axis = hornGain(HORN_AXIS);
    const back = hornGain(HORN_AXIS + Math.PI);
    expect(axis).toBeCloseTo(1, 6);
    expect(back, `背向增益 ${back}`).toBeLessThan(0.05);
    expect(axis / back, `轴背比 ${axis / back}`).toBeGreaterThan(10);
  });

  it('签名·增益随偏离轴向单调下降（主瓣形状）', () => {
    const offsets = [0, 0.2, 0.4, 0.6, 0.85, 1.2, 1.8];
    const gains = offsets.map((o) => hornGain(HORN_AXIS + o));
    for (let i = 1; i < gains.length; i += 1) {
      expect(gains[i], `偏离 ${offsets[i]}`).toBeLessThan(gains[i - 1]);
    }
    // 主瓣边缘（半角处）已降到轴向的一半以下。
    expect(hornGain(HORN_AXIS + HORN_HALF_ANGLE)).toBeLessThan(0.5);
  });

  it('签名·增益对轴向左右对称（号口是轴对称的）', () => {
    for (const off of [0.2, 0.5, 0.9, 1.4]) {
      const left = hornGain(HORN_AXIS - off);
      const right = hornGain(HORN_AXIS + off);
      expect(left, `偏离 ${off}`).toBeCloseTo(right, 9);
    }
  });

  // 对照 bell：bell 的环是四面均匀的，trumpet 必须不是。
  // 这条锁住两个声学场景的机制不趋同。
  it('对照 bell·同一半径上各方位增益差异显著（不是均匀圆环）', () => {
    const samples: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      samples.push(hornGain((i / 16) * Math.PI * 2));
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    // 均匀环的 max/min 会接近 1，定向号口必须差距悬殊。
    expect(max / min, `方位增益比 ${max / min}`).toBeGreaterThan(10);
  });

  it('运行期环波 shader 收到号口轴与主瓣半角', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    for (let i = 0; i < 3; i += 1) {
      const ring = node(ctx.root, `hring-${i}`);
      expect(uniformOf(ring, 'uAxis'), `环 ${i} 轴向`).toBeCloseTo(HORN_AXIS, 9);
      expect(uniformOf(ring, 'uHalfAngle'), `环 ${i} 半角`).toBeCloseTo(HORN_HALF_ANGLE, 9);
    }
    stage.dispose();
  });

  // 环波必须线性外扩且三圈错峰。
  it('号口环波线性外扩、三圈错峰喷出', () => {
    // 单圈：半径随时间线性增长。
    const rs = [0.05, 0.15, 0.25, 0.35].map((d) => hornRingRadius(HORN_RING_FIRST + d, 0));
    for (const r of rs) expect(r).toBeGreaterThan(0);
    for (let i = 1; i < rs.length; i += 1) {
      expect(rs[i], `段 ${i}`).toBeGreaterThan(rs[i - 1]);
    }
    const d1 = rs[1] - rs[0];
    const d2 = rs[3] - rs[2];
    // 线性：两段增量相等且非零。常量半径的增量恒为 0 也满足「相等」，
    // 所以必须先断严格递增（上面）再断增量相等。
    expect(d1).toBeGreaterThan(0);
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-9);

    // 三圈：同一时刻半径依次更小（后发的还在内圈）。
    const t = HORN_RING_FIRST + HORN_RING_INTERVAL * 2 + 0.05;
    const visible = [0, 1, 2].map((i) => hornRingRadius(t, i)).filter((r) => r >= 0);
    expect(visible.length).toBeGreaterThan(1);
    for (let i = 1; i < visible.length; i += 1) {
      expect(visible[i], `圈 ${i}`).toBeLessThan(visible[i - 1]);
    }
  });

  it('环未发出或已越出时返回 -1（不该亮）', () => {
    expect(hornRingRadius(0.05, 0)).toBe(-1);
    expect(hornRingRadius(HORN_RING_FIRST + HORN_RING_TRAVEL + 0.01, 0)).toBe(-1);
    const { stage, ctx } = build();
    at(stage, 0.05);
    for (let i = 0; i < 3; i += 1) {
      expect(uniformOf(node(ctx.root, `hring-${i}`), 'uAlpha'), `环 ${i}`).toBe(0);
    }
    stage.dispose();
  });

  it('全屏：环波铺到屏缘（末端半径超过屏缘 UV 距离）', () => {
    // 贴片 1.5 倍屏幕，UV 1/3 即屏缘。
    const maxR = hornRingRadius(HORN_RING_FIRST + HORN_RING_TRAVEL - 1e-6, 0);
    expect(maxR).toBeGreaterThan(1 / 3);
  });

  // 互动① 按键激励推高环波幅度。
  it('互动·三按键依次按下（错峰，不是齐按）', () => {
    const peakAt: number[] = [];
    for (let v = 0; v < 3; v += 1) {
      let peak = 0;
      let when = 0;
      for (let i = 0; i <= 200; i += 1) {
        const t = i / 200;
        const e = valveExcite(t, v);
        if (e > peak) { peak = e; when = t; }
      }
      expect(peak, `按键 ${v} 未按下`).toBeGreaterThan(0.9);
      peakAt.push(when);
    }
    // 峰值时刻严格递增。用 >= 会让「齐按」（峰值全等）照样满足。
    for (let i = 1; i < peakAt.length; i += 1) {
      expect(peakAt[i], `峰序 ${peakAt.join(',')}`).toBeGreaterThan(peakAt[i - 1]);
    }
    // 与声明的按下时刻一致。
    for (let i = 0; i < 3; i += 1) {
      expect(Math.abs(peakAt[i] - (VALVE_PRESSES[i] + 0.035))).toBeLessThan(0.02);
    }
  });

  it('互动·环波幅度由按键激励推高（不按只剩底噪）', () => {
    const { stage, ctx } = build();
    // 找一个「环在飞行途中且按键激励为零」的时刻做对照。
    // 环 0 飞行窗口 0.22–0.68；VALVE_PRESSES[0]=0.3 起，之前是空档。
    at(stage, 0.25);
    const quietAlpha = uniformOf(node(ctx.root, 'hring-0'), 'uAlpha');
    const quietLoad = valveEnergy(0.25);
    expect(quietLoad, '该时刻应无按键激励').toBe(0);

    // 按键峰值时刻：同一圈环仍在飞行，幅度必须显著更高。
    at(stage, 0.34);
    const loudAlpha = uniformOf(node(ctx.root, 'hring-0'), 'uAlpha');
    expect(valveEnergy(0.34), '该时刻应有按键激励').toBeGreaterThan(0.5);
    expect(uniformOf(node(ctx.root, 'hring-0'), 'uRadius'), '环应仍在飞行')
      .toBeGreaterThan(0);

    expect(loudAlpha, `静 ${quietAlpha} / 响 ${loudAlpha}`).toBeGreaterThan(quietAlpha * 2);
    stage.dispose();
  });

  it('互动·按键光点在各自按下时亮起（不是常亮）', () => {
    const { stage, ctx } = build();
    for (let v = 0; v < 3; v += 1) {
      let lit = 0;
      let peak = 0;
      for (let i = 0; i <= 100; i += 1) {
        at(stage, i / 100);
        const o = opacity(node(ctx.root, `valve-${v}`));
        if (o > 0.5) lit += 1;
        peak = Math.max(peak, o);
      }
      expect(peak, `按键 ${v} 未亮`).toBeGreaterThan(0.7);
      // 亮过但不是全程。
      expect(lit, `按键 ${v} 常亮`).toBeLessThan(30);
    }
    stage.dispose();
  });

  // 互动② 音符从环波波前剥离：锚点半径必须跟最外圈环同步。
  it('互动·音符发射点锁在环波波前上（不是固定在号口）', () => {
    const { stage, ctx } = build();
    const mouth = node(ctx.root, 'trumpet-body').position;
    const radii: number[] = [];
    for (let i = 1; i < 7; i += 1) {
      const t = HORN_RING_FIRST + (HORN_RING_TRAVEL * i) / 8;
      at(stage, t);
      const p = node(ctx.root, 'note-anchor').position;
      radii.push(Math.hypot(p.x - mouth.x, p.y - mouth.y));
    }
    // 随环外扩，发射点离号口越来越远。
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i], `半径 ${radii.map((n) => n.toFixed(0)).join(',')}`)
        .toBeGreaterThan(radii[i - 1]);
    }
    // 跨度显著（真的跟着波前走）。
    expect(radii[radii.length - 1] - radii[0]).toBeGreaterThan(100);
    stage.dispose();
  });

  it('互动·音符剥离方位落在号口主瓣内（不是全向撒）', () => {
    const { stage, ctx } = build();
    const body = node(ctx.root, 'trumpet-body').position;
    for (let i = 1; i < 8; i += 1) {
      const t = HORN_RING_FIRST + (HORN_RING_TRAVEL * i) / 9;
      at(stage, t);
      const p = node(ctx.root, 'note-anchor').position;
      const angle = Math.atan2(p.y - body.y, p.x - body.x);
      const two = Math.PI * 2;
      const raw = (((angle - HORN_AXIS) % two) + two) % two;
      const off = Math.min(raw, two - raw);
      expect(off, `t=${t.toFixed(3)} 偏离轴向 ${off}`).toBeLessThan(HORN_HALF_ANGLE);
    }
    stage.dispose();
  });

  it('共鸣管波自喉向口反复行进（位置周期性推进）', () => {
    const fronts = [0, 0.04, 0.08, 0.12].map(pipeFront);
    for (let i = 1; i < fronts.length; i += 1) {
      expect(fronts[i], `段 ${i}`).toBeGreaterThan(fronts[i - 1]);
    }
    // 跑完一趟后回到喉端（周期性）。
    expect(pipeFront(0.16)).toBeCloseTo(0, 6);

    const { stage, ctx } = build();
    at(stage, 0.05);
    const a = uniformOf(node(ctx.root, 'pipe-wave'), 'uFront');
    at(stage, 0.1);
    const b = uniformOf(node(ctx.root, 'pipe-wave'), 'uFront');
    expect(b).toBeGreaterThan(a);
    stage.dispose();
  });

  it('号声金光与幕布暖调随按键起伏（不是常量）', () => {
    const { stage, ctx } = build();
    at(stage, 0.25);
    const quietWash = uniformOf(node(ctx.root, 'gold-wash'), 'uAlpha');
    const quietGlow = uniformOf(node(ctx.root, 'stage-curtain'), 'uGlow');
    at(stage, 0.34);
    const loudWash = uniformOf(node(ctx.root, 'gold-wash'), 'uAlpha');
    const loudGlow = uniformOf(node(ctx.root, 'stage-curtain'), 'uGlow');
    expect(loudWash).toBeGreaterThan(quietWash);
    expect(loudGlow).toBeGreaterThan(quietGlow);
    stage.dispose();
  });

  it('金属光泽在管身上流动（各带亮度不同步）', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const ops = [0, 1, 2, 3].map((i) => opacity(node(ctx.root, `gleam-${i}`)));
    // 四条带子不该同时同亮（各有相位）。
    const distinct = new Set(ops.map((o) => o.toFixed(4)));
    expect(distinct.size, `亮度 ${ops.map((n) => n.toFixed(3)).join(',')}`).toBeGreaterThan(1);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, TRUMPET_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (TRUMPET_ACT1_END + TRUMPET_ACT2_END) / 2);
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
    expect(collectExact(lo.ctx.root, 'hring')).toHaveLength(collectExact(hi.ctx.root, 'hring').length);
    expect(collectExact(lo.ctx.root, 'valve')).toHaveLength(collectExact(hi.ctx.root, 'valve').length);

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
