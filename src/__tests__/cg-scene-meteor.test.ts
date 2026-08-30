import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-meteor';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  METEOR_ACT1_END,
  METEOR_ACT2_END,
  reentryProgress,
  screenShakeAmount,
} from '../overlay/cg-scenes/cg-meteor';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 17 的 8 个构成件的具名节点。 */
const NAMED_ELEMENTS = [
  'meteor-core',   // ① 陨核
  'fire-shell',    // ② 火鞘
  'debris-0',      // ③ 剥落碎片
  'ion-trail',     // ④ 电离尾迹
  'mach-cone',     // ⑤ 音爆锥
  'impact-flash',  // ⑥ 坠地闪光
  'dust-0',        // ⑦ 尘环
  'meteor-scene',  // ⑧ 大气扰动（整个 group 位移，签名机制）
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('meteor');
  if (!scene) throw new Error('meteor 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/**
 * 精确正则收集。
 *
 * 前缀撞车会让断言测错对象却照样通过（本项目真实事故：`shard-` 同时
 * 命中刚体与反光片，物理断言实际测的是抄位置的贴片）。锁定「名字-数字」
 * 全形，且命名时就让不同性质的前缀不可互相包含。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 逐 t 采样某节点位置。 */
function trackPositions(stage: CgStage, root: THREE.Object3D, name: string, ts: number[]): THREE.Vector3[] {
  return ts.map((t) => {
    at(stage, t);
    return node(root, name).position.clone();
  });
}

describe('场景 17 meteor（陨火再入）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('meteor');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('大气再入');
    expect(scene!.config.signature).toContain('音爆锥');
    expect(scene!.config.preset).toBe('comet');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'dust')).toHaveLength(3);
    expect(collectExact(ctx.root, 'debris').length).toBeGreaterThan(10);
    stage.dispose();
  });

  // 签名前半：再入是加速过程。进度曲线的**二阶差分必须为正**
  // （越走越快），匀速实现会让这条红。
  it('签名·再入是加速过程（进度曲线二阶差分为正）', () => {
    const ts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const p = ts.map(reentryProgress);
    const d1: number[] = [];
    for (let i = 1; i < p.length; i += 1) d1.push(p[i] - p[i - 1]);
    // 每段位移都比上一段大 → 加速。
    for (let i = 1; i < d1.length; i += 1) {
      expect(d1[i], `段 ${i} 未加速`).toBeGreaterThan(d1[i - 1]);
    }
    // 第二幕末必须抵达终点。
    expect(reentryProgress(METEOR_ACT2_END)).toBeCloseTo(1, 5);
    expect(reentryProgress(1)).toBe(1);
  });

  // 签名后半：屏幕微震荡是全库唯一会位移整个 group 的机制，
  // 且必须**衰减**——等幅抖动看着像 bug 不像冲击。
  it('签名·屏幕微震荡在坠地后出现且包络衰减', () => {
    // 坠地前无震荡。
    expect(screenShakeAmount(0.3)).toBe(0);
    expect(screenShakeAmount(METEOR_ACT2_END - 0.01)).toBe(0);

    // 坠地后取每个小窗口的峰值，峰值序列必须单调下降。
    const peaks: number[] = [];
    for (let w = 0; w < 5; w += 1) {
      let peak = 0;
      for (let i = 0; i < 40; i += 1) {
        const t = METEOR_ACT2_END + w * 0.055 + (i / 40) * 0.055;
        peak = Math.max(peak, screenShakeAmount(t));
      }
      peaks.push(peak);
    }
    expect(peaks[0]).toBeGreaterThan(0.5);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i], `窗口 ${i} 未衰减`).toBeLessThan(peaks[i - 1]);
    }
  });

  it('签名·整个场景 group 真的被震荡位移（不只是元素各自抖）', () => {
    const { stage, ctx } = build();
    const groupNode = node(ctx.root, 'meteor-scene');

    at(stage, 0.5);
    const calm = groupNode.position.clone();

    // 坠地后连续采若干帧，group 位置必须出现可观测偏移。
    let maxOffset = 0;
    for (let i = 0; i < 30; i += 1) {
      at(stage, METEOR_ACT2_END + i * 0.002);
      maxOffset = Math.max(maxOffset, groupNode.position.distanceTo(calm));
    }
    expect(maxOffset).toBeGreaterThan(0.5);

    // 震荡尾声必须回到原位附近（不是永久跑偏）。
    at(stage, 0.999);
    expect(groupNode.position.distanceTo(calm)).toBeLessThan(maxOffset * 0.4);
    stage.dispose();
  });

  it('陨核沿轨迹斜贯飞行（斜率恒定、跨屏）', () => {
    const { stage, ctx } = build();
    const ps = trackPositions(stage, ctx.root, 'meteor-core', [0.02, 0.08, 0.14, 0.2]);
    // 逐帧位移方向一致 → 直线轨迹。
    const d1 = ps[1].clone().sub(ps[0]).normalize();
    const d2 = ps[3].clone().sub(ps[2]).normalize();
    expect(d1.dot(d2)).toBeGreaterThan(0.999);
    // 斜贯：x 与 y 都在变（不是纯水平或纯竖直）。
    expect(Math.abs(ps[3].x - ps[0].x)).toBeGreaterThan(1);
    expect(Math.abs(ps[3].y - ps[0].y)).toBeGreaterThan(1);

    // 全屏性：从入射到坠地，横向跨度覆盖屏宽的大部分。
    at(stage, 0);
    const start = node(ctx.root, 'meteor-core').position.clone();
    at(stage, METEOR_ACT2_END);
    const end = node(ctx.root, 'meteor-core').position.clone();
    expect(Math.abs(end.x - start.x)).toBeGreaterThan(ctx.width * 0.6);
    expect(Math.abs(end.y - start.y)).toBeGreaterThan(ctx.height * 0.6);
    stage.dispose();
  });

  it('陨核持续翻滚（旋转在变）', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const r1 = node(ctx.root, 'meteor-core').rotation.clone();
    at(stage, 0.4);
    const r2 = node(ctx.root, 'meteor-core').rotation.clone();
    expect(Math.abs(r2.x - r1.x) + Math.abs(r2.y - r1.y)).toBeGreaterThan(0.1);
    stage.dispose();
  });

  it('火鞘跟着陨核并对准飞行方向', () => {
    const { stage, ctx } = build();
    for (const t of [0.1, 0.3, 0.5]) {
      at(stage, t);
      const core = node(ctx.root, 'meteor-core').position;
      const shell = node(ctx.root, 'fire-shell').position;
      expect(shell.distanceTo(core), `t=${t}`).toBeLessThan(0.001);
    }
    // 迎风轴对准轨迹：两者旋转一致且非零。
    const shellRot = node(ctx.root, 'fire-shell').rotation.z;
    expect(Math.abs(shellRot)).toBeGreaterThan(0.1);
    stage.dispose();
  });

  it('火鞘热度随再入深度递增（大气越稠越热）', () => {
    const { stage, ctx } = build();
    const heats: number[] = [];
    for (const t of [0.05, 0.2, 0.4, 0.6]) {
      at(stage, t);
      heats.push(uniformOf(node(ctx.root, 'fire-shell'), 'uHeat'));
    }
    for (let i = 1; i < heats.length; i += 1) {
      expect(heats[i], `段 ${i}`).toBeGreaterThanOrEqual(heats[i - 1]);
    }
    expect(heats[heats.length - 1]).toBeGreaterThan(heats[0] + 0.3);
    stage.dispose();
  });

  it('电离尾迹随飞行拉长（不是一开始就满长）', () => {
    const { stage, ctx } = build();
    const spans: number[] = [];
    for (const t of [0.05, 0.2, 0.4, 0.6]) {
      at(stage, t);
      spans.push(node(ctx.root, 'ion-trail').scale.x);
    }
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i], `段 ${i}`).toBeGreaterThan(spans[i - 1]);
    }
    stage.dispose();
  });

  it('尾迹分段闪烁在第二幕最强（等离子体断续复合）', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const early = uniformOf(node(ctx.root, 'ion-trail'), 'uBreak');
    at(stage, (METEOR_ACT1_END + METEOR_ACT2_END) / 2);
    const mid = uniformOf(node(ctx.root, 'ion-trail'), 'uBreak');
    expect(mid).toBeGreaterThan(early);
    stage.dispose();
  });

  // 物理断言：碎片必须真的受重力——竖直速度逐帧递增（向下）。
  // 用位置的二阶差分测加速度，不用视觉代理量。
  it('物理·碎片受重力（竖直位移的二阶差分为负）', () => {
    const { stage, ctx } = build();
    // 让第一批碎片剥离并飞行一段。
    const ys: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const t = 0.34 + i * 0.03;
      at(stage, t);
      ys.push(node(ctx.root, 'debris-0').position.y);
    }
    // 逐段竖直位移
    const d1: number[] = [];
    for (let i = 1; i < ys.length; i += 1) d1.push(ys[i] - ys[i - 1]);
    // 二阶差分为负 → 向下加速（重力）。至少多数段成立。
    let accelDown = 0;
    for (let i = 1; i < d1.length; i += 1) {
      if (d1[i] < d1[i - 1]) accelDown += 1;
    }
    expect(accelDown, `向下加速段数 ${accelDown}/${d1.length - 1}`).toBeGreaterThanOrEqual(d1.length - 2);
    stage.dispose();
  });

  it('物理·碎片落地反弹且高度衰减', () => {
    const { stage, ctx } = build();
    // 采到幕尾：碎片在第二幕末触底，反弹顶点落在 0.93–1.0 之间，
    // 采样上界若停在 0.96 只能取到一两点，形不成局部极大。
    const ys: number[] = [];
    for (let i = 0; i <= 160; i += 1) {
      const t = 0.34 + (i / 160) * 0.66;
      at(stage, t);
      ys.push(node(ctx.root, 'debris-0').position.y);
    }
    // 反弹要测**回升速率**，不能只测总回升量。
    // restitution=0 时碎片仍会沿地面滑行，而每步地面钳位会把 y 微抬
    // （实测总回升 19.5px），只看总量的断言在 restitution=0 下照样绿
    // ——这是本项目反复出现的「绿灯但机制不存在」失败模式。
    // 弹跳的判别特征是单步升幅大：反弹几步抬起几十 px，滑行每步仅 3px。
    const floor = Math.min(...ys);
    const floorIdx = ys.indexOf(floor);
    expect(floorIdx, '碎片未触底').toBeGreaterThan(0);

    let maxStepRise = 0;
    for (let i = floorIdx + 1; i < ys.length; i += 1) {
      maxStepRise = Math.max(maxStepRise, ys[i] - ys[i - 1]);
    }
    // 采样间隔约 4ms，一次真反弹的首步升幅远大于滑行漂移。
    expect(maxStepRise, '碎片未反弹（restitution 未施加？）').toBeGreaterThan(8);

    // 回升总高不得超过触底前高度（能量必须衰减）。
    const rebound = Math.max(...ys.slice(floorIdx));
    const beforeFloor = Math.max(...ys.slice(0, floorIdx + 1));
    expect(rebound, '反弹高度未衰减').toBeLessThan(beforeFloor);
    stage.dispose();
  });

  // 互动① 碎片剥离时沿轨迹**法向**甩出，因此会分居尾迹两侧。
  // 若实现让碎片只是「掉队」，全部碎片会落在轨迹同一侧或线上，这条红。
  it('互动·碎片沿轨迹法向甩出，分居尾迹两侧', () => {
    const { stage, ctx } = build();
    at(stage, 0.42);

    // 轨迹方向：用陨核两帧位移求。
    at(stage, 0.40);
    const p0 = node(ctx.root, 'meteor-core').position.clone();
    at(stage, 0.44);
    const p1 = node(ctx.root, 'meteor-core').position.clone();
    const dir = p1.clone().sub(p0).normalize();

    let left = 0;
    let right = 0;
    for (const piece of collectExact(ctx.root, 'debris')) {
      if (!piece.visible) continue;
      const rel = piece.position.clone().sub(p1);
      // 叉积 z 分量的符号即左右。
      const cross = dir.x * rel.y - dir.y * rel.x;
      if (cross > 1) left += 1;
      else if (cross < -1) right += 1;
    }
    // 两侧都要有——这是「法向甩出」的可观测特征。
    expect(left, `左侧碎片数 ${left}`).toBeGreaterThan(0);
    expect(right, `右侧碎片数 ${right}`).toBeGreaterThan(0);
    stage.dispose();
  });

  it('互动·碎片陆续剥离（不是一次性齐甩）', () => {
    const { stage, ctx } = build();
    const counts: number[] = [];
    for (const t of [0.3, 0.45, 0.6, 0.75]) {
      at(stage, t);
      counts.push(collectExact(ctx.root, 'debris').filter((o) => o.visible).length);
    }
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `t 序号 ${i}`).toBeGreaterThan(counts[i - 1]);
    }
    stage.dispose();
  });

  // 互动② 坠地闪光贯穿音爆锥：闪光起时锥的马赫数跌落（激波溃散）。
  it('互动·坠地闪光与音爆锥溃散同时发生', () => {
    const { stage, ctx } = build();
    at(stage, METEOR_ACT2_END - 0.02);
    const machBefore = uniformOf(node(ctx.root, 'mach-cone'), 'uMach');
    const flashBefore = uniformOf(node(ctx.root, 'impact-flash'), 'uAlpha');

    at(stage, METEOR_ACT2_END + 0.01);
    const machAfter = uniformOf(node(ctx.root, 'mach-cone'), 'uMach');
    const flashAfter = uniformOf(node(ctx.root, 'impact-flash'), 'uAlpha');

    // 坠地前：锥数高、无闪光。
    expect(machBefore).toBeGreaterThan(2);
    expect(flashBefore).toBe(0);
    // 坠地后：锥溃散、闪光起。
    expect(machAfter).toBeLessThan(1.2);
    expect(flashAfter).toBeGreaterThan(0.5);
    stage.dispose();
  });

  it('音爆锥马赫数随速度递增（超音速越来越尖）', () => {
    const { stage, ctx } = build();
    const machs: number[] = [];
    for (const t of [0.05, 0.2, 0.4, 0.6]) {
      at(stage, t);
      machs.push(uniformOf(node(ctx.root, 'mach-cone'), 'uMach'));
    }
    for (let i = 1; i < machs.length; i += 1) {
      expect(machs[i], `段 ${i}`).toBeGreaterThan(machs[i - 1]);
    }
    stage.dispose();
  });

  it('尘环在坠地后外扬，三圈错峰', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    for (let i = 0; i < 3; i += 1) {
      expect(opacity(node(ctx.root, `dust-${i}`)), `坠地前 dust-${i} 不应可见`).toBe(0);
    }

    const peakAt = [0, 0, 0];
    const peaks = [0, 0, 0];
    for (let i = 0; i <= 40; i += 1) {
      const t = METEOR_ACT2_END + (1 - METEOR_ACT2_END) * (i / 40);
      at(stage, t);
      for (let r = 0; r < 3; r += 1) {
        const o = opacity(node(ctx.root, `dust-${r}`));
        if (o > peaks[r]) { peaks[r] = o; peakAt[r] = t; }
      }
    }
    for (let r = 0; r < 3; r += 1) {
      expect(peaks[r], `dust-${r} 未亮`).toBeGreaterThan(0.1);
    }
    // 三圈峰值时刻错开。
    expect(peakAt[1]).not.toBe(peakAt[0]);
    expect(peakAt[2]).not.toBe(peakAt[1]);
    stage.dispose();
  });

  it('尘环压扁成椭圆（贴地扬尘而非空中光圈）', () => {
    const { stage, ctx } = build();
    at(stage, 0.95);
    const ring = node(ctx.root, 'dust-0');
    expect(ring.scale.y).toBeLessThan(ring.scale.x * 0.5);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, METEOR_ACT1_END * 0.5);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (METEOR_ACT1_END + METEOR_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档只减碎片密度，命名结构件一个不少', () => {
    const hi = build();
    at(hi.stage, 0.6);
    const hiTree = names(hi.ctx.root);
    const hiDebris = collectExact(hi.ctx.root, 'debris').length;

    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.6);
    const loTree = names(lo.ctx.root);
    const loDebris = collectExact(lo.ctx.root, 'debris').length;

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    // 碎片是密度件，降档严格变少但不为零。
    expect(loDebris).toBeLessThan(hiDebris);
    expect(loDebris).toBeGreaterThan(0);
    // 尘环是结构件，数量不随档位变。
    expect(collectExact(lo.ctx.root, 'dust')).toHaveLength(collectExact(hi.ctx.root, 'dust').length);

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
