/**
 * 场景 03 lightning 实现验收（设计规格 §4.2 场景 03）。
 *
 * 断言按规格逐条对应：8 元素齐备、三幕时间轴、全屏覆盖（顶部 2/3 云幕 +
 * 贯穿电弧 + 全屏半径光池）、三条互动、独立签名（先导-暗闪-落雷三相耦合）、
 * 资源释放。结构照 cg-scene-black-hole.test.ts 标杆。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import { LIGHTNING_ACT1_END, LIGHTNING_ACT2_END, phaseCoupling } from '../overlay/cg-scenes/cg-lightning';
import type { CgStageContext } from '../overlay/cg-scene';

/** 场景总时长（ms），规格 §4.2 场景 03。 */
const DURATION = 1200;
/** 单相时长（归一化）：第二幕三相等分。 */
const PHASE = (LIGHTNING_ACT2_END - LIGHTNING_ACT1_END) / 3;

/** 规格八元素的实现节点名，验收即照此清单点数。 */
const ELEMENTS = [
  'storm-cloud', 'leader-bolt', 'cloud-dark-flash', 'strike-pool',
  'rain-curtain', 'residual-serpent', 'thunder-blast', 'charge-lamps',
] as const;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#5B7CFF'),
    energy: 1.5,
    direction: new THREE.Vector2(0, -1),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

/** 摊平整棵场景树：状态变化都在子节点上，只看顶层会漏。 */
function nodes(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => out.push(o));
  return out;
}

function names(root: THREE.Object3D): string {
  return nodes(root).map((o) => o.name).filter(Boolean).join('|');
}

function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const hit = nodes(root).find((o) => o.name === name);
  if (!hit) throw new Error(`节点缺失: ${name}`);
  return hit;
}

function opacity(o: THREE.Object3D): number {
  const material = (o as THREE.Mesh).material;
  if (!material || Array.isArray(material)) return 0;
  return (material as THREE.Material).opacity;
}

/** 雨丝亮度走 uBright uniform：「被闪电照白」要同时抬色温，单靠 alpha 表达不了。 */
function brightOf(o: THREE.Object3D): number {
  const material = (o as THREE.Mesh).material as THREE.ShaderMaterial;
  return Number(material.uniforms.uBright.value);
}

function box(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

const scene = resolveScene('lightning');

describe('场景 03 lightning', () => {
  it('已注册且签名声明三相耦合', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('bolt');
    expect(scene!.config.signature).toContain('三相耦合');
  });

  it('8 个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const all = names(ctx.root);
    for (const element of ELEMENTS) {
      expect(all, `缺元素 ${element}`).toContain(element);
    }
    stage.dispose();
  });

  it('乌云铺满全屏顶部 2/3（规格全屏要求）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.15, 180, 'cinematic');
    const bounds = box(node(ctx.root, 'storm-cloud'));
    expect(bounds.max.y).toBeGreaterThan(ctx.height * 0.44);
    expect(bounds.min.y).toBeLessThan(-ctx.height * 0.1);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(ctx.width);
    stage.dispose();
  });

  it('电弧贯穿全屏高度、落雷光池覆盖全屏半径', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const peak = LIGHTNING_ACT1_END + PHASE * 0.59;
    stage.update(peak, peak * DURATION, 'cinematic');

    const bolt = box(node(ctx.root, 'leader-bolt')).getSize(new THREE.Vector3());
    expect(bolt.y).toBeGreaterThan(ctx.height * 0.7);

    const pool = box(node(ctx.root, 'strike-pool-0')).getSize(new THREE.Vector3());
    expect(pool.x).toBeGreaterThan(Math.min(ctx.width, ctx.height));
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      stage.update(t, t * DURATION, 'cinematic');
      const rows: unknown[] = [];
      ctx.root.traverse((o) => {
        rows.push([
          o.name,
          o.position.toArray().map((n) => Number(n.toFixed(2))),
          o.scale.toArray().map((n) => Number(n.toFixed(3))),
          Number(opacity(o).toFixed(3)),
        ]);
      });
      return JSON.stringify(rows);
    };
    // 0–240 云压蓄能 / 240–780 三相劈落 / 780–1200 余电散场
    const act1 = snapshot(0.12);
    const act2 = snapshot(0.45);
    const act3 = snapshot(0.9);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    expect(act1).not.toBe(act3);
    stage.dispose();
  });

  it('签名·先导-暗闪-落雷三相耦合：纯函数层每相先闪后劈', () => {
    const at = (p: number) => phaseCoupling(p);
    const lead = at(0.32);
    const flash = at(0.44);
    const strike = at(0.59);
    // 先导最先起势，暗闪居中，主弧最后落——三者共用一个相内进度，耦合是真的。
    expect(lead.lead).toBeGreaterThan(flash.lead);
    expect(flash.darkFlash).toBeGreaterThan(lead.darkFlash);
    expect(strike.strike).toBeGreaterThan(flash.strike);
    // 「先闪一次天、再劈一道」：暗闪峰值时主弧尚未落，主弧峰值时暗闪已退。
    expect(flash.strike).toBe(0);
    expect(strike.darkFlash).toBeLessThan(flash.darkFlash * 0.4);
    expect(at(0).strike).toBe(0);
    expect(at(1).strike).toBeCloseTo(0, 5);
  });

  it('签名·三相在场景内依次劈落，每相暗闪都早于主弧', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const flashNode = node(ctx.root, 'cloud-dark-flash');
    const boltPeaks: number[] = [];

    for (let phase = 0; phase < 3; phase += 1) {
      const main = node(ctx.root, `bolt-main-${phase}`);
      let flashPeak = { t: -1, v: -1 };
      let boltPeak = { t: -1, v: -1 };
      for (let s = 0; s <= 60; s += 1) {
        const t = LIGHTNING_ACT1_END + PHASE * (phase + s / 60);
        stage.update(t, t * DURATION, 'cinematic');
        const f = opacity(flashNode);
        const b = opacity(main);
        if (f > flashPeak.v) flashPeak = { t, v: f };
        if (b > boltPeak.v) boltPeak = { t, v: b };
      }
      expect(flashPeak.v, `第 ${phase} 相暗闪未点亮`).toBeGreaterThan(0.1);
      expect(boltPeak.v, `第 ${phase} 相主弧未劈落`).toBeGreaterThan(0.1);
      expect(flashPeak.t, `第 ${phase} 相暗闪未早于主弧`).toBeLessThan(boltPeak.t);
      boltPeaks.push(boltPeak.t);
    }

    // 三相依次劈落，不同时炸。
    expect(boltPeaks[0]).toBeLessThan(boltPeaks[1]);
    expect(boltPeaks[1]).toBeLessThan(boltPeaks[2]);
    stage.dispose();
  });

  it('互动·雨幕在电弧经过处增亮', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const peak = LIGHTNING_ACT1_END + PHASE * 0.59;
    stage.update(peak, peak * DURATION, 'cinematic');

    const bands = nodes(ctx.root).filter((o) => o.name.startsWith('rain-band-'));
    expect(bands.length).toBeGreaterThan(3);
    const brightest = bands.reduce((a, b) => (brightOf(b) > brightOf(a) ? b : a));
    const lit = brightOf(brightest);
    expect(lit).toBeGreaterThan(0.15);

    // 最亮的一条正对着落雷点：这就是「电弧经过处」。
    ctx.root.updateMatrixWorld(true);
    const bandX = brightest.getWorldPosition(new THREE.Vector3()).x;
    const poolX = node(ctx.root, 'strike-pool-0').getWorldPosition(new THREE.Vector3()).x;
    expect(Math.abs(bandX - poolX)).toBeLessThan(ctx.width * 0.12);

    // 蓄能幕无电弧时同一条雨丝显著更暗。
    stage.update(0.1, 120, 'cinematic');
    expect(brightOf(brightest)).toBeLessThan(lit * 0.5);
    stage.dispose();
  });

  it('互动·雷声光暴恰好两次整屏脉冲', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const blast = node(ctx.root, 'thunder-blast');
    let pulses = 0;
    let lit = false;
    for (let s = 0; s <= 300; s += 1) {
      const t = s / 300;
      stage.update(t, t * DURATION, 'cinematic');
      const on = opacity(blast) > 0.3;
      if (on && !lit) pulses += 1;
      lit = on;
    }
    expect(pulses).toBe(2);
    stage.dispose();
  });

  it('余电游走属于第三幕', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const serpent = node(ctx.root, 'serpent-0');
    stage.update(0.5, 600, 'cinematic');
    const duringAct2 = opacity(serpent);
    stage.update(0.88, 1056, 'cinematic');
    expect(opacity(serpent)).toBeGreaterThan(duringAct2);
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    a.update(0.45, 540, 'cinematic');
    b.update(0.45, 540, 'medium');

    for (const element of ELEMENTS) {
      expect(names(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    const count = (root: THREE.Object3D, prefix: string) =>
      nodes(root).filter((o) => o.name.startsWith(prefix)).length;
    // 档位只该动密度：雨丝变稀，三相电弧一根不少。
    expect(count(lo.root, 'rain-band-')).toBeLessThan(count(hi.root, 'rain-band-'));
    expect(count(lo.root, 'rain-band-')).toBeGreaterThan(0);
    expect(count(lo.root, 'bolt-main-')).toBe(3);
    expect(count(hi.root, 'bolt-main-')).toBe(3);

    const lamps = (root: THREE.Object3D) => (node(root, 'charge-lamps') as THREE.InstancedMesh).count;
    expect(lamps(lo.root)).toBeLessThan(lamps(hi.root));
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });

  it('dispose 后 update 静默失效，不抛错', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.dispose();
    expect(() => stage.update(0.5, 600, 'cinematic')).not.toThrow();
  });
});
