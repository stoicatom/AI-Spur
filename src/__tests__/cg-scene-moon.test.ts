import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-moon';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  MOON_ACT1_END,
  MOON_ACT2_END,
  arcSweepAngle,
  moonCenterY,
} from '../overlay/cg-scenes/cg-moon';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 15 的 8 个构成件的具名节点（月尘由 quarks 承载，单独验）。 */
const NAMED_ELEMENTS = [
  'moon-disc',      // ① 月面
  'moon-arc',       // ③ 月出弧光
  'halo-0',         // ② 月晕弧（三圈之一）
  'halo-pulse-ring',// ⑦ 光晕脉动环
  'meteor-0',       // ④ 碎星陨
  'cloud-0',        // ⑤ 夜云半掩
  'moon-pool',      // ⑧ 地面月光池
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('moon');
  if (!scene) throw new Error('moon 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** 走到某个 t：now 用 t 换算成毫秒，保持与 ctx.now=0 同一时间轴。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/**
 * 两角之间的最短弧长（0–π）。
 *
 * `(d + π) % 2π - π` 这种写法在 JS 里对负数会失效（`%` 保留符号），
 * 必须先把余数抬正再取，否则整圈差会被算成 2π 而不是 0。
 */
function angleGap(a: number, b: number): number {
  const two = Math.PI * 2;
  const d = (((a - b) % two) + two) % two;
  return Math.min(d, two - d);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定 `名字-数字` 全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

describe('场景 15 moon（月晕弧光）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('moon');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('天体升沉');
    expect(scene!.config.preset).toBe('arc');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    // 月晕是三圈，脉动环是独立的第四圈。
    expect(collectExact(ctx.root, 'halo')).toHaveLength(3);
    expect(node(ctx.root, 'halo-pulse-ring')).toBeDefined();
    stage.dispose();
  });

  // 签名：全库唯一的「天体升沉」。主体必须真的有一条升起轨迹，
  // 而不是原地淡入——所以断言咬的是位置单调性，不是透明度。
  it('签名·月轮自地平线下单调升起（不是原地淡入）', () => {
    const height = 1080;
    const topY = height * 0.12;
    const samples = [0, 0.05, 0.1, 0.15, 0.2, MOON_ACT1_END].map((t) => moonCenterY(t, topY, height));

    // 起点必须在地平线下（负值且低于画面下半）。
    expect(samples[0]).toBeLessThan(-height * 0.4);
    // 逐段严格上升。
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i], `t 序号 ${i}`).toBeGreaterThan(samples[i - 1]);
    }
    // 第一幕末必须升到位（接近 topY）。
    expect(Math.abs(samples[samples.length - 1] - topY)).toBeLessThan(height * 0.02);
  });

  it('签名·末幕月轮回落配合云掩月（升沉的"沉"）', () => {
    const height = 1080;
    const topY = height * 0.12;
    const held = moonCenterY(MOON_ACT2_END, topY, height);
    const sunk = moonCenterY(1, topY, height);
    expect(sunk).toBeLessThan(held);
  });

  it('月轮位置在运行期真的跟着 moonCenterY 走', () => {
    const { stage, ctx } = build();
    const ys: number[] = [];
    for (const t of [0.02, 0.1, 0.2, MOON_ACT1_END]) {
      at(stage, t);
      ys.push(node(ctx.root, 'moon-disc').position.y);
    }
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i], `帧 ${i}`).toBeGreaterThan(ys[i - 1]);
    }
    stage.dispose();
  });

  // 弧光必须「扫过」：中心角单调推进且跨度足够大。
  // 若实现把 uSweep 写成常量，这条会红。
  it('弧光中心角在第二幕单调扫过一大圈', () => {
    const angles = [0, 0.2, 0.4, 0.6, 0.8, 1].map(arcSweepAngle);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i], `段 ${i}`).toBeGreaterThan(angles[i - 1]);
    }
    // 扫掠总跨度 > π，才称得上「横贯」。
    expect(angles[angles.length - 1] - angles[0]).toBeGreaterThan(Math.PI);
  });

  it('弧光只在第二幕点亮，首末幕熄灭', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    expect(uniformOf(node(ctx.root, 'moon-arc'), 'uAlpha')).toBe(0);
    at(stage, (MOON_ACT1_END + MOON_ACT2_END) / 2);
    expect(uniformOf(node(ctx.root, 'moon-arc'), 'uAlpha')).toBeGreaterThan(0.5);
    at(stage, 0.98);
    expect(uniformOf(node(ctx.root, 'moon-arc'), 'uAlpha')).toBe(0);
    stage.dispose();
  });

  // 互动① 云层变亮由弧带方位驱动：弧带扫到某层云的方位时那层才亮。
  // 若实现写成「整幕齐亮」，两层云的峰值时刻会重合，这条会红。
  it('互动·两层云的最亮时刻不同（弧带扫过才亮，非整幕齐亮）', () => {
    const { stage, ctx } = build();
    const peaks = [0, 0];
    const peakAt = [0, 0];
    for (let i = 0; i <= 40; i += 1) {
      const t = MOON_ACT1_END + (MOON_ACT2_END - MOON_ACT1_END) * (i / 40);
      at(stage, t);
      for (let c = 0; c < 2; c += 1) {
        const flash = uniformOf(node(ctx.root, `cloud-${c}`), 'uFlash');
        if (flash > peaks[c]) {
          peaks[c] = flash;
          peakAt[c] = t;
        }
      }
    }
    // 两层都真的被照亮过。
    expect(peaks[0]).toBeGreaterThan(0.1);
    expect(peaks[1]).toBeGreaterThan(0.1);
    // 峰值时刻必须分离——这是「扫过」的可观测特征。
    expect(Math.abs(peakAt[0] - peakAt[1])).toBeGreaterThan(0.03);
    stage.dispose();
  });

  it('互动·云层加厚发生在末幕（掩月）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const midDensity = uniformOf(node(ctx.root, 'cloud-0'), 'uDensity');
    const midY = node(ctx.root, 'cloud-0').position.y;
    at(stage, 0.98);
    const endDensity = uniformOf(node(ctx.root, 'cloud-0'), 'uDensity');
    const endY = node(ctx.root, 'cloud-0').position.y;
    expect(endDensity).toBeGreaterThan(midDensity);
    // 云上移才能遮住月轮。
    expect(endY).toBeGreaterThan(midY);
    stage.dispose();
  });

  // 互动② 月尘沿弧线坠落：尘粒发射点必须锁在弧带头部，
  // 即发射点角度与 uSweep 一致，且到月心距离基本恒定（在弧上）。
  it('互动·月尘发射点跟着弧带头部沿弧线走', () => {
    const { stage, ctx } = build();
    const radii: number[] = [];
    const angleGaps: number[] = [];
    for (let i = 1; i < 8; i += 1) {
      const t = MOON_ACT1_END + (MOON_ACT2_END - MOON_ACT1_END) * (i / 8);
      at(stage, t);
      const [, act2] = [0, (t - MOON_ACT1_END) / (MOON_ACT2_END - MOON_ACT1_END)];
      const sweep = arcSweepAngle(act2);
      const moonY = node(ctx.root, 'moon-disc').position.y;
      // 月尘锚点与发射器同步（quarks 会把 emitter 从树里摘走，
      // 锚点是场景树里唯一可定位的发射点镜像）。
      const dust = node(ctx.root, 'moondust-anchor');
      const p = dust.position;
      const dx = p.x;
      const dy = p.y - moonY;
      radii.push(Math.hypot(dx, dy));
      const actual = Math.atan2(dy, dx);
      angleGaps.push(angleGap(actual, sweep));
    }
    // 角度必须跟弧带一致（沿弧走）。
    for (const gap of angleGaps) {
      expect(gap).toBeLessThan(0.05);
    }
    // 半径基本恒定（在同一条弧上，不是径向乱飞）。
    const min = Math.min(...radii);
    const max = Math.max(...radii);
    expect(max - min).toBeLessThan(max * 0.05);
    stage.dispose();
  });

  it('碎星陨错峰划过，各自只亮一段', () => {
    const { stage, ctx } = build();
    const litWindows: number[] = [];
    for (let m = 0; m < 3; m += 1) {
      let lit = 0;
      for (let i = 0; i <= 60; i += 1) {
        at(stage, i / 60);
        if (opacity(node(ctx.root, `meteor-${m}`)) > 0.05) lit += 1;
      }
      litWindows.push(lit);
    }
    // 每颗都亮过，但都不是全程常亮。
    for (const lit of litWindows) {
      expect(lit).toBeGreaterThan(0);
      expect(lit).toBeLessThan(30);
    }
    stage.dispose();
  });

  it('碎星陨沿自身方向直线飞行', () => {
    const { stage, ctx } = build();
    const positions: THREE.Vector3[] = [];
    for (const t of [0.08, 0.1, 0.12, 0.14]) {
      at(stage, t);
      positions.push(node(ctx.root, 'meteor-0').position.clone());
    }
    // 逐帧位移方向一致（直线）。
    const d1 = positions[1].clone().sub(positions[0]).normalize();
    const d2 = positions[3].clone().sub(positions[2]).normalize();
    expect(d1.dot(d2)).toBeGreaterThan(0.99);
    // 而且真的在移动。
    expect(positions[3].distanceTo(positions[0])).toBeGreaterThan(1);
    stage.dispose();
  });

  it('月光池随月升亮起，末幕收敛', () => {
    const { stage, ctx } = build();
    at(stage, 0.02);
    const early = uniformOf(node(ctx.root, 'moon-pool'), 'uAlpha');
    at(stage, MOON_ACT1_END);
    const risen = uniformOf(node(ctx.root, 'moon-pool'), 'uAlpha');
    at(stage, 0.99);
    const late = uniformOf(node(ctx.root, 'moon-pool'), 'uAlpha');
    expect(risen).toBeGreaterThan(early);
    expect(late).toBeLessThan(risen);
    stage.dispose();
  });

  it('月晕与脉动环跟着月轮一起升（同体运动）', () => {
    const { stage, ctx } = build();
    at(stage, 0.05);
    const lowMoon = node(ctx.root, 'moon-disc').position.y;
    const lowHalo = node(ctx.root, 'halo-0').position.y;
    const lowPulse = node(ctx.root, 'halo-pulse-ring').position.y;
    at(stage, MOON_ACT1_END);
    const highMoon = node(ctx.root, 'moon-disc').position.y;
    const highHalo = node(ctx.root, 'halo-0').position.y;
    const highPulse = node(ctx.root, 'halo-pulse-ring').position.y;

    expect(lowHalo).toBeCloseTo(lowMoon, 5);
    expect(lowPulse).toBeCloseTo(lowMoon, 5);
    expect(highHalo).toBeCloseTo(highMoon, 5);
    expect(highPulse).toBeCloseTo(highMoon, 5);
    expect(highHalo).toBeGreaterThan(lowHalo);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, MOON_ACT1_END * 0.5);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (MOON_ACT1_END + MOON_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档只减粒子密度，8 个命名元素一个不少', () => {
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
    // 碎星陨与月晕这类结构件数量不随档位变。
    expect(collectExact(lo.ctx.root, 'meteor')).toHaveLength(collectExact(hi.ctx.root, 'meteor').length);
    expect(collectExact(lo.ctx.root, 'halo')).toHaveLength(collectExact(hi.ctx.root, 'halo').length);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树摘净且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.7)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
  });
});
