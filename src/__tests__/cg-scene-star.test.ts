import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-star';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  STAR_ACT1_END,
  STAR_ACT2_END,
  starChromaFrame,
} from '../overlay/cg-scenes/cg-star';
import {
  AXIS_COUNT,
  FRAME_COUNT,
  HOOP_COUNT,
  axisAngle,
  axisLength,
  chromaFrame,
  chromaSeed,
  frameIndex,
  hoopRadii,
  hoopRadius,
  isChromaFrame,
  starReach,
  starScale,
} from '../overlay/cg-scenes/star-signature';
import { GRIT_RELEASE_AT, PUSH_BAND, createGritField, pushWeight } from '../overlay/cg-scenes/star-grit';
import { createSceneResources } from '../overlay/cg-scene-kit';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 14 的 8 个构成件的具名节点。 */
const NAMED_ELEMENTS = [
  'star-core',      // ① 五芒星体
  'ray-0',          // ② 星轨
  'grit-0',         // ③ 星屑
  'halo-0',         // ④ 光晕层
  'twinkle-field',  // ⑤ 小星星点缀
  'hoop-0',         // ⑥ 环状波
  'chroma-flash',   // ⑦ 色彩微突变
  'relic-0',        // ⑧ 残星点
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('star');
  if (!scene) throw new Error('star 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/**
 * 精确正则收集。
 *
 * 前缀撞车会让断言测错对象却照样通过（本项目真实事故：`shard-` 同时命中
 * 刚体与反光片，「重力逐帧加速」实际测的是每帧抄位置的贴片）。本场景的
 * 前缀 ray/tip/grit/halo/hoop/speck/relic 两两不互相包含，配合全形正则
 * `^x-\d+$` 才能保证物理断言测的确实是刚体。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/**
 * 反事实对照用：单独跑一个星屑场，返回每次推进后各刚体的径向距离。
 *
 * 直接建场（不经场景）是为了能替换 `radiiAt` —— 互动②的因果只有在
 * 「同一初始条件，只换环波是否到场」的对照下才测得到。
 */
function traceGrit(radiiAt: (t: number) => number[], ts: number[]): number[][] {
  const ctx = makeSceneCtx();
  const res = createSceneResources(ctx.root, ctx.origin, 'star-grit-probe');
  const field = createGritField(
    res, ctx, starScale(ctx.width, ctx.height), starReach(ctx.width, ctx.height), -ctx.height * 0.34,
  );
  const out: number[][] = [];
  for (const t of ts) {
    field.advance(t, radiiAt);
    out.push(field.pieces.map((p) => Math.hypot(p.body.position.x, p.body.position.y)));
  }
  field.dispose();
  res.dispose();
  return out;
}

/** 某节点当前颜色的十六进制串（彩蛋断言用）。 */
function tintOf(o: THREE.Object3D): string {
  const material = (o as THREE.Mesh).material as THREE.ShaderMaterial;
  return (material.uniforms.uColor.value as THREE.Color).getHexString();
}

describe('场景 14 star（星芒礼花）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('star');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toEqual([
      '五芒星体', '星轨', '星屑', '光晕层', '小星星点缀', '环状波', '色彩微突变', '残星点',
    ]);
    expect(scene!.config.signature).toContain('五轴对称');
    expect(scene!.config.signature).toContain('随机单帧变色');
    expect(scene!.config.preset).toBe('star-burst');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'ray')).toHaveLength(AXIS_COUNT);
    expect(collectExact(ctx.root, 'hoop')).toHaveLength(HOOP_COUNT);
    expect(collectExact(ctx.root, 'grit').length).toBeGreaterThan(10);
    stage.dispose();
  });

  // 签名前半（角度）：五条星轨的方向角必须两两相差 72°。
  // 改成 4 轴（AXIS_COUNT=4 ⇒ 90°）这条立刻红。
  it('签名·五轴对称——五条星轨方向角两两相差 72°', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    const rays = collectExact(ctx.root, 'ray');
    expect(rays, '星轨条数不是 5').toHaveLength(5);

    // 从每条轨的实际世界位置反解方向角（不看 axisAngle，测渲染结果）。
    const angles = rays
      .map((r) => Math.atan2(r.position.y, r.position.x))
      .sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < angles.length; i += 1) gaps.push(angles[i] - angles[i - 1]);
    // 首尾环回的那一段。
    gaps.push(angles[0] + Math.PI * 2 - angles[angles.length - 1]);

    const step = (Math.PI * 2) / 5;
    for (let i = 0; i < gaps.length; i += 1) {
      expect(gaps[i], `第 ${i} 个夹角 ${(gaps[i] * 180 / Math.PI).toFixed(3)}°`).toBeCloseTo(step, 5);
    }
    stage.dispose();
  });

  // 签名前半（长度）：对称还要求五轨**同量级**——不能有一条特别长。
  // 让任一轴长度翻倍这条立刻红。
  it('签名·五轴对称——五条星轨长度落在同一量级', () => {
    const { stage, ctx } = build();
    for (const t of [0.35, 0.55, 0.75]) {
      at(stage, t);
      const lens = collectExact(ctx.root, 'ray').map((r) => Math.hypot(r.position.x, r.position.y));
      const lo = Math.min(...lens);
      const hi = Math.max(...lens);
      expect(lo, `t=${t} 有轨未伸展`).toBeGreaterThan(0);
      // 同量级：最长不超过最短的 1.05 倍（对称允许的只是浮点误差）。
      expect(hi / lo, `t=${t} 轨长比 ${(hi / lo).toFixed(3)}`).toBeLessThan(1.05);
    }
    // 轨顶锚点也必须同长——星点从这里剥落，锚点不齐会让星点云偏心。
    at(stage, 0.6);
    const tips = collectExact(ctx.root, 'tip').map((o) => Math.hypot(o.position.x, o.position.y));
    expect(tips).toHaveLength(5);
    expect(Math.max(...tips) / Math.min(...tips)).toBeLessThan(1.05);
    stage.dispose();
  });

  // 对称的源头是纯函数本身：axisLength 不接受轴索引，
  // 想让某一轴更长必须改函数签名。
  it('签名·轨长纯函数与轴无关（对称不是靠调用方自觉）', () => {
    expect(axisLength.length, 'axisLength 不应接受轴索引').toBe(2);
    const step = (Math.PI * 2) / AXIS_COUNT;
    for (let i = 1; i < AXIS_COUNT; i += 1) {
      expect(axisAngle(i) - axisAngle(i - 1)).toBeCloseTo(step, 12);
    }
    expect(AXIS_COUNT).toBe(5);
  });

  // 签名后半：整幕**恰好一帧**颜色突变，前后帧颜色不同。
  it('签名·随机单帧变色彩蛋——整场恰好一帧颜色突变', () => {
    const { stage, ctx } = build();
    const target = starChromaFrame(ctx);
    expect(target, '彩蛋帧应落在第二幕内').toBeGreaterThan(FRAME_COUNT * STAR_ACT1_END);
    expect(target).toBeLessThan(FRAME_COUNT * STAR_ACT2_END);

    // 逐帧格采样（每格取格中点），统计与「常态色」不同的帧数。
    const colors: string[] = [];
    for (let f = 0; f < FRAME_COUNT; f += 1) {
      at(stage, (f + 0.5) / FRAME_COUNT);
      colors.push(tintOf(node(ctx.root, 'star-core')));
    }
    const counts = new Map<string, number>();
    for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
    // 恰好两种颜色：常态色 × 71 帧 + 彩蛋色 × 1 帧。
    expect([...counts.values()].sort((a, b) => a - b), `色相分布 ${[...counts]}`).toEqual([1, FRAME_COUNT - 1]);

    // 突变帧就是种子算出的那一帧，且前后帧都与它不同。
    const oddIndex = colors.findIndex((c) => counts.get(c) === 1);
    expect(oddIndex).toBe(target);
    expect(colors[oddIndex]).not.toBe(colors[oddIndex - 1]);
    expect(colors[oddIndex]).not.toBe(colors[oddIndex + 1]);
    // 彩蛋帧的染色片同时亮起（画面真的闪了一下）。
    at(stage, (target + 0.5) / FRAME_COUNT);
    expect(uniformOf(node(ctx.root, 'chroma-flash'), 'uAlpha')).toBeGreaterThan(0.3);
    at(stage, (target + 1.5) / FRAME_COUNT);
    expect(uniformOf(node(ctx.root, 'chroma-flash'), 'uAlpha')).toBe(0);
    stage.dispose();
  });

  it('签名·彩蛋帧确定性可复现（同种子同帧，不同种子会换帧）', () => {
    const a = build();
    const b = build();
    expect(starChromaFrame(b.ctx)).toBe(starChromaFrame(a.ctx));

    const read = (s: CgStage, root: THREE.Object3D, f: number): string => {
      at(s, (f + 0.5) / FRAME_COUNT);
      return tintOf(node(root, 'star-core'));
    };
    const target = starChromaFrame(a.ctx);
    // 两次构建在同一帧读到**同一个突变色**：既要相等，又要确实是突变
    // （只断言相等的话，彩蛋被摘掉后两边都读到常态色，照样相等）。
    const eggA = read(a.stage, a.ctx.root, target);
    const eggB = read(b.stage, b.ctx.root, target);
    expect(eggB, '同种子两次构建的彩蛋色不一致').toBe(eggA);
    expect(eggA, '目标帧没有发生突变（彩蛋不存在？）').not.toBe(read(a.stage, a.ctx.root, target + 1));

    // 种子函数本身：不同输入落到不同帧（不是常量帧）。
    const frames = new Set(
      ['#5B7CFF', '#FF4400', '#22DDAA', '#8844FF', '#FFCC00']
        .map((hex) => chromaFrame(chromaSeed(`star|${hex}|1920x1080`))),
    );
    expect(frames.size, '彩蛋帧不随种子变化').toBeGreaterThan(1);
    a.stage.dispose();
    b.stage.dispose();
  });

  it('签名·彩蛋按帧格定位而非按 update 调用次数（稀疏/密集一致）', () => {
    const seed = chromaSeed('star|5b7cff|1920x1080');
    const hit: number[] = [];
    for (let f = 0; f < FRAME_COUNT; f += 1) {
      if (isChromaFrame((f + 0.5) / FRAME_COUNT, seed)) hit.push(f);
    }
    expect(hit).toHaveLength(1);
    // 同一帧格内多次采样都算同一帧（不会因为调用次数多而多次触发）。
    const f = hit[0];
    for (const sub of [0.05, 0.3, 0.6, 0.95]) {
      expect(frameIndex((f + sub) / FRAME_COUNT)).toBe(f);
      expect(isChromaFrame((f + sub) / FRAME_COUNT, seed)).toBe(true);
    }
  });

  // 物理：星屑受重力——竖直位移的二阶差分**每一段**都为负。
  //
  // 两个采样约束，缺一条这断言就测不到重力本身：
  // ① 采样点落在物理步的整数格上（1/60s ÷ 1.2s = 1/72 幕）。固定步累加器
  //    只在整步上前进，非整格采样会让相邻两次分别推进 1 步与 2 步，
  //    差分忽大忽小——那是采样走样，不是重力。
  // ② 采样窗停在第一圈环波发出之前。环波扫到星屑会把它往外推（互动②），
  //    向外含向上分量，二阶差分会翻正——那是另一条机制在生效。
  it('物理·星屑受重力（竖直位移二阶差分逐段为负）', () => {
    const { stage, ctx } = build();
    const ys: number[] = [];
    for (let i = 1; i <= 8; i += 1) {
      at(stage, GRIT_RELEASE_AT + i / 72);
      ys.push(node(ctx.root, 'grit-0').position.y);
    }
    const d1: number[] = [];
    for (let i = 1; i < ys.length; i += 1) d1.push(ys[i] - ys[i - 1]);
    for (let i = 1; i < d1.length; i += 1) {
      const d2 = d1[i] - d1[i - 1];
      // 逐段严格为负 = 一直在向下加速。
      expect(d2, `第 ${i} 段未向下加速（${d1[i - 1].toFixed(3)} → ${d1[i].toFixed(3)}）`).toBeLessThan(0);
      // 量级必须是 g·Δt²（本场景约 0.46px），不是阻尼带来的千分之几像素：
      // 重力置零后阻尼仍会让 d2 微负（实测 |d2| ≈ 0.0014），只测符号会漏。
      expect(Math.abs(d2), `第 ${i} 段二阶差分仅 ${d2.toFixed(4)}px，疑似无重力`).toBeGreaterThan(0.2);
    }
    stage.dispose();
  });

  it('物理·星屑落地反弹且高度衰减（测单步升幅，不测总回升）', () => {
    const { stage, ctx } = build();
    // 取一颗向下散出的星屑：先跑一遍找出触底最早的那颗。
    const ys: number[] = [];
    const samples = 200;
    for (let i = 0; i <= samples; i += 1) {
      at(stage, 0.2 + (i / samples) * 0.8);
      ys.push(node(ctx.root, 'grit-1').position.y);
    }
    const floor = Math.min(...ys);
    const floorIdx = ys.indexOf(floor);
    expect(floorIdx, '星屑未触底').toBeGreaterThan(0);

    // restitution=0 时星屑仍会沿地面滑行，而每步地面钳位会把 y 微抬
    // （本项目实测总回升 19.5px 照样满足「总回升 >10px」）。真反弹的
    // 判别特征是**单步升幅大**：反弹几十 px/步，滑行仅 3.77px/步。
    let maxStepRise = 0;
    for (let i = floorIdx + 1; i < ys.length; i += 1) {
      maxStepRise = Math.max(maxStepRise, ys[i] - ys[i - 1]);
    }
    expect(maxStepRise, '星屑未反弹（restitution 未施加？）').toBeGreaterThan(8);

    // 能量衰减：反弹顶点低于触底前的高度。
    const rebound = Math.max(...ys.slice(floorIdx));
    const before = Math.max(...ys.slice(0, floorIdx + 1));
    expect(rebound, '反弹高度未衰减').toBeLessThan(before);
    stage.dispose();
  });

  // 互动①：星点必须出生在**某条星轨顶端附近**，不是随机撒。
  it('互动·星轨顶点剥落小星点（出生在轨顶附近，不是随机撒）', () => {
    const { stage, ctx } = build();
    const reach = starReach(ctx.width, ctx.height);
    let checked = 0;

    // 沿第二幕逐点采样，逮住每颗星点「刚出生」的那一刻。
    for (let i = 0; i <= 120; i += 1) {
      const t = 0.24 + (i / 120) * 0.44;
      at(stage, t);
      const tips = collectExact(ctx.root, 'tip').map((o) => o.position.clone());
      for (const speck of collectExact(ctx.root, 'speck')) {
        if (!speck.visible || opacity(speck) < 0.82) continue; // 只看刚出生的
        const near = Math.min(...tips.map((p) => Math.hypot(speck.position.x - p.x, speck.position.y - p.y)));
        // 出生点必须紧贴某条轨顶：容差取 reach 的 8%。
        expect(near, `星点 ${speck.name} 离最近轨顶 ${near.toFixed(1)}px`).toBeLessThan(reach * 0.08);
        checked += 1;
      }
    }
    expect(checked, '未采到任何刚出生的星点').toBeGreaterThan(5);
    stage.dispose();
  });

  it('互动·星点随星轨伸长而外移（顶端在走，星点跟着走）', () => {
    const { stage, ctx } = build();
    const birthRadius: number[] = [];
    for (const t of [0.26, 0.42, 0.62]) {
      at(stage, t);
      const fresh = collectExact(ctx.root, 'speck')
        .filter((o) => o.visible && opacity(o) > 0.82)
        .map((o) => Math.hypot(o.position.x, o.position.y));
      if (fresh.length) birthRadius.push(Math.min(...fresh));
    }
    expect(birthRadius.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < birthRadius.length; i += 1) {
      expect(birthRadius[i], `第 ${i} 批星点未随轨顶外移`).toBeGreaterThan(birthRadius[i - 1]);
    }
    stage.dispose();
  });

  // 互动②：环波推散星屑。
  //
  // 这条断言的第一版是「扫到时的径向速度峰值高于未扫到时」——去掉推力后
  // 它照样全绿：星屑本来就在沿五轴外飞，径向速度的起伏由初速与重力主导，
  // 推力那点增量淹没在里面。改成**反事实对照**：同一星屑场跑两遍，
  // 一遍给真环波、一遍给「三圈永不到场」，两条轨迹的差就只可能来自推力。
  it('互动·环波推散星屑（对照组：环波不到场则星屑不外移）', () => {
    const reach = starReach(1920, 1080);
    const ts: number[] = [];
    for (let i = 0; i <= 60; i += 1) ts.push(GRIT_RELEASE_AT + i / 72);

    const withHoops = traceGrit((t) => hoopRadii(t, reach), ts);
    const noHoops = traceGrit(() => [-1, -1, -1], ts);
    const last = ts.length - 1;

    // 每一颗都被推得更远——推散是全场的，不是某几颗的巧合。
    const deltas = withHoops[last].map((r, i) => r - noHoops[last][i]);
    expect(Math.min(...deltas), `最小外移量 ${Math.min(...deltas).toFixed(1)}px`).toBeGreaterThan(5);

    // 分离时刻必须**跟着各自的波前扫过时刻走**：定时推散会让所有星屑
    // 在同一时刻一起分离，与它们各自所处的半径无关。
    const onsets: number[] = [];
    const sweeps: number[] = [];
    for (const k of [0, 3, 7, 12]) {
      const onset = ts.findIndex((_, i) => Math.abs(withHoops[i][k] - noHoops[i][k]) > 0.5);
      const sweep = ts.findIndex((t, i) => pushWeight(
        [0, 1, 2].map((j) => hoopRadius(t, j, reach)), noHoops[i][k], reach * PUSH_BAND,
      ) > 0);
      expect(onset, `grit-${k} 从未与对照组分离`).toBeGreaterThan(0);
      expect(sweep, `grit-${k} 从未被波前扫到`).toBeGreaterThan(0);
      // 先扫到、后分离，且紧随其后（差 ≤3 个物理步的观测滞后）。
      expect(onset, `grit-${k} 在被扫到前就分离了`).toBeGreaterThanOrEqual(sweep);
      expect(onset - sweep, `grit-${k} 分离滞后 ${onset - sweep} 步`).toBeLessThanOrEqual(3);
      onsets.push(onset);
      sweeps.push(sweep);
    }
    // 四颗的扫过时刻本就相差很远；分离时刻必须同样散开（定时推散会全等）。
    expect(Math.max(...sweeps) - Math.min(...sweeps)).toBeGreaterThan(5);
    expect(Math.max(...onsets) - Math.min(...onsets), '各星屑同时分离，疑似定时推散')
      .toBeGreaterThan(5);
  });

  it('互动·真实场景确实接了环波（不是把对照组接进去了）', () => {
    const { stage, ctx } = build();
    const reach = starReach(ctx.width, ctx.height);
    const ts: number[] = [];
    for (let i = 0; i <= 60; i += 1) ts.push(GRIT_RELEASE_AT + i / 72);

    const live: number[] = [];
    for (const t of ts) at(stage, t);
    for (const o of collectExact(ctx.root, 'grit')) live.push(Math.hypot(o.position.x, o.position.y));

    const withHoops = traceGrit((t) => hoopRadii(t, reach), ts);
    const noHoops = traceGrit(() => [-1, -1, -1], ts);
    const last = ts.length - 1;
    // 场景的落点必须贴合「有环波」那条轨迹，而不是「无环波」的。
    for (let i = 0; i < live.length; i += 1) {
      expect(live[i], `grit-${i} 未跟随有环波的轨迹`).toBeCloseTo(withHoops[last][i], 3);
      expect(Math.abs(live[i] - noHoops[last][i]), `grit-${i} 与无环波轨迹重合`).toBeGreaterThan(5);
    }
    stage.dispose();
  });

  it('互动·推散权重是「扫到才推」的纯函数（未发出的圈不推）', () => {
    const band = 100;
    // 波前正压在星屑上 → 满权重；差半个带宽 → 半权重；带外 → 0。
    expect(pushWeight([500], 500, band)).toBeCloseTo(1, 6);
    expect(pushWeight([550], 500, band)).toBeCloseTo(0.5, 6);
    expect(pushWeight([700], 500, band)).toBe(0);
    // -1 表示该圈未发出或已越出画面，不该产生推力。
    expect(pushWeight([-1, -1, -1], 500, band)).toBe(0);
  });

  it('环波半径随时间线性外扩（不是常量）', () => {
    const reach = starReach(1920, 1080);
    const rs = [0.32, 0.40, 0.48, 0.56].map((t) => hoopRadius(t, 0, reach));
    for (const r of rs) expect(r).toBeGreaterThanOrEqual(0);
    const d: number[] = [];
    for (let i = 1; i < rs.length; i += 1) {
      expect(rs[i], `第 ${i} 段未外扩`).toBeGreaterThan(rs[i - 1]);
      d.push(rs[i] - rs[i - 1]);
    }
    // 线性：各段增量相等（声速恒定）。
    for (let i = 1; i < d.length; i += 1) expect(d[i]).toBeCloseTo(d[0], 6);
    // 三圈错峰：同一时刻半径互不相同。
    const at50 = [0, 1, 2].map((k) => hoopRadius(0.5, k, reach));
    expect(new Set(at50.map((r) => r.toFixed(4))).size).toBe(3);
    // 环波贴片读到的 uRadius 也必须在变（不是建好就不动）。
    const { stage, ctx } = build();
    at(stage, 0.35);
    const u1 = uniformOf(node(ctx.root, 'hoop-0'), 'uRadius');
    at(stage, 0.55);
    const u2 = uniformOf(node(ctx.root, 'hoop-0'), 'uRadius');
    expect(u2).toBeGreaterThan(u1);
    stage.dispose();
  });

  it('全屏·五轴星轨向全屏五方伸展', () => {
    const { stage, ctx } = build();
    at(stage, STAR_ACT2_END);
    const tips = collectExact(ctx.root, 'tip').map((o) => o.position.clone());
    const xs = tips.map((p) => p.x);
    const ys = tips.map((p) => p.y);
    // 横纵跨度都要覆盖屏幕的大部分。
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(ctx.width * 0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(ctx.height * 0.75);
    // 五方：上/左上/右上/左下/右下都有轨顶（不是全挤在一侧）。
    expect(tips.filter((p) => p.y > 0)).toHaveLength(3);
    expect(tips.filter((p) => p.y < 0)).toHaveLength(2);
    expect(tips.filter((p) => p.x > 1)).toHaveLength(2);
    expect(tips.filter((p) => p.x < -1)).toHaveLength(2);
    stage.dispose();
  });

  it('三幕编排：凝聚 → 爆发 → 残星，视觉状态两两不同', () => {
    const { stage, ctx } = build();
    // 第一幕：星体在凝聚，星轨尚未伸展。
    at(stage, STAR_ACT1_END * 0.5);
    const charge1 = uniformOf(node(ctx.root, 'star-core'), 'uCharge');
    expect(uniformOf(node(ctx.root, 'ray-0'), 'uAlpha'), '第一幕不该有星轨').toBe(0);
    const a1 = visualSnapshot(ctx.root);

    // 第二幕：凝聚完成，星轨点亮。
    at(stage, (STAR_ACT1_END + STAR_ACT2_END) / 2);
    expect(uniformOf(node(ctx.root, 'star-core'), 'uCharge')).toBeGreaterThan(charge1);
    expect(uniformOf(node(ctx.root, 'ray-0'), 'uAlpha')).toBeGreaterThan(0.5);
    const a2 = visualSnapshot(ctx.root);

    // 第三幕：残星点接管。
    at(stage, 0.97);
    const relicLate = Math.max(...collectExact(ctx.root, 'relic').map(opacity));
    at(stage, STAR_ACT1_END * 0.5);
    const relicEarly = Math.max(...collectExact(ctx.root, 'relic').map(opacity));
    expect(relicLate).toBeGreaterThan(relicEarly);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);

    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('光晕层多层且内层比外层先到峰（不是三层同一条曲线）', () => {
    const { stage, ctx } = build();
    at(stage, 0.45);
    const levels = [0, 1, 2].map((i) => uniformOf(node(ctx.root, `halo-${i}`), 'uAlpha'));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i], `halo-${i} 未比内层弱`).toBeLessThan(levels[i - 1]);
    }
    expect(levels[0]).toBeGreaterThan(0.2);
    stage.dispose();
  });

  it('降档只减密度，8 个命名元素一个不少', () => {
    const hi = build();
    at(hi.stage, 0.6);
    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.6);

    for (const name of NAMED_ELEMENTS) {
      expect(names(hi.ctx.root), `cinematic ${name}`).toContain(name);
      expect(names(lo.ctx.root), `medium ${name}`).toContain(name);
    }

    // 密度件严格变少但不为零。
    for (const prefix of ['grit', 'speck', 'relic']) {
      const h = collectExact(hi.ctx.root, prefix).length;
      const l = collectExact(lo.ctx.root, prefix).length;
      expect(l, `${prefix} 降档未变少（${l} vs ${h}）`).toBeLessThan(h);
      expect(l, `${prefix} 降档归零`).toBeGreaterThan(0);
    }
    const hiStars = (node(hi.ctx.root, 'twinkle-field') as THREE.InstancedMesh).count;
    const loStars = (node(lo.ctx.root, 'twinkle-field') as THREE.InstancedMesh).count;
    expect(loStars).toBeLessThan(hiStars);
    expect(loStars).toBeGreaterThan(0);

    // 结构件数量不随档位变。
    expect(collectExact(lo.ctx.root, 'ray')).toHaveLength(AXIS_COUNT);
    expect(collectExact(lo.ctx.root, 'hoop')).toHaveLength(HOOP_COUNT);
    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('最低档仍保留每一层（降档只减密度，绝不移除元素）', () => {
    const { stage, ctx } = build({ quality: 'low' });
    at(stage, 0.6);
    for (const name of NAMED_ELEMENTS) {
      expect(names(ctx.root), `low ${name}`).toContain(name);
    }
    for (const prefix of ['grit', 'speck', 'relic', 'ray', 'hoop', 'halo', 'tip']) {
      expect(collectExact(ctx.root, prefix).length, `low ${prefix} 归零`).toBeGreaterThan(0);
    }
    stage.dispose();
  });

  it('dispose 后场景树摘净、幂等，且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.7)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });

  it('稀疏与密集调用下星屑落点一致（物理不按调用频率推进）', () => {
    const sparse = build();
    for (const t of [0.3, 0.6, 0.95]) at(sparse.stage, t);
    const sparseY = collectExact(sparse.ctx.root, 'grit').map((o) => o.position.y);

    const dense = build();
    for (let i = 0; i <= 190; i += 1) at(dense.stage, 0.3 + (i / 190) * 0.65);
    const denseY = collectExact(dense.ctx.root, 'grit').map((o) => o.position.y);

    expect(sparseY).toHaveLength(denseY.length);
    for (let i = 0; i < sparseY.length; i += 1) {
      expect(sparseY[i], `grit-${i} 稀疏/密集落点不一致`).toBeCloseTo(denseY[i], 4);
    }
    sparse.stage.dispose();
    dense.stage.dispose();
  });
});
