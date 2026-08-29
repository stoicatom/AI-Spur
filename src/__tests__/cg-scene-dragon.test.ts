/**
 * 场景 04 dragon 实现验收（设计规格 §4.2 场景 04）。
 *
 * 断言按规格逐条对应：8 元素齐备、骨骼链 12~16 节且节间连续、三幕时间轴、
 * 全屏对角线蜿蜒 + 云海铺底、三条互动（珠光沿鳞流走 / 龙息推散云层 /
 * 珠轨随摆幅）、独立签名（骨骼链 mesh 全库唯一）、档位密度、资源释放。
 * 结构照 cg-scene-lightning.test.ts 标杆，取值走共用夹具。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import {
  BREATH_END,
  BREATH_START,
  DRAGON_ACT1_END,
  DRAGON_ACT2_END,
} from '../overlay/cg-scenes/cg-dragon';
import {
  SPINE_JOINT_COUNT,
  dragonSpine,
  orbitScaleFor,
  spineSway,
} from '../overlay/cg-scenes/dragon-spine';
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

/** 场景总时长（ms），规格 §4.2 场景 04。 */
const DURATION = 1200;

/** 规格八元素的实现节点名，验收即照此清单点数。 */
const ELEMENTS = [
  'dragon-spine', 'scale-shimmer', 'claw-cloud', 'light-pearl',
  'pearl-orbit', 'rain-veil', 'dragon-breath', 'mist-realm',
] as const;

/** 取一族前缀节点，档位密度与流光扫描都按前缀点名。 */
const family = (root: THREE.Object3D, prefix: string): THREE.Object3D[] =>
  nodes(root).filter((o) => o.name.startsWith(prefix));

/** 骨骼链各节的链上坐标；摆幅与连续性都由这一串算出来。 */
const spinePoints = (root: THREE.Object3D): { x: number; y: number }[] =>
  family(root, 'spine-joint-')
    .sort((a, b) => Number(a.name.slice(12)) - Number(b.name.slice(12)))
    .map((o) => ({ x: o.position.x, y: o.position.y }));

const scene = resolveScene('dragon');

describe('场景 04 dragon', () => {
  it('已注册且签名声明骨骼链与缠绕', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('wave');
    expect(scene!.config.signature).toContain('骨骼链');
    expect(scene!.config.signature).toContain('缠绕');
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

  it('骨骼链节数落在规格的 12~16 节', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(SPINE_JOINT_COUNT).toBeGreaterThanOrEqual(12);
    expect(SPINE_JOINT_COUNT).toBeLessThanOrEqual(16);
    expect(spinePoints(ctx.root)).toHaveLength(SPINE_JOINT_COUNT);
    stage.dispose();
  });
});

describe('场景 04 dragon · 骨骼链（独立签名）', () => {
  it('相邻节间距恒定：后节真的挂在前节上而非各自乱动', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 扫过全时长：任何一帧都不许出现节与节脱开或叠死。
    for (let s = 0; s <= 40; s += 1) {
      const t = s / 40;
      stage.update(t, t * DURATION, 'cinematic');
      const pts = spinePoints(ctx.root);
      const gaps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
      const seg = gaps[0];
      for (const gap of gaps) {
        expect(gap, `t=${t} 节间距漂了`).toBeCloseTo(seg, 3);
      }
      expect(seg).toBeGreaterThan(0);
    }
    stage.dispose();
  });

  it('正弦波相位差让链身蜿蜒成 S：链上曲率至少变向一次', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.5, 600, 'cinematic');
    const pts = spinePoints(ctx.root);
    // 相邻段向量叉积正负都出现，说明链是波不是折成一个方向的弓。
    const turns: number[] = [];
    for (let i = 2; i < pts.length; i += 1) {
      const ax = pts[i - 1].x - pts[i - 2].x;
      const ay = pts[i - 1].y - pts[i - 2].y;
      const bx = pts[i].x - pts[i - 1].x;
      const by = pts[i].y - pts[i - 1].y;
      turns.push(ax * by - ay * bx);
    }
    // 阈值按段长平方定标：纯符号判断会被浮点噪声蒙过去（直链的叉积
    // 也会出现 ±1e-10），必须要求弯折有实际幅度。
    const seg = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const real = seg * seg * 0.05;
    expect(turns.some((v) => v > real), '链身没有左弯').toBe(true);
    expect(turns.some((v) => v < -real), '链身没有右弯').toBe(true);
    stage.dispose();
  });

  it('纯函数层：摆幅第二幕最大，首末幕更小', () => {
    const act1 = spineSway(DRAGON_ACT1_END * 0.5);
    const act2 = spineSway((DRAGON_ACT1_END + DRAGON_ACT2_END) * 0.5);
    const act3 = spineSway(0.95);
    expect(act2).toBeGreaterThan(act1);
    expect(act2).toBeGreaterThan(act3);
    expect(act1).toBeGreaterThan(0);
  });

  it('纯函数层：同一摆幅下链形可重现，摆幅变大则离轴位移变大', () => {
    const base = { width: 1920, height: 1080, advance: 0.6, phase: 1.2 };
    const calm = dragonSpine({ ...base, sway: 0.15 });
    const wild = dragonSpine({ ...base, sway: 1 });
    expect(calm).toHaveLength(SPINE_JOINT_COUNT);
    // 确定性：同参数两次调用结果一致，便于把签名机制当纯函数验收。
    expect(dragonSpine({ ...base, sway: 0.15 })).toEqual(calm);

    // 摆幅只该改「离轴摆开的程度」，链长不变。
    const spread = (pts: typeof calm) => {
      const head = pts[0];
      const tail = pts[pts.length - 1];
      const axis = Math.atan2(tail.y - head.y, tail.x - head.x);
      return Math.max(...pts.map((p) => Math.abs(
        (p.x - head.x) * -Math.sin(axis) + (p.y - head.y) * Math.cos(axis),
      )));
    };
    expect(spread(wild)).toBeGreaterThan(spread(calm) * 1.5);
  });

  it('龙身蜿蜒横穿全屏对角线（规格全屏要求）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.5, 600, 'cinematic');
    const size = box(node(ctx.root, 'dragon-spine')).getSize(new THREE.Vector3());
    // 对角线跨屏：横向吃掉大半屏宽，纵向也铺开，不是一条水平带。
    expect(size.x).toBeGreaterThan(ctx.width * 0.7);
    expect(size.y).toBeGreaterThan(ctx.height * 0.45);
    stage.dispose();
  });

  it('云海铺满屏底（规格全屏要求）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.2, 240, 'cinematic');
    const bounds = box(node(ctx.root, 'claw-cloud'));
    expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(ctx.width);
    expect(bounds.min.y).toBeLessThan(-ctx.height * 0.4);
    stage.dispose();
  });
});

describe('场景 04 dragon · 三幕与互动', () => {
  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      stage.update(t, t * DURATION, 'cinematic');
      return visualSnapshot(ctx.root);
    };
    // 0–300 云破龙现 / 300–900 蜿蜒缠珠+龙息 / 900–1200 腾入云、珠光余晖
    const act1 = snapshot(0.12);
    const act2 = snapshot(0.5);
    const act3 = snapshot(0.95);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    expect(act1).not.toBe(act3);
    stage.dispose();
  });

  it('第一幕龙自云雾中破出：龙身在第一幕内由无到有', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const segments = family(ctx.root, 'spine-seg-');
    expect(segments.length).toBe(SPINE_JOINT_COUNT);
    const bright = () => Math.max(...segments.map(opacity));

    stage.update(0.01, 12, 'cinematic');
    const dawn = bright();
    stage.update(DRAGON_ACT1_END, DRAGON_ACT1_END * DURATION, 'cinematic');
    expect(bright()).toBeGreaterThan(dawn + 0.1);
    stage.dispose();
  });

  it('龙息只在第二幕喷吐一次', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const breath = node(ctx.root, 'dragon-breath');
    let bursts = 0;
    let lit = false;
    for (let s = 0; s <= 300; s += 1) {
      const t = s / 300;
      stage.update(t, t * DURATION, 'cinematic');
      const on = opacity(breath) > 0.25;
      if (on && !lit) bursts += 1;
      lit = on;
    }
    expect(bursts).toBe(1);

    // 喷吐窗口落在第二幕内，不越界到云破幕或余晖幕。
    expect(BREATH_START).toBeGreaterThan(DRAGON_ACT1_END);
    expect(BREATH_END).toBeLessThan(DRAGON_ACT2_END);
    stage.dispose();
  });

  it('第三幕龙腾入云、珠光余晖：龙身淡出而珠仍亮', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const head = node(ctx.root, 'spine-seg-0');
    const halo = node(ctx.root, 'pearl-halo');

    stage.update(0.5, 600, 'cinematic');
    const bodyAct2 = opacity(head);
    stage.update(0.98, 1176, 'cinematic');
    // 龙走了，珠光还留着——这才是「余晖」。
    expect(opacity(head)).toBeLessThan(bodyAct2 * 0.5);
    expect(opacity(halo)).toBeGreaterThan(0.1);
    stage.dispose();
  });

  it('互动①·龙身缠绕光珠时珠光沿鳞片流走', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const scales = family(ctx.root, 'scale-band-');
    expect(scales.length).toBeGreaterThan(3);

    // 缠珠期：最亮的鳞带随时间沿链向后移动，说明珠光在「流」而非整排齐亮。
    const peakIndex = (): number => {
      let best = -1;
      let bestValue = -1;
      for (const band of scales) {
        const value = uniformOf(band, 'uFlow');
        if (value > bestValue) { bestValue = value; best = Number(band.name.slice(11)); }
      }
      return best;
    };

    stage.update(0.42, 504, 'cinematic');
    const early = peakIndex();
    stage.update(0.62, 744, 'cinematic');
    const later = peakIndex();
    expect(early).toBeGreaterThanOrEqual(0);
    expect(later).not.toBe(early);

    // 云破幕龙还没缠上珠，鳞上没有珠光可流。
    stage.update(0.05, 60, 'cinematic');
    const idle = Math.max(...scales.map((b) => uniformOf(b, 'uFlow')));
    stage.update(0.5, 600, 'cinematic');
    const coiled = Math.max(...scales.map((b) => uniformOf(b, 'uFlow')));
    expect(coiled).toBeGreaterThan(idle * 2 + 0.05);
    stage.dispose();
  });

  it('互动②·龙息推散云层：喷吐时云密度被压低', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const cloud = node(ctx.root, 'claw-cloud');

    // 同在第二幕内比较，排除「幕间云本来就在散」的干扰。
    const before = (BREATH_START + DRAGON_ACT1_END) / 2;
    stage.update(before, before * DURATION, 'cinematic');
    const calm = uniformOf(cloud, 'uDensity');
    const gapsCalm = uniformOf(cloud, 'uGaps');

    const mid = (BREATH_START + BREATH_END) / 2;
    stage.update(mid, mid * DURATION, 'cinematic');
    expect(uniformOf(cloud, 'uDensity')).toBeLessThan(calm);
    // 被推开的云要留出空隙，不只是整体变淡。
    expect(uniformOf(cloud, 'uGaps')).toBeGreaterThan(gapsCalm);
    stage.dispose();
  });

  it('互动③·珠轨随龙身摆幅摆动', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const ring = node(ctx.root, 'orbit-ring-0');

    // 纯函数层：摆幅越大轨道张得越开。
    expect(orbitScaleFor(1)).toBeGreaterThan(orbitScaleFor(0.2));

    // 场景层：两个取样点都在第一幕之后（龙已完全现身），
    // 差别只剩摆幅——否则「轨道随现身淡入张开」也能蒙过这条断言。
    stage.update(0.5, 600, 'cinematic');
    const wide = ring.scale.x;
    stage.update(0.85, 1020, 'cinematic');
    const narrow = ring.scale.x;
    expect(spineSway(0.5)).toBeGreaterThan(spineSway(0.85));
    expect(wide).toBeGreaterThan(narrow);
    stage.dispose();
  });

  it('光珠被龙身缠住：缠珠期珠心落在链身包围盒内', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.5, 600, 'cinematic');
    ctx.root.updateMatrixWorld(true);
    const pearl = node(ctx.root, 'light-pearl').getWorldPosition(new THREE.Vector3());
    const spine = box(node(ctx.root, 'dragon-spine'));
    // 「缠绕」的最低要求：珠在龙身覆盖的范围里，不是各在屏幕两头。
    expect(spine.containsPoint(new THREE.Vector3(pearl.x, pearl.y, spine.min.z))).toBe(true);
    stage.dispose();
  });
});

describe('场景 04 dragon · 粒子层、档位与释放', () => {
  it('规格粒子层落地：鳞光与龙息走 quarks', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 规格元素②「quarks 沿龙身表面流窜」、⑦「一次喷吐火团 emitter」：
    // 几何层的鳞带与火团表达不了飞散颗粒，必须真有 quarks 粒子系统在场。
    const renderer = nodes(ctx.root).find((o) => o.type === 'BatchedRenderer');
    expect(renderer, '缺 quarks 粒子层').toBeDefined();
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    a.update(0.5, 600, 'cinematic');
    b.update(0.5, 600, 'medium');

    for (const element of ELEMENTS) {
      expect(names(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    // 档位只该动密度：雨丝变稀，骨骼链一节不少。
    expect(family(lo.root, 'rain-thread-').length).toBeLessThan(family(hi.root, 'rain-thread-').length);
    expect(family(lo.root, 'rain-thread-').length).toBeGreaterThan(0);
    expect(family(lo.root, 'spine-joint-').length).toBe(SPINE_JOINT_COUNT);
    expect(family(hi.root, 'spine-joint-').length).toBe(SPINE_JOINT_COUNT);
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
