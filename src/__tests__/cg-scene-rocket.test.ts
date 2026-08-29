/**
 * 场景 01 rocket 实现验收（设计规格 §4.2 场景 01）。
 *
 * 断言按规格逐条对应：8 元素齐备、三幕时间轴、全屏覆盖（尾焰贯穿中轴线 +
 * 烟柱铺满下半屏）、三条互动、独立签名（自下而上构图 + 发射台闪白消隐）、
 * 碎屑刚体物理、资源释放。结构照 cg-scene-lightning.test.ts 标杆，取值走共用夹具。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage } from '../overlay/cg-scene';
import {
  ROCKET_ACT1_END,
  ROCKET_ACT2_END,
  padDismissal,
} from '../overlay/cg-scenes/cg-rocket';
import {
  box,
  makeSceneCtx as makeCtx,
  names,
  node,
  nodes,
  opacity,
  uniformOf,
  visualSnapshot,
} from './cg-scene-harness';

/** 场景总时长（ms），规格 §4.2 场景 01。 */
const DURATION = 1200;

/** 规格八元素的实现节点名，验收即照此清单点数。 */
const ELEMENTS = [
  'engine-flame', 'exhaust-smoke', 'launch-pad', 'sonic-ring',
  'fuel-debris', 'horizon-band', 'star-field', 'stage-ignition',
] as const;

/** 按归一化进度推进一帧。 */
function step(stage: CgStage, t: number): void {
  stage.update(t, t * DURATION, 'cinematic');
}

/** 以固定小步长推进到 t，让刚体积分出真实轨迹（一帧跳到位拿不到物理）。 */
function runTo(stage: CgStage, t: number, frames = 60): void {
  for (let i = 1; i <= frames; i += 1) step(stage, (t * i) / frames);
}

/** 两侧烟柱的世界间距，互动① 的「被推开」就量这个。 */
function smokeGap(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const left = node(root, 'smoke-column-0').getWorldPosition(new THREE.Vector3());
  const right = node(root, 'smoke-column-1').getWorldPosition(new THREE.Vector3());
  return Math.abs(right.x - left.x);
}

/** 收集碎屑 mesh，互动② 与刚体验收都按前缀点名。 */
function debrisPieces(root: THREE.Object3D): THREE.Object3D[] {
  return nodes(root).filter((o) => o.name.startsWith('debris-'));
}

const scene = resolveScene('rocket');

describe('场景 01 rocket', () => {
  it('已注册且签名声明发射台消隐', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('jet');
    expect(scene!.config.signature).toContain('发射台消隐');
    expect(scene!.config.elements).toHaveLength(8);
  });

  it('8 个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const all = names(ctx.root);
    for (const element of ELEMENTS) {
      expect(all, `缺元素 ${element}`).toContain(element);
    }
    // ① 蓝核+白边双层：核与边是两层，不是一层调色。
    expect(all).toContain('engine-flame-core');
    // ③ 4 根立柱 + 平台。
    expect(all).toContain('pad-platform');
    for (let i = 0; i < 4; i += 1) expect(all, `缺立柱 ${i}`).toContain(`pad-pillar-${i}`);
    // ④ 双环依次扩散。
    expect(all).toContain('sonic-ring-0');
    expect(all).toContain('sonic-ring-1');
    // ② 尾烟两侧。
    expect(all).toContain('smoke-column-0');
    expect(all).toContain('smoke-column-1');
    stage.dispose();
  });

  it('全屏·尾焰光柱自下而上贯穿中轴线，烟柱铺满下半屏', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    runTo(stage, 0.72);

    const flame = box(node(ctx.root, 'engine-flame'));
    const flameSize = flame.getSize(new THREE.Vector3());
    // 贯穿：纵向盖过七成屏高，底端压到屏幕下。
    expect(flameSize.y).toBeGreaterThan(ctx.height * 0.7);
    expect(flame.min.y).toBeLessThan(-ctx.height * 0.3);
    // 中轴线：光柱横向重心不偏离画面中线。
    expect(Math.abs(flame.getCenter(new THREE.Vector3()).x)).toBeLessThan(ctx.width * 0.03);

    const smoke = box(node(ctx.root, 'exhaust-smoke'));
    expect(smoke.getSize(new THREE.Vector3()).x).toBeGreaterThan(ctx.width * 0.85);
    // 铺满「下」半屏：烟体重心在中线之下，且触及屏幕下缘。
    expect(smoke.getCenter(new THREE.Vector3()).y).toBeLessThan(0);
    expect(smoke.min.y).toBeLessThan(-ctx.height * 0.35);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      step(stage, t);
      return visualSnapshot(ctx.root);
    };
    // 0–240 点火抖动 / 240–900 升空 / 900–1200 二级点火+音爆环
    const act1 = snapshot(0.12);
    const act2 = snapshot(0.55);
    const act3 = snapshot(0.95);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    expect(act1).not.toBe(act3);
    stage.dispose();
  });

  it('签名·发射台消隐：纯函数层先闪白后退场，幕末不留痕', () => {
    const flashAt = (p: number) => padDismissal(p).flash;
    const presenceAt = (p: number) => padDismissal(p).presence;

    // 闪白是一记窄脉冲：幕首幕末都不闪。
    expect(flashAt(0)).toBe(0);
    expect(flashAt(1)).toBe(0);
    const peak = flashAt(0.47);
    expect(peak).toBeGreaterThan(0.9);
    expect(flashAt(0.3)).toBeLessThan(peak);
    expect(flashAt(0.62)).toBeLessThan(peak);

    // 「闪白消隐」的先后：闪到峰值时发射台还在，之后才退场。
    expect(presenceAt(0.47)).toBeGreaterThan(0.95);
    expect(presenceAt(1)).toBe(0);
    // 退场单向不回头。
    let last = Infinity;
    for (let s = 0; s <= 40; s += 1) {
      const v = presenceAt(s / 40);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
  });

  it('签名·场景内发射台第一幕颤动、第二幕闪白后彻底消隐', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const platform = node(ctx.root, 'pad-platform');
    const pillar = node(ctx.root, 'pad-pillar-0');

    // 第一幕：点火抖动——立柱位置在帧间真的在动。
    const shakes = new Set<string>();
    for (let s = 0; s <= 8; s += 1) {
      const t = (ROCKET_ACT1_END * s) / 8;
      step(stage, t);
      shakes.add(pillar.position.toArray().map((n) => n.toFixed(3)).join(','));
    }
    expect(shakes.size).toBeGreaterThan(4);

    // 第二幕：先出现一记闪白峰值，随后彻底消隐。
    let flashPeak = { t: -1, v: -1 };
    for (let s = 0; s <= 60; s += 1) {
      const t = ROCKET_ACT1_END + (ROCKET_ACT2_END - ROCKET_ACT1_END) * (s / 60);
      step(stage, t);
      const v = opacity(platform);
      if (v > flashPeak.v) flashPeak = { t, v };
    }
    expect(flashPeak.v, '发射台未闪白').toBeGreaterThan(0.8);
    expect(flashPeak.t).toBeLessThan(ROCKET_ACT2_END);

    step(stage, ROCKET_ACT2_END);
    expect(opacity(platform), '第二幕末发射台应已消隐').toBeLessThan(0.02);
    step(stage, 0.98);
    expect(opacity(pillar), '第三幕不该再有发射台').toBeLessThan(0.02);
    stage.dispose();
  });

  it('互动①·主焰熄灭后音爆环从锥底扩散，推开两侧烟柱成蘑菇帽', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const flame = node(ctx.root, 'engine-flame');
    const ring = node(ctx.root, 'sonic-ring-0');

    runTo(stage, ROCKET_ACT2_END, 40);
    const burning = opacity(flame);
    const gapBefore = smokeGap(ctx.root);
    const ringBefore = ring.scale.x;
    // 音爆环起于锥底：环心贴在尾焰下缘，不在画面中心。
    ctx.root.updateMatrixWorld(true);
    const ringY = ring.getWorldPosition(new THREE.Vector3()).y;
    expect(ringY).toBeLessThan(-ctx.height * 0.3);
    expect(uniformOf(node(ctx.root, 'smoke-column-0'), 'uCap')).toBeLessThan(0.02);

    runTo(stage, 1, 40);
    // 主焰熄灭 + 环扩散 + 烟柱被推开成帽，三件事同一时刻发生才叫互动。
    expect(opacity(flame), '第三幕主焰应熄灭').toBeLessThan(burning * 0.25);
    expect(ring.scale.x).toBeGreaterThan(ringBefore * 2);
    expect(smokeGap(ctx.root), '烟柱未被推开').toBeGreaterThan(gapBefore * 1.1);
    expect(uniformOf(node(ctx.root, 'smoke-column-0'), 'uCap')).toBeGreaterThan(0.3);
    expect(uniformOf(node(ctx.root, 'smoke-column-1'), 'uCap')).toBeGreaterThan(0.3);
    stage.dispose();
  });

  it('互动①·双环依次扩散，不同时起跳', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const first = node(ctx.root, 'sonic-ring-0');
    const second = node(ctx.root, 'sonic-ring-1');
    runTo(stage, 0.94, 50);
    // 后环滞后于前环：任一时刻半径都更小，且更晚亮起。
    expect(second.scale.x).toBeLessThan(first.scale.x);
    expect(opacity(first)).toBeGreaterThan(0);
    stage.dispose();
  });

  it('互动②·碎屑被音爆环扫动改变轨迹', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const field = node(ctx.root, 'fuel-debris');

    runTo(stage, ROCKET_ACT2_END, 45);
    expect(field.userData.sweptCount, '音爆环尚未扩散就扫到碎屑').toBe(0);

    runTo(stage, 1, 45);
    const swept = field.userData.sweptCount as number;
    expect(swept, '音爆环应扫到碎屑').toBeGreaterThan(0);

    // 扫到的碎屑必须真的被推向外侧：轨迹改变是几何真值，不是记账。
    const marked = debrisPieces(ctx.root).filter((o) => typeof o.userData.sweptX === 'number');
    expect(marked).toHaveLength(swept);
    const pushed = marked.filter(
      (o) => Math.abs(o.position.x) > Math.abs(o.userData.sweptX as number),
    );
    expect(pushed.length).toBeGreaterThan(marked.length * 0.6);
    stage.dispose();
  });

  it('互动③·地平线光带随引擎亮度整体增辉', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const horizon = node(ctx.root, 'horizon-band');
    const flame = node(ctx.root, 'engine-flame');

    const samples = [0.02, 0.15, 0.45, 0.7, 0.95];
    const pairs = samples.map((t) => {
      step(stage, t);
      return { glow: uniformOf(horizon, 'uGlow'), flame: opacity(flame) };
    });
    // 共用同一份引擎亮度真值：光带不是自己另演一条曲线。
    for (const p of pairs) expect(p.glow).toBeCloseTo(p.flame, 6);
    // 尾焰最盛时光带最亮，主焰熄灭后随之暗下。
    const peak = Math.max(...pairs.map((p) => p.glow));
    expect(peak).toBeGreaterThan(0.5);
    expect(pairs[0].glow).toBeLessThan(peak);
    expect(pairs[4].glow).toBeLessThan(peak * 0.4);
    stage.dispose();
  });

  it('碎屑受重力下落并在发射台面弹跳，不穿透', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const padY = node(ctx.root, 'pad-platform').position.y;
    const pieces = debrisPieces(ctx.root);
    expect(pieces.length).toBeGreaterThan(4);

    const history = pieces.map(() => [] as number[]);
    for (let i = 1; i <= 90; i += 1) {
      step(stage, i / 90);
      pieces.forEach((p, idx) => history[idx].push(p.position.y));
    }

    // 不穿透台面。
    for (const ys of history) {
      expect(Math.min(...ys)).toBeGreaterThan(padY - 2);
    }
    // 弹跳：至少一片先降后升。
    const bounced = history.some((ys) => {
      let low = Infinity;
      let fell = false;
      for (const y of ys) {
        if (y < low) { low = y; fell = true; }
        else if (fell && y > low + 2.5) return true;
      }
      return false;
    });
    expect(bounced, '碎屑应有落台反弹').toBe(true);
    stage.dispose();
  });

  it('二级点火亮斑属于第三幕，且位于尾焰顶端', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const spot = node(ctx.root, 'stage-ignition');

    runTo(stage, 0.6, 30);
    const duringAct2 = opacity(spot);
    runTo(stage, 0.96, 30);
    expect(opacity(spot)).toBeGreaterThan(Math.max(duringAct2, 0.05));
    // 亮斑是「二级点火」：位置跟着尾焰顶端（喷口）走，不钉死在原点。
    ctx.root.updateMatrixWorld(true);
    const spotY = spot.getWorldPosition(new THREE.Vector3()).y;
    expect(spotY).toBeGreaterThan(0);
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    runTo(a, 0.6, 20);
    b.update(0.6, 720, 'medium');

    for (const element of ELEMENTS) {
      expect(names(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    // 档位只该动密度：碎屑与星点变稀，结构件一个不少。
    expect(debrisPieces(lo.root).length).toBeLessThan(debrisPieces(hi.root).length);
    expect(debrisPieces(lo.root).length).toBeGreaterThan(0);
    const stars = (root: THREE.Object3D) => (node(root, 'star-field') as THREE.InstancedMesh).count;
    expect(stars(lo.root)).toBeLessThan(stars(hi.root));
    expect(stars(lo.root)).toBeGreaterThan(0);
    const pillars = (root: THREE.Object3D) =>
      nodes(root).filter((o) => o.name.startsWith('pad-pillar-')).length;
    expect(pillars(lo.root)).toBe(4);
    expect(pillars(hi.root)).toBe(4);
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等，dispose 后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    runTo(stage, 0.8, 20);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => step(stage, 0.5)).not.toThrow();
  });
});
