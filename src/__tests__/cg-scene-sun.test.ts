import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-sun';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  SUN_ACT1_END,
  SUN_ACT2_END,
  curlEnergy,
  prominenceCurl,
} from '../overlay/cg-scenes/cg-sun';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 16 的 8 个构成件的具名节点（太空粒子由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'sun-core',       // ① 日核
  'prom-0',         // ② 日珥
  'corona-0',       // ③ 日冕
  'spot-0',         // ④ 光斑漂移
  'sun-haze',       // ⑤ 热浪
  'sun-pulse-ring', // ⑥ 日辉脉冲环
  'sun-uv-halo',    // ⑦ 紫外线光晕
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('sun');
  if (!scene) throw new Error('sun 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定 `名字-数字` 全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

describe('场景 16 sun（日冕辉光）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('sun');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('恒星');
    expect(scene!.config.signature).toContain('日珥卷曲');
    expect(scene!.config.preset).toBe('glow');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'prom')).toHaveLength(5);
    expect(collectExact(ctx.root, 'corona')).toHaveLength(3);
    expect(collectExact(ctx.root, 'spot')).toHaveLength(6);
    stage.dispose();
  });

  // 签名前半：日珥是「伸出-卷回」而非「淡入-淡出」。
  // 伸展量必须有单峰形态：先增后减，且回到 0。
  it('签名·单条日珥伸出后卷回（单峰，不是常亮）', () => {
    const samples: number[] = [];
    for (let i = 0; i <= 30; i += 1) samples.push(prominenceCurl(i / 30, 0.1));

    const peak = Math.max(...samples);
    const peakIdx = samples.indexOf(peak);
    expect(peak).toBeGreaterThan(0.9);
    // 峰值不在两端——两端为 0 才叫「伸出后卷回」。
    expect(peakIdx).toBeGreaterThan(0);
    expect(peakIdx).toBeLessThan(samples.length - 1);
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(0);
    // 峰前单调升、峰后单调降。
    for (let i = 1; i <= peakIdx; i += 1) {
      expect(samples[i], `升段 ${i}`).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    for (let i = peakIdx + 1; i < samples.length; i += 1) {
      expect(samples[i], `降段 ${i}`).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it('签名·五条日珥错峰喷发（不是齐射）', () => {
    const { stage, ctx } = build();
    const peakAt = [0, 0, 0, 0, 0];
    const peaks = [0, 0, 0, 0, 0];
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      at(stage, t);
      for (let p = 0; p < 5; p += 1) {
        const o = opacity(node(ctx.root, `prom-${p}`));
        if (o > peaks[p]) { peaks[p] = o; peakAt[p] = t; }
      }
    }
    for (let p = 0; p < 5; p += 1) {
      expect(peaks[p], `日珥 ${p} 未喷发`).toBeGreaterThan(0.2);
    }
    // 峰值时刻必须两两不同：这是「错峰」的可观测特征。
    const sorted = [...peakAt].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1], `相邻峰间隔 ${i}`).toBeGreaterThan(0.02);
    }
    stage.dispose();
  });

  it('日珥伸展量真的改几何缩放（长出来，不是原地淡入）', () => {
    const { stage, ctx } = build();
    const scales: number[] = [];
    const opacities: number[] = [];
    for (const t of [0.02, 0.1, 0.2, 0.35]) {
      at(stage, t);
      const m = node(ctx.root, 'prom-0');
      scales.push(m.scale.x);
      opacities.push(opacity(m));
    }
    // 缩放必须跟着变，不能恒定。
    expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.2);
    // 缩放与亮度同向（同源于伸展量）。
    const sMax = scales.indexOf(Math.max(...scales));
    const oMax = opacities.indexOf(Math.max(...opacities));
    expect(sMax).toBe(oMax);
    stage.dispose();
  });

  // 互动① 日珥卷起推高日冕：日冕亮度必须由卷曲总量驱动。
  // 若日冕自跑一条曲线，两者峰值时刻会脱钩，这条会红。
  it('互动·日冕亮度峰值与日珥卷曲总量峰值对齐', () => {
    const { stage, ctx } = build();
    let coronaPeak = 0;
    let coronaAt = 0;
    let curlPeak = 0;
    let curlAt = 0;
    const ats = [0, 0.0825, 0.165, 0.2475, 0.33];
    for (let i = 0; i <= 80; i += 1) {
      const t = i / 80;
      at(stage, t);
      const a = uniformOf(node(ctx.root, 'corona-0'), 'uAlpha');
      if (a > coronaPeak) { coronaPeak = a; coronaAt = t; }
      const c = curlEnergy(t, ats);
      if (c > curlPeak) { curlPeak = c; curlAt = t; }
    }
    expect(coronaPeak).toBeGreaterThan(0.15);
    // 两个峰必须落在同一时刻附近——「推高」的可观测特征。
    expect(Math.abs(coronaAt - curlAt)).toBeLessThan
      (0.06);
    stage.dispose();
  });

  it('互动·日珥全部熄灭时日冕只剩微弱基底', () => {
    const { stage, ctx } = build();
    // 走到所有日珥都已卷回之后（末幕尾）。
    at(stage, 0.995);
    let promSum = 0;
    for (let p = 0; p < 5; p += 1) promSum += opacity(node(ctx.root, `prom-${p}`));
    const coronaAlpha = uniformOf(node(ctx.root, 'corona-0'), 'uAlpha');

    // 找一个日珥旺盛的时刻做对照。
    at(stage, 0.3);
    const busyCorona = uniformOf(node(ctx.root, 'corona-0'), 'uAlpha');

    expect(promSum).toBeLessThan(0.1);
    expect(coronaAlpha).toBeLessThan(busyCorona * 0.5);
    stage.dispose();
  });

  // 互动② 脉冲环与日珥同源：环的缩放峰值也应跟卷曲量峰值对齐。
  it('互动·脉冲环缩放与日珥节奏同源', () => {
    const { stage, ctx } = build();
    let ringPeak = 0;
    let ringAt = 0;
    let curlPeak = 0;
    let curlAt = 0;
    const ats = [0, 0.0825, 0.165, 0.2475, 0.33];
    for (let i = 0; i <= 80; i += 1) {
      const t = i / 80;
      at(stage, t);
      const s = node(ctx.root, 'sun-pulse-ring').scale.x;
      if (s > ringPeak) { ringPeak = s; ringAt = t; }
      const c = curlEnergy(t, ats);
      if (c > curlPeak) { curlPeak = c; curlAt = t; }
    }
    expect(Math.abs(ringAt - curlAt)).toBeLessThan(0.1);
    stage.dispose();
  });

  it('日核翻涌剧烈度跟着日珥走，且整幕常在', () => {
    const { stage, ctx } = build();
    at(stage, 0.3);
    const busy = uniformOf(node(ctx.root, 'sun-core'), 'uChurn');
    const busyAlpha = uniformOf(node(ctx.root, 'sun-core'), 'uAlpha');
    at(stage, 0.995);
    const calm = uniformOf(node(ctx.root, 'sun-core'), 'uChurn');
    const calmAlpha = uniformOf(node(ctx.root, 'sun-core'), 'uAlpha');

    expect(busy).toBeGreaterThan(calm);
    // 日核是恒星本体，末幕也不能消失（与 moon 被云掩不同）。
    expect(calmAlpha).toBeGreaterThan(0.3);
    expect(busyAlpha).toBeGreaterThan(0.5);
    stage.dispose();
  });

  // 与 moon 的对照：sun 的主体原地不动（表面翻涌），
  // moon 的主体有升沉位移。这条锁住两者不会趋同。
  it('对照·日核原地不动（位移与 moon 的升沉相反）', () => {
    const { stage, ctx } = build();
    const ys: number[] = [];
    for (const t of [0.05, 0.3, 0.6, 0.95]) {
      at(stage, t);
      ys.push(node(ctx.root, 'sun-core').position.y);
    }
    for (const y of ys) expect(y).toBe(ys[0]);
    stage.dispose();
  });

  it('光斑沿日面绕转（各自角速度不同）', () => {
    const { stage, ctx } = build();
    const trail: THREE.Vector3[][] = [[], []];
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      at(stage, t);
      trail[0].push(node(ctx.root, 'spot-0').position.clone());
      trail[1].push(node(ctx.root, 'spot-1').position.clone());
    }
    // 两颗都在动。
    for (let s = 0; s < 2; s += 1) {
      expect(trail[s][3].distanceTo(trail[s][0]), `光斑 ${s} 未移动`).toBeGreaterThan(1);
    }
    // 各自到日心距离恒定（绕转而非径向乱飞）。
    for (let s = 0; s < 2; s += 1) {
      const radii = trail[s].map((p) => Math.hypot(p.x, p.y));
      expect(Math.max(...radii) - Math.min(...radii), `光斑 ${s} 半径漂移`).toBeLessThan(1);
    }
    // 两颗走过的角度不同（角速度不同）。
    const sweep = trail.map((ps) => {
      const a0 = Math.atan2(ps[0].y, ps[0].x);
      const a3 = Math.atan2(ps[3].y, ps[3].x);
      return Math.abs(a3 - a0);
    });
    expect(Math.abs(sweep[0] - sweep[1])).toBeGreaterThan(0.001);
    stage.dispose();
  });

  it('紫外线光晕比日冕慢半拍（跟幕进度而非卷曲量）', () => {
    const { stage, ctx } = build();
    // 日珥峰值前后各取一点：日冕会跟着起落，紫外圈应仍在爬升。
    at(stage, 0.2);
    const uvEarly = opacity(node(ctx.root, 'sun-uv-halo'));
    at(stage, 0.6);
    const uvLate = opacity(node(ctx.root, 'sun-uv-halo'));
    expect(uvLate).toBeGreaterThan(uvEarly);
    stage.dispose();
  });

  it('热浪整幕颤动，日珥旺时更强', () => {
    const { stage, ctx } = build();
    at(stage, 0.3);
    const busy = uniformOf(node(ctx.root, 'sun-haze'), 'uAlpha');
    at(stage, 0.995);
    const calm = uniformOf(node(ctx.root, 'sun-haze'), 'uAlpha');
    expect(busy).toBeGreaterThan(calm);
    expect(calm).toBeGreaterThan(0);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, SUN_ACT1_END * 0.5);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (SUN_ACT1_END + SUN_ACT2_END) / 2);
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
    expect(collectExact(lo.ctx.root, 'prom')).toHaveLength(collectExact(hi.ctx.root, 'prom').length);
    expect(collectExact(lo.ctx.root, 'corona')).toHaveLength(collectExact(hi.ctx.root, 'corona').length);
    expect(collectExact(lo.ctx.root, 'spot')).toHaveLength(collectExact(hi.ctx.root, 'spot').length);

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
