import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-boxing-glove';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  PUNCH_ACT1_END,
  PUNCH_ACT2_END,
  PUNCH_DURATION_MS,
  PUNCH_IMPACT_T,
  PUNCH_OVERSHOOT,
  PUNCH_PEAK_T,
  RING_COUNT,
  gloveReach,
  gloveSpeed,
  hitFlash,
  ringAlpha,
  ringBornAt,
  ringCenter,
  ringImpulse,
  ringRadius,
} from '../overlay/cg-scenes/punch-impact';
import {
  BAG_LAG,
  GHOST_COUNT,
  bagSway,
  ghostAlpha,
  ghostReach,
  gloveSquash,
  screenShake,
  sweatBurst,
} from '../overlay/cg-scenes/punch-recoil';
import { SWEAT_COUNT, SWEAT_PEAK_RATE } from '../overlay/cg-scenes/punch-sweat';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 36 的 8 个元素的具名节点（汗滴由 quarks 承载，用锚点观测）。 */
const NAMED_ELEMENTS = [
  'glove-body',       // ① 拳套 mesh（同时承载 ⑥ 变形）
  'ringlayer-0',      // ② 压缩环
  'hit-flash',        // ③ 命中间闪光
  'ghostlayer-0',     // ④ 拳路残影
  'shake-rig',        // ⑤ 震屏
  'sweat-anchor',     // ⑦ 汗滴（发射锚点）
  'sandbag-phantom',  // ⑧ 沙袋虚影
  'bag-pivot',        // ⑧ 沙袋摆动支点
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('boxing-glove');
  if (!scene) throw new Error('boxing-glove 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** boxing-glove 时长 850ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * PUNCH_DURATION_MS, quality);
}

/** 精确正则收集：`ringlayer-N` 与 `ring...` 前缀相近，必须锁「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/**
 * 读取折算后的粒子时钟。
 *
 * quarks 的 ParticleSystem 在根节点不是 `THREE.Scene` 时首帧即自毁
 * （内部会向上走到根并检查 `type === 'Scene'`），测试 harness 的 root
 * 是 Group，所以粒子系统内部的 `time` 在测试里观测不到。场景把折算
 * 后的时钟挂在 `sweat-anchor` 上作为唯一出口。
 */
function particleClock(root: THREE.Object3D): number {
  const value = node(root, 'sweat-anchor').userData.particleT;
  if (typeof value !== 'number') throw new Error('sweat-anchor 未暴露 particleT');
  return value;
}

/** 读取汗滴发射率（同上，锚点是唯一出口）。 */
function sweatRate(root: THREE.Object3D): number {
  const value = node(root, 'sweat-anchor').userData.sweatRate;
  if (typeof value !== 'number') throw new Error('sweat-anchor 未暴露 sweatRate');
  return value;
}

describe('场景 36 boxing-glove（重拳·命中空气）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('boxing-glove');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.title).toBe('重拳');
    expect(scene!.config.signature).toContain('命中空气');
    expect(scene!.config.preset).toBe('boxing');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) expect(tree).toContain(name);
    stage.dispose();
  });

  it('压缩环与残影建出全部层，各持独立材质实例', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const rings = collectExact(ctx.root, 'ringlayer');
    const ghosts = collectExact(ctx.root, 'ghostlayer');
    expect(rings).toHaveLength(RING_COUNT);
    expect(ghosts).toHaveLength(GHOST_COUNT);
    // 各层亮度是逐层的，共用一份材质会让所有环同时亮。
    expect(new Set(rings.map((r) => (r as THREE.Mesh).material)).size).toBe(RING_COUNT);
    expect(new Set(ghosts.map((g) => (g as THREE.Mesh).material)).size).toBe(GHOST_COUNT);
    stage.dispose();
  });

  it('具名节点无撞名（sweat-anchor 只有一个，前缀查找不会摸到错的那个）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    for (const name of NAMED_ELEMENTS) {
      expect(nodes(ctx.root).filter((o) => o.name === name), `${name} 撞名`).toHaveLength(1);
    }
    stage.dispose();
  });

  // ── 签名因果链：拳速 → 命中不停 → 过冲 → 肌腱拉回 ──

  it('签名：命中瞬间速度严格非零（打空气没有实体承接动量）', () => {
    // 与 axe 破木/shield 格挡/spear 穿刺的分野就在这一条：那些命中即停。
    expect(gloveSpeed(PUNCH_IMPACT_T)).toBeGreaterThan(0.9);
    // 命中面两侧速度连续——一次连贯出拳，不是「飞到面前」再另拍一段。
    const h = 1e-5;
    const before = (gloveReach(PUNCH_IMPACT_T) - gloveReach(PUNCH_IMPACT_T - 2 * h)) / (2 * h);
    const after = (gloveReach(PUNCH_IMPACT_T + 2 * h) - gloveReach(PUNCH_IMPACT_T)) / (2 * h);
    expect(after / before).toBeCloseTo(1, 2);
  });

  it('签名：拳越过命中面（行程 > 1），过冲峰值与达峰时刻都是反解值', () => {
    // 行程 1 = 命中面。打空气必须冲过去。
    expect(gloveReach(PUNCH_IMPACT_T)).toBeCloseTo(1, 6);
    expect(PUNCH_OVERSHOOT).toBeGreaterThan(1);
    expect(gloveReach(PUNCH_PEAK_T)).toBeGreaterThan(1);
    // 峰值恰好落在声明的达峰时刻上——两个常量不是各自硬填的。
    let peak = 0;
    let peakT = 0;
    for (let t = PUNCH_IMPACT_T; t <= PUNCH_ACT2_END; t += 1 / 4000) {
      const r = gloveReach(t);
      if (r > peak) { peak = r; peakT = t; }
    }
    expect(peakT).toBeCloseTo(PUNCH_PEAK_T, 3);
    expect(peak).toBeCloseTo(PUNCH_OVERSHOOT, 3);
  });

  it('过冲深度随拳速缩放（改拳速两者一起变，证明不是硬编码常数）', () => {
    // 过冲量 = 命中速度² / (2·肌腱减速率)，所以它必须大于零且
    // 严格由速度决定。速度在命中处达峰，过冲随后才发生。
    expect(gloveSpeed(PUNCH_PEAK_T)).toBeLessThan(gloveSpeed(PUNCH_IMPACT_T));
    // 达峰即速度归零（肌腱把拳拉停的那一刻就是最深处）。判据取「全程
    // 最小」而非某个小数——写死阈值会在调肌腱阻力时假红，而「峰处最慢」
    // 是物理必然。
    // 找的是**速率**（绝对值）的零点：gloveSpeed 带符号，收势期为负，
    // 直接取最小值会落到收势段去。
    let minRate = Infinity;
    let minT = 0;
    for (let t = PUNCH_IMPACT_T; t <= PUNCH_ACT2_END; t += 1 / 4000) {
      const v = Math.abs(gloveSpeed(t));
      if (v < minRate) { minRate = v; minT = t; }
    }
    expect(minT).toBeCloseTo(PUNCH_PEAK_T, 3);
    expect(minRate).toBeLessThan(0.01);
    // 过冲峰两侧速度反号：拳先前冲、被拉停、再退回。
    expect(gloveSpeed(PUNCH_PEAK_T - 0.01)).toBeGreaterThan(0);
    expect(gloveSpeed(PUNCH_PEAK_T + 0.01)).toBeLessThan(0);
  });

  it('拳路：起手在后、命中在前、收势退回', () => {
    expect(gloveReach(0)).toBeCloseTo(0, 6);
    // 第一幕末已经加速出去大半。
    expect(gloveReach(PUNCH_ACT1_END)).toBeGreaterThan(0.4);
    // 收势退回起手位附近，且不再前冲。
    expect(gloveReach(1)).toBeLessThan(0.3);
    for (let t = PUNCH_ACT2_END; t <= 1; t += 1 / 240) {
      expect(gloveReach(t)).toBeLessThanOrEqual(PUNCH_OVERSHOOT + 1e-9);
    }
  });

  it('② 压缩环诞生时刻严格递增，环心恒等于拳此刻的行程（互动①）', () => {
    const born = Array.from({ length: RING_COUNT }, (_, i) => ringBornAt(i));
    for (let i = 1; i < born.length; i += 1) {
      expect(born[i]).toBeGreaterThan(born[i - 1]);
    }
    // 全部环都在命中之后诞生（拳没到，空气不会自己压缩）。
    for (const t of born) expect(t).toBeGreaterThanOrEqual(PUNCH_IMPACT_T - 1e-9);
    // 环心 = 该环诞生那一刻拳的行程位置：环是被拳推出来的。
    for (let i = 0; i < RING_COUNT; i += 1) {
      expect(ringCenter(i, born[i])).toBeCloseTo(gloveReach(born[i]), 6);
    }
    // 第 0 环生在命中面上，末环被推到更前面（拳还在往里冲）。
    expect(ringCenter(0, born[0])).toBeCloseTo(1, 4);
    expect(ringCenter(RING_COUNT - 1, born[RING_COUNT - 1])).toBeGreaterThan(1);
  });

  it('② 环冲量逐环递减且非负（越晚生的环吃到的拳速越小）', () => {
    let prev = Infinity;
    for (let i = 0; i < RING_COUNT; i += 1) {
      const imp = ringImpulse(i);
      expect(imp).toBeGreaterThanOrEqual(0);
      expect(imp).toBeLessThan(prev);
      prev = imp;
    }
    // 第 0 环几乎吃满命中速度：它生在命中后一个环间隔处，那时拳已被
    // 肌腱扯掉一丝速度，所以是 ~1 而非恰好 1。判据锁「最接近满」。
    expect(ringImpulse(0)).toBeGreaterThan(0.99);
    expect(ringImpulse(0)).toBeLessThanOrEqual(1);
  });

  it('② 环扩大的同时变淡，且诞生前半径亮度都为零', () => {
    for (let i = 0; i < RING_COUNT; i += 1) {
      const t0 = ringBornAt(i);
      expect(ringRadius(i, t0 - 1e-4)).toBe(0);
      expect(ringAlpha(i, t0 - 1e-4)).toBe(0);
      let prev = -1;
      for (let t = t0; t <= 1; t += 1 / 480) {
        const r = ringRadius(i, t);
        expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(r).toBeLessThanOrEqual(1 + 1e-9);
        expect(ringAlpha(i, t)).toBeGreaterThanOrEqual(0);
        prev = r;
      }
      // 半径仍在长，亮度已在退。
      const a = Math.min(1, t0 + 0.12);
      const b = Math.min(1, t0 + 0.34);
      expect(ringRadius(i, b)).toBeGreaterThan(ringRadius(i, a));
      expect(ringAlpha(i, b)).toBeLessThan(ringAlpha(i, a));
    }
  });

  it('② 压缩环扩至屏缘（规格「全屏」条款）', () => {
    // 归一化半径 1 = 屏缘；第 0 环整幕走到满。
    expect(ringRadius(0, 1)).toBeCloseTo(1, 3);
  });

  // ── 冲击后效：白闪/汗滴读命中，震屏/沙袋以命中为原点且有传播延迟 ──

  it('③ 命中白闪只在命中那一刻炸开，之后迅速灭', () => {
    // 注意 PUNCH_IMPACT_T 恰等于 PUNCH_ACT1_END：规格写的是「0–200ms
    // 出拳；200–600ms 命中」，命中就发生在 200ms 这一刻。所以这里不能
    // 断言「第一幕末不亮」——那与「命中即亮」是同一时刻的矛盾要求。
    expect(hitFlash(0)).toBe(0);
    expect(hitFlash(PUNCH_IMPACT_T - 1e-4)).toBe(0);
    // 命中即达峰。
    expect(hitFlash(PUNCH_IMPACT_T)).toBeGreaterThan(0.9);
    // 是「闪」不是「亮着」：过冲峰时已退掉大半。
    expect(hitFlash(PUNCH_PEAK_T)).toBeLessThan(hitFlash(PUNCH_IMPACT_T) * 0.6);
    expect(hitFlash(1)).toBeCloseTo(0, 3);
  });

  it('⑥ 拳套变形：命中处被压实，之后回弹到原形', () => {
    // 未命中前不变形。
    expect(gloveSquash(0)).toBeCloseTo(1, 6);
    expect(gloveSquash(PUNCH_IMPACT_T - 1e-4)).toBeCloseTo(1, 3);
    // 命中瞬间压扁（< 1 即沿拳路被压短）。
    expect(gloveSquash(PUNCH_IMPACT_T)).toBeLessThan(0.75);
    // 过冲峰前已在回弹，收势期回到原形。
    expect(gloveSquash(PUNCH_PEAK_T)).toBeGreaterThan(gloveSquash(PUNCH_IMPACT_T));
    expect(gloveSquash(1)).toBeCloseTo(1, 2);
  });

  it('④ 残影是同一条拳路的延迟采样，层号越大越滞后越淡', () => {
    const t = PUNCH_ACT1_END;
    for (let i = 1; i < GHOST_COUNT; i += 1) {
      // 越靠后的层落在更早的行程位置上（拖在拳后面）。
      expect(ghostReach(i, t)).toBeLessThanOrEqual(ghostReach(i - 1, t) + 1e-9);
      // 且更淡。
      expect(ghostAlpha(i, t)).toBeLessThan(ghostAlpha(i - 1, t));
    }
    // 第 0 层是最贴着拳的那一层（每层都有延迟，第 0 层最小）。
    expect(ghostReach(0, t)).toBeLessThan(gloveReach(t));
    expect(gloveReach(t) - ghostReach(0, t))
      .toBeLessThan(gloveReach(t) - ghostReach(GHOST_COUNT - 1, t));
    // 残影不透明度全程非负（收势期速度为负，不能漏进来）。
    for (let k = 0; k <= 1; k += 1 / 240) {
      for (let i = 0; i < GHOST_COUNT; i += 1) {
        expect(ghostAlpha(i, k)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('④ 残影随拳变慢而消失（读的是速率，不是另调的淡出曲线）', () => {
    // 出拳最快时残影最浓，过冲峰（拳停）时几乎没有。
    expect(ghostAlpha(1, PUNCH_IMPACT_T)).toBeGreaterThan(ghostAlpha(1, PUNCH_PEAK_T));
    expect(ghostAlpha(1, PUNCH_PEAK_T)).toBeLessThan(0.05);
  });

  it('⑤ 震屏在命中后才起，带往复摆动并衰减到零', () => {
    expect(screenShake(0)).toBe(0);
    expect(screenShake(PUNCH_IMPACT_T - 1e-4)).toBe(0);
    // 命中后立刻起震。
    expect(Math.abs(screenShake(PUNCH_IMPACT_T + 0.02))).toBeGreaterThan(0.2);
    // 往复：整幕多次过零。
    let crossings = 0;
    let prev = screenShake(PUNCH_IMPACT_T + 0.01);
    for (let t = PUNCH_IMPACT_T + 0.01; t <= 1; t += 1 / 2000) {
      const v = screenShake(t);
      if (v !== 0 && Math.sign(v) !== Math.sign(prev)) { crossings += 1; prev = v; }
    }
    expect(crossings).toBeGreaterThanOrEqual(3);
    // 收尾已衰减干净。
    expect(Math.abs(screenShake(1))).toBeLessThan(0.02);
  });

  it('⑧ 沙袋滞后于震屏起摆（气浪要飞到远端），推开即达峰再余摆', () => {
    expect(BAG_LAG).toBeGreaterThan(0);
    const start = PUNCH_IMPACT_T + BAG_LAG;
    expect(bagSway(start - 1e-4)).toBe(0);
    // 镜头先震、沙袋后摆——因果顺序。判据取「震屏在沙袋起摆前就已过峰」，
    // 比比某个瞬时值更强：气浪抵达远端时近处的震已经在退了。
    let shakePeakT = 0;
    let shakePeak = 0;
    for (let t = PUNCH_IMPACT_T; t <= 1; t += 1 / 4000) {
      if (Math.abs(screenShake(t)) > shakePeak) {
        shakePeak = Math.abs(screenShake(t));
        shakePeakT = t;
      }
    }
    expect(shakePeakT).toBeLessThan(start);
    expect(shakePeak).toBeGreaterThan(0.5);
    // 达峰紧随起摆（余弦包络：气浪一到就推到最远），不是慢慢荡起来。
    let peak = 0;
    let peakT = 0;
    for (let t = start; t <= 1; t += 1 / 2000) {
      if (Math.abs(bagSway(t)) > Math.abs(peak)) { peak = bagSway(t); peakT = t; }
    }
    expect(peakT - start).toBeLessThan(0.1);
    expect(Math.abs(peak)).toBeGreaterThan(0.1);
    // 有余摆：多次过零。
    let crossings = 0;
    let prev = bagSway(start + 0.01);
    for (let t = start; t <= 1; t += 1 / 2000) {
      const v = bagSway(t);
      if (v !== 0 && Math.sign(v) !== Math.sign(prev)) { crossings += 1; prev = v; }
    }
    expect(crossings).toBeGreaterThanOrEqual(2);
  });

  it('⑦ 互动②：汗滴强度与环冲量同源（环强则汗多），命中前不喷', () => {
    expect(sweatBurst(0)).toBe(0);
    expect(sweatBurst(PUNCH_IMPACT_T - 1e-4)).toBe(0);
    // 命中即达峰，且峰值恰等于第 0 环的冲量——同一个量的两次使用。
    expect(sweatBurst(PUNCH_IMPACT_T)).toBeCloseTo(ringImpulse(0), 6);
    // 之后单调退去，全程非负。
    let prev = Infinity;
    for (let t = PUNCH_IMPACT_T; t <= 1; t += 1 / 240) {
      const v = sweatBurst(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  // ── 三幕结构 ──

  it('三幕边界取自 850ms 时间表，命中与过冲都在第二幕内', () => {
    expect(PUNCH_DURATION_MS).toBe(850);
    expect(PUNCH_ACT1_END).toBeCloseTo(200 / 850, 9);
    expect(PUNCH_ACT2_END).toBeCloseTo(600 / 850, 9);
    // 命中恰在第一幕边界：规格「0–200ms 出拳；200–600ms 命中」。
    expect(PUNCH_IMPACT_T).toBeCloseTo(PUNCH_ACT1_END, 9);
    expect(PUNCH_PEAK_T).toBeLessThan(PUNCH_ACT2_END);
    // 环全部生在第二幕内。
    for (let i = 0; i < RING_COUNT; i += 1) {
      expect(ringBornAt(i)).toBeLessThan(PUNCH_ACT2_END);
    }
  });

  // ── 签名落到场景状态 ──

  it('拳套位置由 gloveReach 驱动：起手在后、过冲最前、收势退回', () => {
    const { stage, ctx } = build();
    at(stage, 0.01);
    const start = node(ctx.root, 'glove-body').position.x;
    at(stage, PUNCH_IMPACT_T);
    const hit = node(ctx.root, 'glove-body').position.x;
    at(stage, PUNCH_PEAK_T);
    const deepest = node(ctx.root, 'glove-body').position.x;
    at(stage, 1);
    const back = node(ctx.root, 'glove-body').position.x;
    // 过冲峰确实比命中面更靠前——「命中空气」的可见证据。
    expect(hit).toBeGreaterThan(start);
    expect(deepest).toBeGreaterThan(hit);
    expect(back).toBeLessThan(hit);
    stage.dispose();
  });

  it('⑥ 拳套在命中帧被压实：沿拳路压短、横向鼓起（体积守恒的观感）', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const calm = node(ctx.root, 'glove-body').scale.clone();
    at(stage, PUNCH_IMPACT_T);
    const squashed = node(ctx.root, 'glove-body').scale.clone();
    expect(squashed.x).toBeLessThan(calm.x);
    expect(squashed.y).toBeGreaterThan(calm.y);
    stage.dispose();
  });

  it('签名落到场景状态：环逐个诞生，环心停在各自诞生时拳的位置（互动①）', () => {
    const { stage, ctx } = build();
    const t0 = ringBornAt(0);
    at(stage, t0 + 0.01);
    // 第 0 环已生并可见，末环尚未。
    expect(uniformOf(node(ctx.root, 'ringlayer-0'), 'uAlpha')).toBeGreaterThan(0);
    expect(uniformOf(node(ctx.root, `ringlayer-${RING_COUNT - 1}`), 'uAlpha')).toBe(0);
    // 环心沿拳路推进：末环生得晚，被推到更前面。要在末环刚生时看——
    // 过冲峰后所有环的上确界都收敛到 PUNCH_OVERSHOOT（ringCenter 取
    // 「拳曾达最深处」），那时首末环重合是设计使然，不是没推。
    at(stage, ringBornAt(RING_COUNT - 1) + 1e-3);
    const first = node(ctx.root, 'ringlayer-0').position.x;
    const last = node(ctx.root, `ringlayer-${RING_COUNT - 1}`).position.x;
    expect(last).toBeGreaterThan(first);
    stage.dispose();
  });

  it('⑤ 震屏施加在 shake-rig 上，命中前不动', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    // 用 closeTo 而非 toBe：screenShake 返回 0 乘负系数得到 -0，
    // Object.is(-0, 0) 为 false。
    expect(node(ctx.root, 'shake-rig').position.x).toBeCloseTo(0, 9);
    expect(node(ctx.root, 'shake-rig').position.y).toBeCloseTo(0, 9);
    at(stage, PUNCH_IMPACT_T + 0.02);
    const rig = node(ctx.root, 'shake-rig');
    expect(Math.abs(rig.position.x) + Math.abs(rig.position.y)).toBeGreaterThan(0);
    stage.dispose();
  });

  it('⑧ 沙袋绕支点摆动（不是整体平移）', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    expect(node(ctx.root, 'bag-pivot').rotation.z).toBe(0);
    at(stage, PUNCH_IMPACT_T + BAG_LAG + 0.01);
    expect(Math.abs(node(ctx.root, 'bag-pivot').rotation.z)).toBeGreaterThan(0);
    // 沙袋本体挂在支点下，靠支点旋转带动。
    expect(node(ctx.root, 'sandbag-phantom').parent?.name).toBe('bag-pivot');
    stage.dispose();
  });

  it('③ 白闪与 ⑤ 震屏在场景状态上错峰（闪已灭时震还在）', () => {
    const { stage, ctx } = build();
    at(stage, PUNCH_IMPACT_T);
    expect(uniformOf(node(ctx.root, 'hit-flash'), 'uLevel')).toBeGreaterThan(0.5);
    at(stage, PUNCH_ACT2_END);
    expect(uniformOf(node(ctx.root, 'hit-flash'), 'uLevel')).toBeLessThan(0.1);
    stage.dispose();
  });

  it('⑦ 汗滴锚点跟着拳走，发射率随 sweatBurst 起落（互动②的场景出口）', () => {
    const { stage, ctx } = build();
    at(stage, 0.05);
    const early = node(ctx.root, 'sweat-anchor').position.x;
    expect(sweatRate(ctx.root)).toBe(0);
    at(stage, PUNCH_IMPACT_T);
    const onHit = node(ctx.root, 'sweat-anchor').position.x;
    const rateOnHit = sweatRate(ctx.root);
    expect(onHit).toBeGreaterThan(early);
    expect(rateOnHit).toBeGreaterThan(0);
    // 峰值率不超过声明上限（档位缩放的基准）。
    expect(rateOnHit).toBeLessThanOrEqual(SWEAT_PEAK_RATE + 1e-9);
    // 收尾时已几乎不喷。
    at(stage, 1);
    expect(sweatRate(ctx.root)).toBeLessThan(rateOnHit * 0.1);
    stage.dispose();
  });

  // ── 稀疏 update / 降档 / dispose ──

  it('粒子时钟按场景时间轴折算，不随 update 次数漂移', () => {
    const few = build();
    const many = build();
    at(few.stage, PUNCH_ACT2_END);
    for (let i = 1; i <= 24; i += 1) at(many.stage, (i / 24) * PUNCH_ACT2_END);
    expect(particleClock(few.ctx.root)).toBeGreaterThan(0);
    expect(particleClock(few.ctx.root)).toBeCloseTo(particleClock(many.ctx.root), 5);
    // 且确实推进到该有的刻度：折算目标是 t × 0.85s，固定步长累加后
    // 落在目标的一个步长之内（不是恒为 0 的空壳）。
    const target = PUNCH_ACT2_END * 0.85;
    expect(particleClock(few.ctx.root)).toBeGreaterThan(target - 1 / 60 - 1e-9);
    expect(particleClock(few.ctx.root)).toBeLessThanOrEqual(target + 1e-9);
    few.stage.dispose();
    many.stage.dispose();
  });

  it('稀疏 update 与密集 update 同结果（物理不吃 frameDelta）', () => {
    const sparse = build();
    at(sparse.stage, 0.3);
    at(sparse.stage, PUNCH_ACT2_END);

    const dense = build();
    for (let t = 0; t <= PUNCH_ACT2_END; t += 1 / 240) at(dense.stage, t);
    at(dense.stage, PUNCH_ACT2_END);

    expect(node(sparse.ctx.root, 'glove-body').position.x)
      .toBeCloseTo(node(dense.ctx.root, 'glove-body').position.x, 6);
    expect(node(sparse.ctx.root, 'shake-rig').position.x)
      .toBeCloseTo(node(dense.ctx.root, 'shake-rig').position.x, 6);
    expect(node(sparse.ctx.root, 'bag-pivot').rotation.z)
      .toBeCloseTo(node(dense.ctx.root, 'bag-pivot').rotation.z, 6);
    for (let i = 0; i < RING_COUNT; i += 1) {
      expect(uniformOf(node(sparse.ctx.root, `ringlayer-${i}`), 'uAlpha'))
        .toBeCloseTo(uniformOf(node(dense.ctx.root, `ringlayer-${i}`), 'uAlpha'), 6);
    }
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('低档位 8 元素一个不少，签名载体不被 scaledCount 削掉', () => {
    for (const quality of ['low', 'medium', 'high', 'cinematic'] as EffectQuality[]) {
      const { stage, ctx } = build({ quality });
      at(stage, PUNCH_ACT2_END, quality);
      const tree = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(tree, `${quality} 档缺元素 ${name}`).toContain(name);
      }
      expect(collectExact(ctx.root, 'ringlayer'), `${quality} 档压缩环被削`)
        .toHaveLength(RING_COUNT);
      expect(collectExact(ctx.root, 'ghostlayer'), `${quality} 档残影被削`)
        .toHaveLength(GHOST_COUNT);
      stage.dispose();
    }
  });

  it('降档只减粒子密度，不改力学（拳路与环状态逐档一致）', () => {
    const low = build({ quality: 'low' });
    const cine = build({ quality: 'cinematic' });
    const t = PUNCH_PEAK_T;
    at(low.stage, t, 'low');
    at(cine.stage, t, 'cinematic');
    expect(node(low.ctx.root, 'glove-body').position.x)
      .toBeCloseTo(node(cine.ctx.root, 'glove-body').position.x, 6);
    for (let i = 0; i < RING_COUNT; i += 1) {
      expect(uniformOf(node(low.ctx.root, `ringlayer-${i}`), 'uAlpha'))
        .toBeCloseTo(uniformOf(node(cine.ctx.root, `ringlayer-${i}`), 'uAlpha'), 6);
    }
    // 但汗滴发射率必须真的降下来——只查建时粒子数会漏掉每帧重设率的路径。
    expect(sweatRate(low.ctx.root)).toBeLessThan(sweatRate(cine.ctx.root));
    expect(SWEAT_COUNT).toBeGreaterThan(0);
    low.stage.dispose();
    cine.stage.dispose();
  });

  it('dispose 递归清空子树且幂等，不留残余子节点', () => {
    const { stage, ctx } = build();
    at(stage, PUNCH_ACT2_END);
    const rig = node(ctx.root, 'shake-rig');
    const pivot = node(ctx.root, 'bag-pivot');
    expect(rig.children.length).toBeGreaterThan(0);
    expect(pivot.children.length).toBeGreaterThan(0);

    stage.dispose();
    stage.dispose();

    expect(ctx.root.children).toHaveLength(0);
    expect(rig.children).toHaveLength(0);
    expect(pivot.children).toHaveLength(0);
    expect(() => at(stage, 0.9)).not.toThrow();
  });

  it('update 覆盖整幕不抛异常（含边界与越界 t）', () => {
    const { stage } = build();
    expect(() => {
      for (let t = -0.1; t <= 1.1; t += 1 / 120) at(stage, t);
    }).not.toThrow();
    stage.dispose();
  });
});
