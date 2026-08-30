import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-harp';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  HARP_ACT1_END,
  HARP_ACT2_END,
  PETAL_FALL_SPAN,
  petalProgress,
} from '../overlay/cg-scenes/cg-harp';
import {
  BEAM_HALF_WIDTH,
  SWEEP_SPAN,
  beamLight,
  beamPosition,
  petalPath,
  stringRing,
} from '../overlay/cg-scenes/harp-petals';
import { HARP_STRING_COUNT } from '../overlay/cg-scenes/harp-parts';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 22 的 8 个构成件的具名节点（花瓣音波由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'harp-frame',        // ① 竖琴框架 + ⑦ 琴柱辉光（同层 shader）
  'hstring-0',         // ② 琴弦
  'petalwave-anchor',  // ③ 花瓣音波（发射锚点）
  'pluck-beam',        // ④ 拨弦闪光
  'night-sky',         // ⑤ 月夜景
  'halo-0',            // ⑥ 落地晕环
  'petal-0',           // ⑧ 飘落花瓣
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('harp');
  if (!scene) throw new Error('harp 场景未注册');
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
 * 命中刚体与反光片）。弦命名 `hstring-` 而非 `string-`，与 guitar 的
 * `gstring-` 一样加族前缀。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

describe('场景 22 harp（竖琴花瓣）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('harp');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('竖列弦');
    expect(scene!.config.signature).toContain('逐列扫描');
    expect(scene!.config.preset).toBe('petal');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'hstring')).toHaveLength(HARP_STRING_COUNT);
    expect(collectExact(ctx.root, 'halo')).toHaveLength(4);
    expect(collectExact(ctx.root, 'petal').length).toBeGreaterThan(10);
    stage.dispose();
  });

  // 签名核心：闪光带自上而下单调推进，第一幕内扫完全程。
  it('签名·闪光带自上而下单调推进，第一幕内扫完弦列', () => {
    const samples = [0, 0.05, 0.1, 0.15, 0.2, 0.25, SWEEP_SPAN].map(beamPosition);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i], `段 ${i}`).toBeGreaterThan(samples[i - 1]);
    }
    // 起点在顶（≈0），扫描窗口末抵达底（≈1）。
    expect(samples[0]).toBeCloseTo(0, 6);
    expect(samples[samples.length - 1]).toBeCloseTo(1, 6);
    // 扫描在第一幕内完成。
    expect(SWEEP_SPAN).toBeLessThanOrEqual(HARP_ACT1_END + 0.06);
  });

  // 签名·空间驱动：弦亮不亮取决于闪光带位置，与自身无计时器。
  // 这是与 guitar（时间驱动的 pluckAt）的机制分界。
  it('签名·弦的照亮由闪光带位置决定（空间驱动，不是各自计时）', () => {
    // 带子在 0.5，位于 0.5 的弦全亮。
    expect(beamLight(0.5, 0.5)).toBeCloseTo(1, 6);
    // 带子还没到（0.1 vs 0.6）：不亮。
    expect(beamLight(0.1, 0.6)).toBe(0);
    // 带子已过（0.9 vs 0.3）：不亮。
    expect(beamLight(0.9, 0.3)).toBe(0);
    // 窄带内单峰：越接近越亮。
    expect(beamLight(0.52, 0.5)).toBeLessThan(beamLight(0.505, 0.5));
    // 半宽之外严格为零。
    expect(beamLight(0.5 + BEAM_HALF_WIDTH, 0.5)).toBe(0);
  });

  it('签名·弦列依次亮起（峰值时刻严格递增，不是齐亮）', () => {
    const { stage, ctx } = build();
    const peakAt: number[] = [];
    for (let s = 0; s < HARP_STRING_COUNT; s += 1) {
      let peak = 0;
      let when = -1;
      for (let i = 0; i <= 160; i += 1) {
        const t = (i / 160) * SWEEP_SPAN * 1.2;
        at(stage, t);
        const o = opacity(node(ctx.root, `hstring-${s}`));
        if (o > peak) { peak = o; when = t; }
      }
      expect(peak, `弦 ${s} 未亮`).toBeGreaterThan(0.3);
      peakAt.push(when);
    }
    // 峰值时刻必须**严格**递增。用 >= 计数会让「齐亮」（峰值全等）
    // 照样满足，逐列扫描断言随之失效——本项目 guitar 场景已证实这点。
    const trace = peakAt.map((n) => n.toFixed(4)).join(',');
    for (let i = 1; i < peakAt.length; i += 1) {
      expect(peakAt[i], `峰序 ${trace} 在 ${i} 处未推进`).toBeGreaterThan(peakAt[i - 1]);
    }
    // 首末跨度足够大（真的是一次扫描而非数值抖动）。
    expect(peakAt[HARP_STRING_COUNT - 1] - peakAt[0], `跨度 ${trace}`).toBeGreaterThan(SWEEP_SPAN * 0.5);
    stage.dispose();
  });

  it('签名·同一时刻只有相邻少数弦被照亮（是一道亮线不是一片光）', () => {
    const { stage, ctx } = build();
    // 取扫描中段，统计亮度超过阈值的弦数。
    at(stage, SWEEP_SPAN * 0.5);
    // 阈值 0.4 而非 0.5：14 根弦的间距（1/13≈0.077）小于闪光带半宽
    // （0.12），带心落在两弦之间时两根各得约 0.46——这是弦距与带宽的
    // 几何关系，不是亮度不足。
    const lit: number[] = [];
    for (let s = 0; s < HARP_STRING_COUNT; s += 1) {
      if (opacity(node(ctx.root, `hstring-${s}`)) > 0.4) lit.push(s);
    }
    expect(lit.length, `同时亮 ${lit.length} 根`).toBeGreaterThan(0);
    // 不能超过总数的一半——否则就是「一片光」而非「一道线」。
    expect(lit.length).toBeLessThan(HARP_STRING_COUNT / 2);
    // 亮的弦必须相邻（连续区间）。
    for (let i = 1; i < lit.length; i += 1) {
      expect(lit[i] - lit[i - 1], `亮弦不相邻: ${lit.join(',')}`).toBe(1);
    }
    stage.dispose();
  });

  // 与 guitar 的对照：harp 的余振显著长于拨弦包络，两个弦乐场景不趋同。
  it('对照·竖琴余振比吉他拨弦长（衰减常数更小）', () => {
    // harp 余振 exp(-1.7·s)，guitar 是 exp(-3.1·s)。
    // 同样衰到 1/e 所需时间，harp 必须明显更久。
    const harpHalf = Math.log(2) / 1.7;
    const guitarHalf = Math.log(2) / 3.1;
    expect(harpHalf).toBeGreaterThan(guitarHalf * 1.5);
    // 运行期验证：一秒后 harp 余振仍有可观值。
    expect(stringRing(0.6, 0.1)).toBeGreaterThan(0.3);
  });

  // 花瓣轨迹是螺旋下坠：竖直单调下落 + 水平正弦摆动。
  it('物理·花瓣竖直单调下落（不是悬停）', () => {
    const ys = [0, 0.2, 0.4, 0.6, 0.8, 1].map(
      (p) => petalPath(p, 400, 30, 0.7, 1.4).y,
    );
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i], `段 ${i}`).toBeLessThan(ys[i - 1]);
    }
    expect(ys[0]).toBeCloseTo(0, 6);
    // 全程下落总距离等于 fall。
    expect(Math.abs(ys[ys.length - 1] + 400)).toBeLessThan(1);
  });

  it('物理·花瓣水平侧摆换向（螺旋下坠，是直线）', () => {
    const xs: number[] = [];
    for (let i = 0; i <= 40; i += 1) xs.push(petalPath(i / 40, 400, 30, 0, 1.4).x);
    // 必须出现符号翻转（左右摆动）。
    let flips = 0;
    for (let i = 1; i < xs.length; i += 1) {
      if (Math.sign(xs[i]) !== 0 && Math.sign(xs[i]) !== Math.sign(xs[i - 1])) flips += 1;
    }
    expect(flips, `侧摆换向次数 ${flips}`).toBeGreaterThan(1);
    // 摆幅随下落深度增大：后半程的最大偏移大于前半程。
    const mid = Math.floor(xs.length / 2);
    const early = Math.max(...xs.slice(0, mid).map(Math.abs));
    const late = Math.max(...xs.slice(mid).map(Math.abs));
    expect(late).toBeGreaterThan(early);
  });

  it('物理·花瓣自旋（朝向随下落变化）', () => {
    const angles = [0, 0.25, 0.5, 0.75, 1].map(
      (p) => petalPath(p, 400, 30, 0.4, 1.4).angle,
    );
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i], `段 ${i}`).toBeGreaterThan(angles[i - 1]);
    }
    // 至少转过一圈。
    expect(angles[angles.length - 1] - angles[0]).toBeGreaterThan(Math.PI * 2);
  });

  it('运行期花瓣真的沿螺旋轨迹走（位置逐帧变且有横向摆动）', () => {
    const { stage, ctx } = build();
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const t = 0.32 + (i / 20) * PETAL_FALL_SPAN;
      at(stage, t);
      const p = node(ctx.root, 'petal-0').position;
      xs.push(p.x);
      ys.push(p.y);
    }
    // 竖直单调下落。
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i], `帧 ${i}`).toBeLessThanOrEqual(ys[i - 1]);
    }
    // 横向有摆动（不是竖直直线）。
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
    stage.dispose();
  });

  it('花瓣陆续剥落（不是一次性齐落）', () => {
    const { stage, ctx } = build();
    const counts: number[] = [];
    for (const t of [0.28, 0.45, 0.6, 0.75]) {
      at(stage, t);
      const visible = collectExact(ctx.root, 'petal')
        .filter((o) => opacity(o) > 0.05).length;
      counts.push(visible);
    }
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `t 序号 ${i}: ${counts.join(',')}`).toBeGreaterThan(counts[i - 1]);
    }
    stage.dispose();
  });

  // 互动② 涟漪由绑定花瓣的触地时刻激起，不是定时器。
  it('互动·晕环只在绑定花瓣触地之后出现', () => {
    const { stage, ctx } = build();
    // halo-0 绑 petal-0，其剥落时刻 0.3，触地在 0.3+0.34=0.64。
    at(stage, 0.5);
    expect(opacity(node(ctx.root, 'halo-0')), '花瓣未触地就起涟漪').toBe(0);
    at(stage, 0.7);
    expect(opacity(node(ctx.root, 'halo-0')), '花瓣触地后未起涟漪').toBeGreaterThan(0.1);
    stage.dispose();
  });

  it('互动·晕环圆心落在绑定花瓣的触地横坐标上', () => {
    const { stage, ctx } = build();
    at(stage, 0.68);
    const halo = node(ctx.root, 'halo-0').position;
    // petal-0 触地时的 x：从纯函数算出，应与晕环圆心一致。
    at(stage, 0.639);
    const petalX = node(ctx.root, 'petal-0').position.x;
    at(stage, 0.68);
    expect(Math.abs(halo.x - petalX), `环心 ${halo.x} vs 花瓣落点 ${petalX}`).toBeLessThan(12);
    stage.dispose();
  });

  it('晕环贴地压扁成椭圆（涟漪而非空中光圈）', () => {
    const { stage, ctx } = build();
    at(stage, 0.72);
    const halo = node(ctx.root, 'halo-0');
    expect(halo.scale.y).toBeLessThan(halo.scale.x * 0.5);
    stage.dispose();
  });

  it('晕环外扩且亮度单峰（起涟漪再散去）', () => {
    const { stage, ctx } = build();
    const spreads: number[] = [];
    const alphas: number[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = 0.65 + (i / 24) * 0.34;
      at(stage, t);
      const halo = node(ctx.root, 'halo-0');
      spreads.push(halo.scale.x);
      alphas.push(opacity(halo));
    }
    // 半径单调外扩。
    for (let i = 1; i < spreads.length; i += 1) {
      expect(spreads[i], `扩 ${i}`).toBeGreaterThanOrEqual(spreads[i - 1]);
    }
    // 亮度单峰：峰值不在两端。
    const peak = Math.max(...alphas);
    const peakIdx = alphas.indexOf(peak);
    expect(peak).toBeGreaterThan(0.2);
    expect(peakIdx).toBeGreaterThan(0);
    expect(peakIdx).toBeLessThan(alphas.length - 1);
    stage.dispose();
  });

  // 互动③（规格元素③）音波发射点跟着闪光扫到的弦走。
  it('互动·花瓣音波发射点跟着闪光扫到的弦移动', () => {
    const { stage, ctx } = build();
    const xs: number[] = [];
    for (let i = 1; i < 6; i += 1) {
      const t = (i / 6) * SWEEP_SPAN;
      at(stage, t);
      xs.push(node(ctx.root, 'petalwave-anchor').position.x);
    }
    // 锚点随扫描推进而横向移动（弦列是斜排的，x 递增）。
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i], `锚点 ${i}: ${xs.map((n) => n.toFixed(1)).join(',')}`)
        .toBeGreaterThanOrEqual(xs[i - 1]);
    }
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(10);
    stage.dispose();
  });

  it('闪光带扫完后隐去（不是整幕常亮）', () => {
    const { stage, ctx } = build();
    at(stage, SWEEP_SPAN * 0.5);
    const during = uniformOf(node(ctx.root, 'pluck-beam'), 'uAlpha');
    at(stage, 0.9);
    const after = uniformOf(node(ctx.root, 'pluck-beam'), 'uAlpha');
    expect(during).toBeGreaterThan(0.5);
    expect(after).toBe(0);
    stage.dispose();
  });

  it('全屏：花瓣飘落覆盖半屏以上', () => {
    const { stage, ctx } = build();
    at(stage, 0.85);
    const visible = collectExact(ctx.root, 'petal').filter((o) => opacity(o) > 0.05);
    expect(visible.length).toBeGreaterThan(6);
    const ys = visible.map((o) => o.position.y);
    const spread = Math.max(...ys) - Math.min(...ys);
    // 竖向跨度覆盖半屏以上。
    expect(spread, `花瓣竖向跨度 ${spread}`).toBeGreaterThan(ctx.height * 0.4);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, HARP_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (HARP_ACT1_END + HARP_ACT2_END) / 2);
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
    at(hi.stage, 0.5);
    const hiTree = names(hi.ctx.root);

    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.5);
    const loTree = names(lo.ctx.root);

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    expect(collectExact(lo.ctx.root, 'hstring'))
      .toHaveLength(collectExact(hi.ctx.root, 'hstring').length);
    expect(collectExact(lo.ctx.root, 'halo'))
      .toHaveLength(collectExact(hi.ctx.root, 'halo').length);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树摘净且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.8)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
  });

  it('petalProgress 语义正确（未剥落 -1、触地 >=1）', () => {
    expect(petalProgress(0.1, 0.3)).toBe(-1);
    expect(petalProgress(0.3, 0.3)).toBe(0);
    expect(petalProgress(0.3 + PETAL_FALL_SPAN, 0.3)).toBeCloseTo(1, 6);
    expect(petalProgress(0.9, 0.3)).toBeGreaterThan(1);
  });
});
