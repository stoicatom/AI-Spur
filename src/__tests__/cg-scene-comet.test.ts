import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-comet';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  COMET_ACT1_END,
  COMET_ACT2_END,
  dustLagAt,
  orbitPoint,
  solarWindStrength,
} from '../overlay/cg-scenes/cg-comet';
import {
  TAIL_SEGMENTS,
  curvature,
  dustTailPoint,
  ionTailPoint,
} from '../overlay/cg-scenes/comet-tails';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 18 的 8 个构成件的具名节点（日球风由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'comet-core',        // ① 彗核
  'ion-tail',          // ② 双向彗尾之离子尾
  'dust-tail',         // ② 双向彗尾之尘埃尾
  'perihelion-flash',  // ③ 近日点闪光
  'star-field',        // ⑤ 星空粒子
  'wake-0',            // ⑥ 拖尾环
  'sparkle-0',         // ⑧ 尾梢爆星
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('comet');
  if (!scene) throw new Error('comet 场景未注册');
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

/** 近日点时刻：日球风峰值所在。 */
const PERIHELION_T = (COMET_ACT1_END + COMET_ACT2_END) / 2;

describe('场景 18 comet（彗星掠日）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('comet');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('双向彗尾');
    expect(scene!.config.preset).toBe('trail-burst');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, PERIHELION_T);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'wake')).toHaveLength(5);
    expect(collectExact(ctx.root, 'sparkle')).toHaveLength(6);
    stage.dispose();
  });

  // 签名核心：离子尾直、尘埃尾弯，两者的弯曲度必须显著不同。
  // 若实现让两条尾同为直线（或同一条几何复制两份），这条会红。
  it('签名·离子尾直、尘埃尾弯（弯曲度量级不同）', () => {
    const sunDir = new THREE.Vector2(0.6, 0.8).normalize();
    const orbitDir = new THREE.Vector2(1, -0.2).normalize();
    const length = 400;

    const ion: THREE.Vector2[] = [];
    const dust: THREE.Vector2[] = [];
    for (let i = 0; i < TAIL_SEGMENTS; i += 1) {
      ion.push(ionTailPoint(i, sunDir, length));
      dust.push(dustTailPoint(i, sunDir, orbitDir, length, 0.8));
    }

    const ionCurve = curvature(ion);
    const dustCurve = curvature(dust);

    // 离子尾必须是直的（数值误差量级）。
    expect(ionCurve, `离子尾弯曲度 ${ionCurve}`).toBeLessThan(0.001);
    // 尘埃尾必须明显弯。
    expect(dustCurve, `尘埃尾弯曲度 ${dustCurve}`).toBeGreaterThan(0.05);
  });

  it('签名·离子尾严格背日（与背日方向夹角为零）', () => {
    const sunDir = new THREE.Vector2(-0.3, 0.95).normalize();
    const length = 300;
    for (let i = 1; i < TAIL_SEGMENTS; i += 1) {
      const p = ionTailPoint(i, sunDir, length);
      const dir = p.clone().normalize();
      // 与 -sunDir 完全同向。
      expect(dir.dot(sunDir), `段 ${i}`).toBeCloseTo(-1, 6);
    }
  });

  it('签名·尘埃尾滞后量随距核距离超线性增长（弯曲的物理来源）', () => {
    const sunDir = new THREE.Vector2(0, 1);
    const orbitDir = new THREE.Vector2(1, 0);
    const length = 300;
    // 逐段计算沿轨道反向的滞后分量。
    const lags: number[] = [];
    for (let i = 0; i < TAIL_SEGMENTS; i += 1) {
      const p = dustTailPoint(i, sunDir, orbitDir, length, 0.7);
      // orbitDir = +x，滞后在 -x 方向。
      lags.push(-p.x);
    }
    // 单调增。
    for (let i = 1; i < lags.length; i += 1) {
      expect(lags[i], `段 ${i}`).toBeGreaterThanOrEqual(lags[i - 1]);
    }
    // 超线性：后半段增量必须大于前半段（u² 而非 u）。
    const mid = Math.floor(TAIL_SEGMENTS / 2);
    const firstHalf = lags[mid] - lags[0];
    const secondHalf = lags[TAIL_SEGMENTS - 1] - lags[mid];
    expect(secondHalf).toBeGreaterThan(firstHalf * 1.5);
  });

  it('两条尾在运行期的几何顶点数相同但坐标不同（不是同一条复制）', () => {
    const { stage, ctx } = build();
    at(stage, PERIHELION_T);
    const ion = node(ctx.root, 'ion-tail') as THREE.Mesh;
    const dust = node(ctx.root, 'dust-tail') as THREE.Mesh;
    const ionPos = ion.geometry.getAttribute('position');
    const dustPos = dust.geometry.getAttribute('position');
    expect(ionPos.count).toBe(dustPos.count);

    // 至少有相当比例的顶点坐标不同。
    let differing = 0;
    for (let i = 0; i < ionPos.count; i += 1) {
      const dx = ionPos.getX(i) - dustPos.getX(i);
      const dy = ionPos.getY(i) - dustPos.getY(i);
      if (Math.hypot(dx, dy) > 1) differing += 1;
    }
    expect(differing / ionPos.count).toBeGreaterThan(0.5);
    stage.dispose();
  });

  it('彗星沿轨道飞行且经过近日点附近', () => {
    const entry = new THREE.Vector2(-960, -324);
    const peri = new THREE.Vector2(115, 237);
    const exit = new THREE.Vector2(998, -280);

    const start = orbitPoint(0, entry, peri, exit);
    const mid = orbitPoint(0.5, entry, peri, exit);
    const end = orbitPoint(1, entry, peri, exit);

    expect(start.distanceTo(entry)).toBeLessThan(0.001);
    expect(end.distanceTo(exit)).toBeLessThan(0.001);
    // 中点必须显著高于两端连线（绕日的弧）。
    const chordY = (entry.y + exit.y) / 2;
    expect(mid.y).toBeGreaterThan(chordY + 100);
  });

  it('日球风在近日点达峰，两侧衰减', () => {
    const peak = solarWindStrength(PERIHELION_T);
    expect(peak).toBeCloseTo(1, 5);
    expect(solarWindStrength(0.02)).toBeLessThan(0.3);
    expect(solarWindStrength(0.98)).toBeLessThan(0.3);
    // 单峰：从起点到峰值单调升。
    const rising = [0.05, 0.15, 0.25, 0.35, PERIHELION_T].map(solarWindStrength);
    for (let i = 1; i < rising.length; i += 1) {
      expect(rising[i], `升段 ${i}`).toBeGreaterThan(rising[i - 1]);
    }
  });

  // 互动② 日球风推弯尘埃尾。
  //
  // 不能直接比「近日点 vs 远处」的弯曲度：本场景轨道上，背日方向与
  // 轨道滞后方向的夹角与风强高度耦合（远处 3.5°、近日点 68°），弯曲度
  // 的变化主要来自这个几何夹角。把 lag 写成常量后那种断言照样全绿
  // ——即「绿灯但机制不存在」。
  //
  // 隔离办法：固定同一组几何输入，只变 lag，确认弯曲度单调随之增长
  // （纯函数层）；再从运行期几何反解出实际 lag，确认它随风强变化。
  it('互动·滞后系数决定尾的偏折量（纯函数层的因果）', () => {
    const sunDir = new THREE.Vector2(0, 1);
    const orbitDir = new THREE.Vector2(1, 0);
    // 判据用**滞后位移量**而非归一化弯曲度：curvature 按首尾连线归一化，
    // lag 增大时连线自身也被拉长，比值在 lag≈0.7 处越过拐点回落
    // （实测 0.75→1.1 由 0.1236 降到 0.1211），不是 lag 的单调函数。
    // 滞后位移（尾梢沿 -orbitDir 的偏移）则严格单调，直接对应「被推弯」。
    const lagOffset = (lag: number): number => {
      const tip = dustTailPoint(TAIL_SEGMENTS - 1, sunDir, orbitDir, 300, lag);
      // orbitDir = +x，滞后在 -x 方向。
      return -tip.x;
    };
    const offsets = [0.15, 0.45, 0.75, 1.1].map(lagOffset);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i], `lag 档 ${i}`).toBeGreaterThan(offsets[i - 1]);
    }
    // 且偏折是显著的（不是数值噪声量级）。
    expect(offsets[offsets.length - 1]).toBeGreaterThan(offsets[0] * 3);
  });

  it('互动·滞后系数由日球风驱动（不是常量）', () => {
    // 直接测因果链本体 dustLagAt，不从几何反解：反解受尾长与三角带
    // 宽度干扰，低风短尾时误差达 3.6 倍——足以让「lag 写成常量」的
    // 实现照样通过反解式断言（本场景实测过这个假绿）。
    const low = dustLagAt(0.03);
    const high = dustLagAt(PERIHELION_T);
    expect(high, `低风 ${low.toFixed(3)} / 高风 ${high.toFixed(3)}`)
      .toBeGreaterThan(low * 1.8);
    // 且必须随风强单调。
    const ramp = [0.05, 0.15, 0.28, PERIHELION_T].map(dustLagAt);
    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i], `档 ${i}`).toBeGreaterThan(ramp[i - 1]);
    }
  });

  it('互动·运行期尘埃尾确实用上了随风变化的滞后（两幕形状不同）', () => {
    const { stage, ctx } = build();
    const dust = node(ctx.root, 'dust-tail') as THREE.Mesh;

    /** 取尾梢顶点相对彗核的方向角。 */
    const tipDir = (t: number): number => {
      at(stage, t);
      const pos = dust.geometry.getAttribute('position');
      const last = pos.count - 1;
      return Math.atan2(pos.getY(last), pos.getX(last));
    };

    // 低风与高风时尾梢方向必须不同——若 lag 是常量，方向只随
    // 背日/轨道方向变，两者差异会明显更小。
    const a = tipDir(0.03);
    const b = tipDir(PERIHELION_T);
    expect(Math.abs(a - b)).toBeGreaterThan(0.05);
    stage.dispose();
  });

  // 互动① 近日点闪光瞬间尾迹断裂：闪光与断裂必须同时达峰。
  it('互动·近日点闪光与尾迹断裂同时达峰', () => {
    const { stage, ctx } = build();
    let flashPeak = 0;
    let flashAt = 0;
    let breakPeak = 0;
    let breakAt = 0;
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      at(stage, t);
      const f = uniformOf(node(ctx.root, 'perihelion-flash'), 'uAlpha');
      if (f > flashPeak) { flashPeak = f; flashAt = t; }
      const b = uniformOf(node(ctx.root, 'ion-tail'), 'uBreak');
      if (b > breakPeak) { breakPeak = b; breakAt = t; }
    }
    expect(flashPeak).toBeGreaterThan(0.5);
    expect(breakPeak).toBeGreaterThan(0.5);
    // 同一时刻附近——「闪光瞬间尾迹断裂」的可观测特征。
    expect(Math.abs(flashAt - breakAt)).toBeLessThan(0.04);
    stage.dispose();
  });

  it('互动·尾迹断裂后重新长起（断裂是瞬时而非永久）', () => {
    const { stage, ctx } = build();
    at(stage, PERIHELION_T);
    const peak = uniformOf(node(ctx.root, 'ion-tail'), 'uBreak');
    at(stage, 0.95);
    const after = uniformOf(node(ctx.root, 'ion-tail'), 'uBreak');
    expect(peak).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(peak * 0.3);
    stage.dispose();
  });

  it('尾长在近日点最长（挥发最剧烈）', () => {
    const { stage, ctx } = build();
    const dust = node(ctx.root, 'dust-tail') as THREE.Mesh;

    const spanAt = (t: number): number => {
      at(stage, t);
      const pos = dust.geometry.getAttribute('position');
      let maxR = 0;
      for (let i = 0; i < pos.count; i += 1) {
        maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getY(i)));
      }
      return maxR;
    };

    const early = spanAt(0.05);
    const peri = spanAt(PERIHELION_T);
    expect(peri).toBeGreaterThan(early);
    stage.dispose();
  });

  it('彗核在近日点最亮最大', () => {
    const { stage, ctx } = build();
    at(stage, 0.05);
    const early = node(ctx.root, 'comet-core').scale.x;
    at(stage, PERIHELION_T);
    const peri = node(ctx.root, 'comet-core').scale.x;
    expect(peri).toBeGreaterThan(early);
    stage.dispose();
  });

  it('拖尾环只在彗星经过后出现并淡出', () => {
    const { stage, ctx } = build();
    // wake-2 的 at = 0.15 + 2*0.17 = 0.49
    at(stage, 0.2);
    expect(opacity(node(ctx.root, 'wake-2')), '彗星未到时不应可见').toBe(0);
    at(stage, 0.52);
    const justPassed = opacity(node(ctx.root, 'wake-2'));
    at(stage, 0.95);
    const faded = opacity(node(ctx.root, 'wake-2'));
    expect(justPassed).toBeGreaterThan(0.1);
    expect(faded).toBeLessThan(justPassed);
    stage.dispose();
  });

  it('尾梢爆星错峰起爆且落在尘埃尾上', () => {
    const { stage, ctx } = build();
    const peakAt: number[] = [];
    for (let s = 0; s < 3; s += 1) {
      let peak = 0;
      let when = 0;
      for (let i = 0; i <= 60; i += 1) {
        const t = i / 60;
        at(stage, t);
        const o = opacity(node(ctx.root, `sparkle-${s}`));
        if (o > peak) { peak = o; when = t; }
      }
      expect(peak, `sparkle-${s} 未起爆`).toBeGreaterThan(0.2);
      peakAt.push(when);
    }
    // 错峰。
    for (let i = 1; i < peakAt.length; i += 1) {
      expect(Math.abs(peakAt[i] - peakAt[i - 1]), `相邻峰 ${i}`).toBeGreaterThan(0.02);
    }
    stage.dispose();
  });

  it('两条尾的色温不同（离子偏蓝、尘埃偏黄）', () => {
    const { stage, ctx } = build();
    at(stage, PERIHELION_T);
    const ionMat = (node(ctx.root, 'ion-tail') as THREE.Mesh).material as THREE.ShaderMaterial;
    const dustMat = (node(ctx.root, 'dust-tail') as THREE.Mesh).material as THREE.ShaderMaterial;
    const ionColor = ionMat.uniforms.uColor.value as THREE.Color;
    const dustColor = dustMat.uniforms.uColor.value as THREE.Color;
    // 离子尾更蓝：b/r 比值更高。
    expect(ionColor.b / Math.max(0.001, ionColor.r))
      .toBeGreaterThan(dustColor.b / Math.max(0.001, dustColor.r));
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, COMET_ACT1_END * 0.5);
    const a1 = visualSnapshot(ctx.root);
    at(stage, PERIHELION_T);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档只减粒子密度，命名结构件一个不少', () => {
    const hi = build();
    at(hi.stage, PERIHELION_T);
    const hiTree = names(hi.ctx.root);

    const lo = build({ quality: 'medium' });
    at(lo.stage, PERIHELION_T);
    const loTree = names(lo.ctx.root);

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    expect(collectExact(lo.ctx.root, 'wake')).toHaveLength(collectExact(hi.ctx.root, 'wake').length);
    expect(collectExact(lo.ctx.root, 'sparkle')).toHaveLength(collectExact(hi.ctx.root, 'sparkle').length);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树摘净且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, PERIHELION_T);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.9)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
  });
});
