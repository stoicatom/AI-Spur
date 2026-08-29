/**
 * 场景 02 phoenix 实现验收（设计规格 §4.2 场景 02）。
 *
 * 断言按规格逐条对应：8 元素齐备、三幕时间轴、全屏覆盖（双翼横贯 2/3 屏宽 +
 * 金雨覆盖全屏）、三条互动、独立签名（对称双翼 + 涅槃金雨 + 热浪折射）、
 * 资源释放。结构照 cg-scene-lightning.test.ts 标杆，取值走共用夹具。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import { PHOENIX_ACT1_END, PHOENIX_ACT2_END, featherFall } from '../overlay/cg-scenes/cg-phoenix';
import { wingPoint } from '../overlay/cg-scenes/phoenix-parts';
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

/** 场景总时长（ms），规格 §4.2 场景 02。 */
const DURATION = 1200;
/** 爆燃瞬间：第三幕起点，金雨与光柱都由此刻起算。 */
const IGNITION = PHOENIX_ACT2_END;

/** 规格八元素的实现节点名，验收即照此清单点数。 */
const ELEMENTS = [
  'wing-plume', 'phoenix-body', 'flame-crown', 'golden-feather-rain',
  'nirvana-pillar', 'heat-haze', 'cloud-rift', 'shock-plume-ring',
] as const;

const scene = resolveScene('phoenix');
const at = (root: THREE.Object3D, prefix: string) =>
  nodes(root).filter((o) => o.name.startsWith(prefix));

describe('场景 02 phoenix', () => {
  it('已注册且签名声明对称双翼与热浪折射', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('rise');
    expect(scene!.config.signature).toContain('对称双翼');
    expect(scene!.config.signature).toContain('热浪折射');
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

  it('签名·双翼严格对称：左右翼由同一套参数镜像生成', () => {
    // 纯函数层：同一 k 的左右取点，x 恰好取反、y 完全相同。
    for (let s = 0; s <= 10; s += 1) {
      const k = s / 10;
      const right = wingPoint(k, 1, 600);
      const left = wingPoint(k, -1, 600);
      expect(left.x).toBeCloseTo(-right.x, 10);
      expect(left.y).toBeCloseTo(right.y, 10);
    }
  });

  it('签名·场景内左右翼羽逐片镜像', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.15, 180, 'cinematic');
    ctx.root.updateMatrixWorld(true);

    const rights = at(ctx.root, 'wing-feather-r-');
    expect(rights.length).toBeGreaterThan(2);
    for (const right of rights) {
      const mirror = node(ctx.root, right.name.replace('-r-', '-l-'));
      const a = right.getWorldPosition(new THREE.Vector3());
      const b = mirror.getWorldPosition(new THREE.Vector3());
      expect(b.x).toBeCloseTo(-a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
    }
    stage.dispose();
  });

  it('双翼展开横贯 2/3 屏宽（规格全屏要求）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 展翅在第一幕末完成，此刻量翼展。
    stage.update(PHOENIX_ACT1_END, PHOENIX_ACT1_END * DURATION, 'cinematic');
    const span = box(node(ctx.root, 'wing-plume')).getSize(new THREE.Vector3()).x;
    expect(span).toBeGreaterThan(ctx.width * (2 / 3));
    stage.dispose();
  });

  it('金雨覆盖全屏、热浪折射层铺满屏幕', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    stage.update(0.95, 0.95 * DURATION, 'cinematic');

    const rain = box(node(ctx.root, 'golden-feather-rain')).getSize(new THREE.Vector3());
    expect(rain.x).toBeGreaterThan(ctx.width * 0.85);
    expect(rain.y).toBeGreaterThan(ctx.height * 0.8);

    const haze = box(node(ctx.root, 'heat-haze')).getSize(new THREE.Vector3());
    expect(haze.x).toBeGreaterThanOrEqual(ctx.width);
    expect(haze.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      stage.update(t, t * DURATION, 'cinematic');
      return visualSnapshot(ctx.root);
    };
    // 0–250 展翅 / 250–800 盘旋撕云 / 800–1200 爆燃金雨
    const act1 = snapshot(0.1);
    const act2 = snapshot(0.45);
    const act3 = snapshot(0.9);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    expect(act1).not.toBe(act3);
    stage.dispose();
  });
  it('签名·涅槃金雨：重力反转是曲线自身的性质', () => {
    // 下落半程被余烬托举一次：速度先向下、中段转为向上、随后重归向下。
    const speed = (p: number) => {
      const step = 1e-4;
      return (featherFall(p + step).y - featherFall(p - step).y) / (2 * step);
    };
    expect(speed(0.15)).toBeLessThan(0);
    expect(speed(0.5)).toBeGreaterThan(0);
    expect(speed(0.9)).toBeLessThan(0);

    // 托举是「短促」的：上升窗口远短于整段下落。
    let rising = 0;
    for (let s = 0; s <= 200; s += 1) {
      if (speed(s / 200) > 0) rising += 1;
    }
    expect(rising).toBeGreaterThan(0);
    expect(rising).toBeLessThan(80);

    // 反转只发生一次：符号变化恰好两次（下→上、上→下）。
    let flips = 0;
    let previous = Math.sign(speed(0.02));
    for (let s = 2; s <= 100; s += 1) {
      const sign = Math.sign(speed(s / 100));
      if (sign !== 0 && sign !== previous) {
        flips += 1;
        previous = sign;
      }
    }
    expect(flips).toBe(2);

    // 净位移仍是落下：托举只是打断，不是把羽毛送回天上。
    expect(featherFall(1).y).toBeLessThan(featherFall(0).y);
    // 旋转渐落：整段持续自转。
    expect(featherFall(1).spin).toBeGreaterThan(featherFall(0.5).spin);
  });

  it('签名·金羽在场景内真的被托升一次', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const feather = node(ctx.root, 'gold-feather-0');
    const heights: number[] = [];
    for (let s = 0; s <= 60; s += 1) {
      const t = IGNITION + (1 - IGNITION) * (s / 60);
      stage.update(t, t * DURATION, 'cinematic');
      heights.push(feather.position.y);
    }
    // 采样序列里存在一段回升：先落到一个局部谷底，被托起，然后继续落。
    // 找的是「局部」谷底——终点才是全程最低点，那不是托举的证据。
    let trough = -1;
    for (let i = 1; i < heights.length - 1; i += 1) {
      if (heights[i] < heights[i - 1] && heights[i + 1] > heights[i]) {
        trough = i;
        break;
      }
    }
    expect(trough, '金羽没有被托升过').toBeGreaterThan(0);
    const lift = Math.max(...heights.slice(trough));
    expect(lift).toBeGreaterThan(heights[trough]);
    // 托举之后仍旧落下，净位移向下。
    expect(heights[heights.length - 1]).toBeLessThan(heights[trough]);
    expect(heights[heights.length - 1]).toBeLessThan(heights[0]);
    stage.dispose();
  });

  it('互动·火羽在翼尖汇聚：翼形轨迹末端收束', () => {
    // 翼根到翼尖，横向铺开而纵向收窄——汇聚点就是翼尖。
    const root = wingPoint(0, 1, 600);
    const mid = wingPoint(0.5, 1, 600);
    const tip = wingPoint(1, 1, 600);
    expect(Math.abs(tip.x)).toBeGreaterThan(Math.abs(mid.x));
    expect(Math.abs(mid.x)).toBeGreaterThan(Math.abs(root.x));
    // 翼尖是轨迹上离躯干最远的一点，火羽沿轨迹推进即向此汇聚。
    const far = Math.hypot(tip.x, tip.y);
    expect(far).toBeGreaterThan(Math.hypot(mid.x, mid.y));
  });

  it('互动·热浪真的推开云层：撕裂量随热浪强度走', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const cloud = node(ctx.root, 'cloud-rift');
    const haze = node(ctx.root, 'heat-haze');

    // 展翅幕热浪未起，云层完整。
    stage.update(0.06, 72, 'cinematic');
    const calmHaze = uniformOf(haze, 'uRefract');
    const calmRift = uniformOf(cloud, 'uRift');

    // 盘旋幕热浪起势，同一帧云层被推开。
    stage.update(0.6, 720, 'cinematic');
    const hotHaze = uniformOf(haze, 'uRefract');
    const hotRift = uniformOf(cloud, 'uRift');

    expect(hotHaze).toBeGreaterThan(calmHaze);
    expect(hotRift).toBeGreaterThan(calmRift);
    // 撕裂量由热浪派生，两者同向：不是各演各的两条曲线。
    expect(hotRift).toBeGreaterThan(0.1);
    expect(calmRift).toBeLessThan(hotRift * 0.6);
    stage.dispose();
  });

  it('互动·光柱在爆燃瞬间照亮云层', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const pillar = node(ctx.root, 'nirvana-pillar');
    const cloud = node(ctx.root, 'cloud-rift');

    stage.update(0.6, 720, 'cinematic');
    const beforePillar = uniformOf(pillar, 'uIntensity');
    const beforeLit = uniformOf(cloud, 'uLit');

    // 爆燃瞬间：光柱冲起，云层同时被照亮。
    const flash = IGNITION + 0.06;
    stage.update(flash, flash * DURATION, 'cinematic');
    const flashPillar = uniformOf(pillar, 'uIntensity');
    const flashLit = uniformOf(cloud, 'uLit');
    expect(flashPillar).toBeGreaterThan(beforePillar);
    expect(flashLit).toBeGreaterThan(beforeLit);
    expect(flashLit).toBeGreaterThan(0.15);

    // 光柱退场后云层照度随之落回：照亮由光柱驱动，不是独立的一条亮度曲线。
    stage.update(0.99, 1188, 'cinematic');
    expect(uniformOf(pillar, 'uIntensity')).toBeLessThan(flashPillar);
    expect(uniformOf(cloud, 'uLit')).toBeLessThan(flashLit);
    stage.dispose();
  });

  it('凤凰躯干与火焰冠：盘旋幕在场，爆燃后散去', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const body = node(ctx.root, 'phoenix-body');
    const crown = node(ctx.root, 'flame-crown');

    stage.update(0.5, 600, 'cinematic');
    const bodyMid = opacity(body);
    const crownMid = opacity(crown);
    expect(bodyMid).toBeGreaterThan(0.2);
    expect(crownMid).toBeGreaterThan(0.1);

    // 爆燃成金雨后躯干不复存在。
    stage.update(0.97, 1164, 'cinematic');
    expect(opacity(body)).toBeLessThan(bodyMid * 0.5);
    expect(opacity(crown)).toBeLessThan(crownMid * 0.6);
    stage.dispose();
  });

  it('冲击羽环形波是双层环，且只在爆燃后扩张', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const rings = at(ctx.root, 'shock-ring-');
    expect(rings).toHaveLength(2);

    stage.update(0.5, 600, 'cinematic');
    const before = rings.map((r) => r.scale.x);
    const flash = IGNITION + 0.1;
    stage.update(flash, flash * DURATION, 'cinematic');
    for (let i = 0; i < rings.length; i += 1) {
      expect(rings[i].scale.x).toBeGreaterThan(before[i]);
      expect(opacity(rings[i])).toBeGreaterThan(0);
    }
    // 双层：外环跑在内环之前，不是两个同尺寸的环叠在一起。
    expect(rings[1].scale.x).not.toBeCloseTo(rings[0].scale.x, 3);
    stage.dispose();
  });

  it('规格粒子层落地：火羽与金雨走 quarks', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 规格元素①「quarks 沿翼形轨迹」、④「quarks 旋转渐落」：几何层的翼羽
    // 与金羽表达不了拖迹与余烬颗粒，必须真有 quarks 粒子系统在场。
    const renderer = nodes(ctx.root).find((o) => o.type === 'BatchedRenderer');
    expect(renderer, '缺 quarks 粒子层').toBeDefined();
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    a.update(0.9, 1080, 'cinematic');
    b.update(0.9, 1080, 'medium');

    for (const element of ELEMENTS) {
      expect(names(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }

    // 档位只该动密度：金羽变稀，双翼一片不少且仍然对称。
    expect(at(lo.root, 'gold-feather-').length).toBeLessThan(at(hi.root, 'gold-feather-').length);
    expect(at(lo.root, 'gold-feather-').length).toBeGreaterThan(0);
    expect(at(lo.root, 'wing-feather-r-').length).toBe(at(lo.root, 'wing-feather-l-').length);
    expect(at(hi.root, 'wing-feather-r-').length).toBe(at(hi.root, 'wing-feather-l-').length);
    expect(at(lo.root, 'shock-ring-').length).toBe(2);
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
