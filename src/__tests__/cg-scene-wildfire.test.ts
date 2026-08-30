import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-wildfire';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  EMBER_LEAD,
  FRONT_X_END,
  FRONT_X_START,
  WILDFIRE_ACT1_END,
  WILDFIRE_ACT2_END,
  WILDFIRE_DURATION_MS,
  emberArrivalT,
  emberLandingX,
  flameLean,
  frontX,
  igniteAt,
  spreadProgress,
  spreadRate,
  windGust,
} from '../overlay/cg-scenes/wildfire-front';
import {
  charLevel,
  clumpBurn,
  heatDistortion,
  smokeColumn,
} from '../overlay/cg-scenes/wildfire-burn';
import {
  CHAR_PATCH_COUNT,
  CLUMP_COUNT,
  GUST_LINE_COUNT,
} from '../overlay/cg-scenes/wildfire-parts';
import { PEAK_RATE } from '../overlay/cg-scenes/wildfire-embers';
import { plumeHeight } from '../overlay/cg-scenes/flame-plume';
import { scaledCount } from '../overlay/cg-particle-kit';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 33 的 8 个元素的具名节点（火星由 quarks 承载，观测锚点）。 */
const NAMED_ELEMENTS = [
  'fire-front',    // ① 火线蔓延
  'grass-field',   // ② 草地层
  'clump-0',       // ③ 火舌浪
  'heat-warp',     // ④ 热浪扭曲
  'smoke-column',  // ⑤ 烟柱
  'ember-anchor',  // ⑥ 火星飞升（发射锚点）
  'gustline-0',    // ⑦ 风助火力
  'charpatch-0',   // ⑧ 地面余烬
];

function build(
  overrides: Partial<CgStageContext> = {},
): { stage: CgStage; ctx: CgStageContext } {
  const entry = resolveScene('wildfire');
  if (!entry) throw new Error('wildfire 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: entry.create(ctx), ctx };
}

/** 三个降档档位（cinematic 为满档，另行验证）。 */
const QUALITIES: EffectQuality[] = ['low', 'medium', 'high'];

/** 8 元素的名字前缀（与 NAMED_ELEMENTS 同序，用于降档遍历）。 */
const ELEMENT_TAGS = [
  'fire-front', 'grass-field', 'clump', 'heat-warp',
  'smoke-column', 'ember-anchor', 'gustline', 'charpatch',
];

/** 前缀收集：用于装饰性密度统计（数量随档位变化）。 */
function collect(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  return nodes(root).filter((o) => o.name === prefix || o.name.startsWith(`${prefix}-`));
}

/** 取唯一具名节点（harness 的 node 缺失即抛，不会静默返回 undefined）。 */
function findOne(root: THREE.Object3D, name: string): THREE.Object3D {
  return node(root, name);
}

/** wildfire 时长 1750ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * WILDFIRE_DURATION_MS, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 推进区间宽度（屏宽比例），火星领先量换算用。 */
const SPAN = FRONT_X_END - FRONT_X_START;

describe('场景 33 wildfire（野火燎原）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('wildfire');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.elements).toEqual([
      '火线蔓延', '草地层', '火舌浪', '热浪扭曲', '烟柱', '火星飞升', '风助火力', '地面余烬',
    ]);
    expect(scene!.config.signature).toContain('蔓延式火势');
    expect(scene!.config.preset).toBe('wildfire');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const built = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(built, `缺少元素节点 ${name}`).toContain(name);
    }
    stage.dispose();
  });

  it('九簇火、七块焦土、五条风线都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'clump')).toHaveLength(CLUMP_COUNT);
    expect(collectExact(ctx.root, 'charpatch')).toHaveLength(CHAR_PATCH_COUNT);
    expect(collectExact(ctx.root, 'gustline')).toHaveLength(GUST_LINE_COUNT);
    stage.dispose();
  });

  it('三幕切分点符合规格（300ms / 1300ms 于 1750ms）', () => {
    expect(WILDFIRE_ACT1_END).toBeCloseTo(300 / 1750, 10);
    expect(WILDFIRE_ACT2_END).toBeCloseTo(1300 / 1750, 10);
    expect(WILDFIRE_DURATION_MS).toBe(1750);
  });
});

describe('签名：火线沿地面横向推进（二维蔓延）', () => {
  it('frontX 整场单调推进，绝不回退', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 400; i += 1) {
      const x = frontX(i / 400);
      expect(x, `t=${i / 400} 处火线回退`).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = x;
    }
  });

  it('净横向位移显著：跨过 0.8 屏宽以上', () => {
    const net = frontX(1) - frontX(0);
    expect(net).toBeGreaterThan(0.8);
    // 起止点确实分居屏幕两侧，不是在中间挪一小段。
    expect(frontX(0)).toBeLessThan(-0.35);
    expect(frontX(1)).toBeGreaterThan(0.35);
  });

  it('推进不是原地摆动：任何两个相隔 0.25 的时刻都在往右', () => {
    // 一个来回摆动的火柱能满足「有位移」却过不了这条。
    for (let i = 0; i <= 15; i += 1) {
      const t0 = i / 20;
      expect(frontX(t0 + 0.25)).toBeGreaterThan(frontX(t0) + 0.05);
    }
  });

  it('与 flame 的分野①：火线横坐标在动，flame 的火舌整场不动', () => {
    // flame 侧的断言是 Math.abs(x) < 1e-6（火舌横向位置整场不动）。
    // 这里必须是它的反面：同样取整场样本，横坐标的散布必须显著。
    const xs = Array.from({ length: 40 }, (_, i) => frontX(i / 39));
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeGreaterThan(0.8);
    // 且绝大多数采样点本身远离原点——不是只有端点偏出去。
    const offAxis = xs.filter((x) => Math.abs(x) > 1e-6).length;
    expect(offAxis).toBe(xs.length);
  });

  it('与 flame 的分野②：wildfire 的火沿 x 推进，flame 的火沿 y 生长', () => {
    // 同取三个时刻，比较两者「主运动轴」上的变化量级。
    const dx = Math.abs(frontX(0.8) - frontX(0.3));
    // flame 的火柱高度是它的主运动量（横向恒为 0）。
    const flameDy = Math.abs(plumeHeight(0.8) - plumeHeight(0.3));
    expect(dx).toBeGreaterThan(0.3);
    expect(flameDy).toBeGreaterThan(0);
    // wildfire 的横向变化必须与 flame 的纵向变化同量级或更大——
    // 「二维推进」不能是一个可忽略的横向漂移。
    expect(dx).toBeGreaterThan(flameDy * 0.5);
  });

  it('推进进度闭式可求：稀疏与密集求值在同一 t 同帧', () => {
    // 逐帧累加的实现会在这里分叉。
    const dense: number[] = [];
    for (let i = 0; i <= 600; i += 1) dense.push(frontX(i / 600));
    const sparse = [0, 0.25, 0.5, 0.75, 1].map((t) => frontX(t));
    expect(sparse[0]).toBeCloseTo(dense[0], 12);
    expect(sparse[1]).toBeCloseTo(dense[150], 12);
    expect(sparse[2]).toBeCloseTo(dense[300], 12);
    expect(sparse[3]).toBeCloseTo(dense[450], 12);
    expect(sparse[4]).toBeCloseTo(dense[600], 12);
  });

  it('spreadProgress 从 0 到 1 完整走完，且是 frontX 的唯一来源', () => {
    expect(spreadProgress(0)).toBeCloseTo(0, 10);
    expect(spreadProgress(1)).toBeCloseTo(1, 10);
    // frontX 必须严格由 spreadProgress 线性映射到区间——两者若脱钩，
    // 「火线位置」和「蔓延进度」就会各说一套。
    for (const t of [0.1, 0.35, 0.6, 0.85]) {
      expect(frontX(t)).toBeCloseTo(FRONT_X_START + SPAN * spreadProgress(t), 12);
    }
  });

  it('推进速率整场为正，且蔓延幕最快（起火慢、烧尽减速）', () => {
    for (let i = 0; i <= 100; i += 1) {
      expect(spreadRate(i / 100)).toBeGreaterThan(0);
    }
    const mid = spreadRate((WILDFIRE_ACT1_END + WILDFIRE_ACT2_END) / 2);
    expect(mid).toBeGreaterThan(spreadRate(0.02));
    expect(mid).toBeGreaterThan(spreadRate(0.98));
  });
});

describe('签名：点燃时刻是横坐标的函数（蔓延 vs 一排火同时点着）', () => {
  it('igniteAt 随 x 严格递增：越靠右越晚点燃', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const x = FRONT_X_START + SPAN * (i / 200);
      const ig = igniteAt(x);
      expect(ig, `x=${x} 处点燃时刻早于左侧`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = ig;
    }
    // 首尾差距必须显著——不是「几乎同时点着」。
    expect(igniteAt(FRONT_X_END) - igniteAt(FRONT_X_START)).toBeGreaterThan(0.9);
  });

  it('igniteAt 是 frontX 的反函数：点燃时刻与推进曲线严格咬合', () => {
    // 换成固定时间表（第 i 簇在 i·0.1 点着）会在这里断掉：那种实现下
    // igniteAt 与 frontX 各自独立，往返一致性不成立。
    for (let i = 1; i < 20; i += 1) {
      const t = i / 20;
      expect(igniteAt(frontX(t))).toBeCloseTo(t, 6);
    }
    for (let i = 1; i < 20; i += 1) {
      const x = FRONT_X_START + SPAN * (i / 20);
      expect(frontX(igniteAt(x))).toBeCloseTo(x, 6);
    }
  });

  it('点燃次序由位置决定，不是由簇的编号决定', () => {
    // 打乱顺序取样，点燃时刻的排序必须与 x 的排序一致。
    const xs = [0.3, -0.2, 0.41, -0.39, 0.05, -0.1].map((v) => v);
    const sortedByX = [...xs].sort((a, b) => a - b);
    const sortedByIgnite = [...xs].sort((a, b) => igniteAt(a) - igniteAt(b));
    expect(sortedByIgnite).toEqual(sortedByX);
  });

  it('改变推进速率会改变点燃时刻（两者不脱钩）', () => {
    // 同一个 x，在推进曲线上的对应时刻必须落在 frontX 达到它的那一刻。
    // 若点燃走固定时间表，这个关系就不存在了。
    const x = 0.1;
    const ig = igniteAt(x);
    expect(frontX(ig)).toBeCloseTo(x, 6);
    // 且该时刻之前火线尚未抵达，之后已经越过。
    expect(frontX(ig - 0.05)).toBeLessThan(x);
    expect(frontX(ig + 0.05)).toBeGreaterThan(x);
  });

  it('clumpBurn：某簇在自己的点燃时刻前必须是暗的', () => {
    for (const x of [-0.3, -0.1, 0.1, 0.3]) {
      const ig = igniteAt(x);
      // 点燃前一小段时间必须几乎无光。
      if (ig > 0.08) {
        expect(clumpBurn(ig - 0.06, x)).toBeLessThan(0.05);
      }
      // 点燃后随即起势。
      expect(clumpBurn(Math.min(1, ig + 0.08), x)).toBeGreaterThan(0.2);
    }
  });

  it('同一时刻沿 x 呈「火带」剖面：前方全暗、锋后最旺、远后已衰', () => {
    // 这是「蔓延」在单帧内的空间证据。「一排火同时点着」的实现下，同一
    // t 的所有簇亮度相同，三段剖面就分不出来。
    const t = 0.45;
    const fx = frontX(t);
    // 火线正前方：还没点着，严格为零。
    expect(clumpBurn(t, fx + 0.04)).toBe(0);
    expect(clumpBurn(t, 0.42)).toBe(0);
    // 锋线稍后：正在猛烧（火线本身 age=0，最旺处在它身后一点）。
    const justBehind = clumpBurn(t, fx - 0.06);
    expect(justBehind).toBeGreaterThan(0.5);
    // 远后方：燃料将尽，明显弱于锋后。
    const farBehind = clumpBurn(t, fx - 0.26);
    expect(farBehind).toBeLessThan(justBehind - 0.15);
    // 最左端早已烧完，彻底熄了。
    expect(clumpBurn(t, FRONT_X_START)).toBe(0);
  });

  it('燃烧最旺处随时间向右移动（火带整体在走）', () => {
    // 逐帧扫一遍，找出当帧最亮的横坐标；它必须单调右移。
    const samples = Array.from({ length: 60 }, (_, i) => FRONT_X_START + SPAN * (i / 59));
    let prevPeak = -Infinity;
    for (let i = 3; i <= 12; i += 1) {
      const t = i / 15;
      let peakX = samples[0];
      let peak = -1;
      for (const x of samples) {
        const b = clumpBurn(t, x);
        if (b > peak) { peak = b; peakX = x; }
      }
      expect(peak, `t=${t} 处无燃烧`).toBeGreaterThan(0.1);
      expect(peakX, `t=${t} 处最旺点左移`).toBeGreaterThan(prevPeak);
      prevPeak = peakX;
    }
  });

  it('火舌浪的簇数不过 scaledCount：低档一簇不少（签名载体）', () => {
    const { stage, ctx } = build({ quality: 'low' });
    at(stage, 0.5, 'low');
    expect(collectExact(ctx.root, 'clump')).toHaveLength(CLUMP_COUNT);
    expect(collectExact(ctx.root, 'charpatch')).toHaveLength(CHAR_PATCH_COUNT);
    stage.dispose();
  });
});

describe('签名：火星是水平传播的引燃信使（与 flame 的竖直脱落对照）', () => {
  it('火星落点整场领先火线一个固定身位', () => {
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      expect(emberLandingX(t)).toBeGreaterThan(frontX(t));
      expect(emberLandingX(t) - frontX(t)).toBeCloseTo(EMBER_LEAD * SPAN, 12);
    }
    // 领先量必须是可观的实质领先，不是数值噪声。
    expect(EMBER_LEAD * SPAN).toBeGreaterThan(0.05);
  });

  it('因果：任一处先被火星够到、后被火线点燃', () => {
    // 这是「引燃的因」的可测形式。领先量为 0 时这条必然断掉。
    for (let i = 1; i <= 30; i += 1) {
      const x = FRONT_X_START + EMBER_LEAD * SPAN + SPAN * 0.9 * (i / 30);
      const arrive = emberArrivalT(x);
      const ignite = igniteAt(x);
      expect(arrive, `x=${x} 处火星未领先于点燃`).toBeLessThan(ignite);
    }
  });

  it('火星落点在下一簇点燃之前就已抵达该簇', () => {
    // 取相邻两簇：火星在前一簇正烧时就已飞到后一簇脚下。
    const xA = -0.1;
    const xB = xA + EMBER_LEAD * SPAN;
    expect(emberLandingX(igniteAt(xA))).toBeCloseTo(xB, 6);
    // 且此时 B 尚未点燃。
    expect(clumpBurn(igniteAt(xA), xB)).toBe(0);
    // B 的点燃发生在 A 已经烧起来之后——次序由因果给出。
    expect(igniteAt(xB)).toBeGreaterThan(igniteAt(xA));
  });

  it('与 flame 的分野③：wildfire 火星锚点横向在动，flame 的只在竖直方向动', () => {
    // flame 侧的断言是「火星发射锚点整场只在竖直方向移动」——横坐标恒定。
    // 这里必须相反：火星锚点的横坐标散布显著。
    const xs = Array.from({ length: 30 }, (_, i) => emberLandingX(i / 29));
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeGreaterThan(0.8);
    let prev = -Infinity;
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });
});

describe('签名：烧过的地方不可逆（封住来回摆动的火柱）', () => {
  it('charLevel 对 t 单调不减：焦地不愈合', () => {
    for (const x of [-0.35, -0.2, 0, 0.2, 0.4]) {
      let prev = -Infinity;
      for (let i = 0; i <= 300; i += 1) {
        const c = charLevel(i / 300, x);
        expect(c, `x=${x} t=${i / 300} 处焦地回绿`).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = c;
      }
    }
  });

  it('火线过后该处必然变焦，且保持到幕末', () => {
    for (const x of [-0.3, -0.1, 0.1]) {
      const ig = igniteAt(x);
      expect(charLevel(ig - 0.02 > 0 ? ig - 0.02 : 0, x)).toBeLessThan(0.15);
      // 点燃后 0.18 幕内炭化完成。
      expect(charLevel(Math.min(1, ig + 0.2), x)).toBeCloseTo(1, 6);
      // 幕末仍是焦的。
      expect(charLevel(1, x)).toBeCloseTo(1, 6);
    }
  });

  it('焦地范围随时间单调扩张，且始终落在火线身后', () => {
    const samples = Array.from({ length: 80 }, (_, i) => FRONT_X_START + SPAN * (i / 79));
    let prevCount = -1;
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const charred = samples.filter((x) => charLevel(t, x) > 0.5);
      expect(charred.length).toBeGreaterThanOrEqual(prevCount);
      prevCount = charred.length;
      // 已焦的点必须都在当前火线左侧（推进方向的后方）。
      for (const x of charred) {
        expect(x).toBeLessThan(frontX(t) + 1e-6);
      }
    }
  });

  it('幕末左侧全焦、幕初右侧全绿（推进走完了整片）', () => {
    const left = FRONT_X_START + SPAN * 0.1;
    const right = FRONT_X_START + SPAN * 0.9;
    expect(charLevel(0.02, right)).toBe(0);
    expect(charLevel(1, left)).toBeCloseTo(1, 6);
    expect(charLevel(1, right)).toBeGreaterThan(0.5);
  });
});

describe('风助火力：推进速度与火舌倾角同源', () => {
  it('倾角与速率由同一个阵风量驱动：两者严格同步', () => {
    // 「同源」的可测形式：从倾角能反推出速率，误差为零。两处各自调参的
    // 实现下这个恒等式不成立。
    for (let i = 0; i <= 50; i += 1) {
      const t = i / 50;
      const gust = windGust(t);
      expect(flameLean(t)).toBeCloseTo(0.46 * gust, 12);
      // 速率里的风助项必须读同一个 gust。
      const rateFromGust = spreadRate(t) - 0.9 * gust;
      // 剩余项（基础 + 涌进）与风无关，必须落在无风区间内。
      expect(rateFromGust).toBeGreaterThanOrEqual(0.55 - 1e-12);
      expect(rateFromGust).toBeLessThanOrEqual(0.55 + 1.15 + 1e-12);
    }
  });

  it('风大时火跑得更快且倒得更厉害（两者正相关，不是独立噪声）', () => {
    const samples = Array.from({ length: 200 }, (_, i) => i / 199);
    // 找出风最大与最小的两个时刻，比较速率与倾角。
    let hi = samples[0];
    let lo = samples[0];
    for (const t of samples) {
      if (windGust(t) > windGust(hi)) hi = t;
      if (windGust(t) < windGust(lo)) lo = t;
    }
    expect(flameLean(hi)).toBeGreaterThan(flameLean(lo));
    // 同一对时刻上，速率的风助分量也必须更大。
    expect(spreadRate(hi) - 1.15 * (0.5 - 0.5 * Math.cos(hi * Math.PI * 2)))
      .toBeGreaterThan(spreadRate(lo) - 1.15 * (0.5 - 0.5 * Math.cos(lo * Math.PI * 2)));
  });

  it('倾角恒为正（火向推进方向倒），且不超过物理上限', () => {
    for (let i = 0; i <= 60; i += 1) {
      const lean = flameLean(i / 60);
      expect(lean).toBeGreaterThanOrEqual(0);
      expect(lean).toBeLessThanOrEqual(0.46 + 1e-12);
    }
  });

  it('阵风整幕有起有落（不是恒定风）', () => {
    const gusts = Array.from({ length: 100 }, (_, i) => windGust(i / 99));
    expect(Math.max(...gusts)).toBeGreaterThan(0.9);
    expect(Math.min(...gusts)).toBeLessThan(0.1);
  });
});

describe('三幕结构：起火 / 蔓延 / 烧尽', () => {
  it('第一幕火线仍在左端，第三幕已抵右端', () => {
    expect(frontX(WILDFIRE_ACT1_END)).toBeLessThan(FRONT_X_START + SPAN * 0.25);
    expect(frontX(WILDFIRE_ACT2_END)).toBeGreaterThan(FRONT_X_START + SPAN * 0.75);
  });

  it('第一幕只有少数簇烧着，第二幕火带铺开', () => {
    const samples = Array.from({ length: 60 }, (_, i) => FRONT_X_START + SPAN * (i / 59));
    const act1 = samples.filter((x) => clumpBurn(WILDFIRE_ACT1_END * 0.6, x) > 0.05).length;
    const act2 = samples.filter((x) => clumpBurn(0.6, x) > 0.05).length;
    expect(act1).toBeGreaterThan(0);
    expect(act2).toBeGreaterThan(act1);
  });

  it('烟柱第一幕升起、第二幕维持高位、第三幕塌散但不归零', () => {
    expect(smokeColumn(0)).toBe(0);
    expect(smokeColumn(WILDFIRE_ACT1_END)).toBeCloseTo(1, 6);
    expect(smokeColumn((WILDFIRE_ACT1_END + WILDFIRE_ACT2_END) / 2)).toBeCloseTo(1, 6);
    expect(smokeColumn(1)).toBeLessThan(0.6);
    expect(smokeColumn(1)).toBeGreaterThan(0.2);
  });

  it('热浪滞后于火势：起势晚于烟柱', () => {
    expect(heatDistortion(0)).toBeLessThan(smokeColumn(WILDFIRE_ACT1_END * 0.5) + 1e-9);
    expect(heatDistortion(WILDFIRE_ACT1_END * 0.4)).toBeLessThan(smokeColumn(WILDFIRE_ACT1_END * 0.4));
    // 中段必须真正起来了。
    expect(heatDistortion(0.6)).toBeGreaterThan(0.3);
  });

  it('第三幕明焰退去但焦痕与余烬留存', () => {
    const samples = Array.from({ length: 60 }, (_, i) => FRONT_X_START + SPAN * (i / 59));
    const burning = samples.filter((x) => clumpBurn(1, x) > 0.2).length;
    const charred = samples.filter((x) => charLevel(1, x) > 0.5).length;
    expect(burning).toBeLessThan(charred);
    expect(charred).toBeGreaterThan(samples.length * 0.7);
  });
});

describe('互动：8 元素在整幕中协同变化', () => {
  it('火线的画面落点整场单调右移（签名落到了真实对象上）', () => {
    const { stage, ctx } = build();
    const fronts: number[] = [];
    const smokeXs: number[] = [];
    for (let i = 0; i <= 20; i += 1) {
      at(stage, i / 20);
      fronts.push(uniformOf(findOne(ctx.root, 'fire-front'), 'uFront'));
      smokeXs.push(findOne(ctx.root, 'smoke-column').position.x);
    }
    let prev = -Infinity;
    for (const f of fronts) {
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
    // 与 flame 的分野必须在对象层成立：uv 净位移接近整屏宽。
    expect(fronts[fronts.length - 1] - fronts[0]).toBeGreaterThan(0.8);
    // 烟柱根部锚在火线上，所以它也跟着横移（同源驱动）。
    expect(smokeXs[smokeXs.length - 1] - smokeXs[0]).toBeGreaterThan(ctx.width * 0.7);
    stage.dispose();
  });

  it('火星锚点始终领先火线的画面位置（对象层面的因果）', () => {
    const { stage, ctx } = build();
    for (const t of [0.1, 0.35, 0.6, 0.85]) {
      at(stage, t);
      const frontPx = (uniformOf(findOne(ctx.root, 'fire-front'), 'uFront') - 0.5) * ctx.width;
      const emberPx = findOne(ctx.root, 'ember-anchor').position.x;
      expect(emberPx, `t=${t} 火星未领先火线`).toBeGreaterThan(frontPx);
    }
    stage.dispose();
  });

  it('焦痕面积整场只增不减（对象层面的不可逆）', () => {
    // 用 scale 而非 opacity 作观测口：opacity 含阴燃转暗红的设计性衰减，
    // 面积才是「烧过了」的不可逆记录。
    const { stage, ctx } = build();
    const areas: number[] = [];
    for (let i = 0; i <= 24; i += 1) {
      at(stage, i / 24);
      areas.push(collectExact(ctx.root, 'charpatch').reduce((sum, o) => sum + o.scale.x, 0));
    }
    for (let i = 1; i < areas.length; i += 1) {
      expect(areas[i], `第 ${i} 帧焦痕缩回`).toBeGreaterThanOrEqual(areas[i - 1] - 1e-9);
    }
    expect(areas[areas.length - 1]).toBeGreaterThan(areas[0] * 1.5);
    stage.dispose();
  });

  it('每块焦痕自身也不会缩回（逐块单调，不靠总量掩盖）', () => {
    const { stage, ctx } = build();
    const perPatch = new Map<string, number>();
    for (let i = 0; i <= 24; i += 1) {
      at(stage, i / 24);
      for (const o of collectExact(ctx.root, 'charpatch')) {
        const prev = perPatch.get(o.name) ?? -Infinity;
        expect(o.scale.x, `${o.name} 在第 ${i} 帧缩回`).toBeGreaterThanOrEqual(prev - 1e-9);
        perPatch.set(o.name, o.scale.x);
      }
    }
    stage.dispose();
  });

  it('烟柱三幕升起—维持—塌散，热浪同步被驱动', () => {
    const { stage, ctx } = build();
    const heights: number[] = [];
    const heats: number[] = [];
    for (let i = 0; i <= 16; i += 1) {
      at(stage, i / 16);
      heights.push(uniformOf(findOne(ctx.root, 'smoke-column'), 'uHeight'));
      heats.push(uniformOf(findOne(ctx.root, 'heat-warp'), 'uStrength'));
    }
    expect(heights[0]).toBeCloseTo(0, 6);
    expect(Math.max(...heights)).toBeCloseTo(1, 6);
    expect(heights[heights.length - 1]).toBeLessThan(0.6);
    expect(Math.max(...heats) - Math.min(...heats)).toBeGreaterThan(0.2);
    stage.dispose();
  });

  it('火舌倾角在整幕中随风起落（不是恒定倾斜）', () => {
    const { stage, ctx } = build();
    const leans: number[] = [];
    for (let i = 0; i <= 30; i += 1) {
      at(stage, i / 30);
      leans.push(uniformOf(findOne(ctx.root, 'fire-front'), 'uLean'));
    }
    expect(Math.max(...leans) - Math.min(...leans)).toBeGreaterThan(0.2);
    // 火舌簇的旋转必须与火线 shader 读同一个倾角（同源，不是各自调参）。
    at(stage, 0.6);
    const lean = uniformOf(findOne(ctx.root, 'fire-front'), 'uLean');
    expect(findOne(ctx.root, 'clump-4').rotation.z).toBeCloseTo(-lean, 12);
    stage.dispose();
  });

  it('稀疏 update 与密集 update 在同一 t 画出同一帧', () => {
    // 火线位置若逐帧累加，这条必然断掉。
    const sparse = build();
    at(sparse.stage, 0.73);
    const sparseFront = uniformOf(findOne(sparse.ctx.root, 'fire-front'), 'uFront');
    const sparseChar = collectExact(sparse.ctx.root, 'charpatch')
      .reduce((sum, o) => sum + o.scale.x, 0);
    const sparseGust = findOne(sparse.ctx.root, 'gustline-2').position.x;
    sparse.stage.dispose();

    const dense = build();
    for (let i = 1; i <= 73; i += 1) at(dense.stage, i / 100);
    const denseFront = uniformOf(findOne(dense.ctx.root, 'fire-front'), 'uFront');
    const denseChar = collectExact(dense.ctx.root, 'charpatch')
      .reduce((sum, o) => sum + o.scale.x, 0);
    const denseGust = findOne(dense.ctx.root, 'gustline-2').position.x;
    dense.stage.dispose();

    expect(sparseFront).toBeCloseTo(denseFront, 10);
    expect(sparseChar).toBeCloseTo(denseChar, 10);
    expect(sparseGust).toBeCloseTo(denseGust, 10);
  });

  it('t=0 与 t=1 的整体形态明显不同（火确实走过了一遍）', () => {
    const { stage, ctx } = build();
    at(stage, 0);
    const f0 = uniformOf(findOne(ctx.root, 'fire-front'), 'uFront');
    const c0 = collectExact(ctx.root, 'charpatch').reduce((s, o) => s + o.scale.x, 0);
    at(stage, 1);
    const f1 = uniformOf(findOne(ctx.root, 'fire-front'), 'uFront');
    const c1 = collectExact(ctx.root, 'charpatch').reduce((s, o) => s + o.scale.x, 0);
    expect(f1 - f0).toBeGreaterThan(0.8);
    expect(c1).toBeGreaterThan(c0 * 1.5);
    stage.dispose();
  });
});

describe('降档：只减密度，8 元素一个不少', () => {
  for (const quality of QUALITIES) {
    it(`${quality} 档 8 元素齐备`, () => {
      const { stage, ctx } = build({ quality });
      at(stage, 0.55, quality);
      for (const tag of ELEMENT_TAGS) {
        expect(collect(ctx.root, tag).length, `${quality} 档缺元素 ${tag}`).toBeGreaterThan(0);
      }
      stage.dispose();
    });
  }

  it('签名载体数量不随档位缩减（火簇与焦痕）', () => {
    for (const quality of [...QUALITIES, 'cinematic' as EffectQuality]) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      expect(collectExact(ctx.root, 'clump'), `${quality} 档火簇被削`).toHaveLength(CLUMP_COUNT);
      expect(collectExact(ctx.root, 'charpatch'), `${quality} 档焦痕被削`)
        .toHaveLength(CHAR_PATCH_COUNT);
      stage.dispose();
    }
  });

  it('装饰层密度随档位递减（降档确实省了东西）', () => {
    const counts = [...QUALITIES, 'cinematic' as EffectQuality].map((quality) => {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      const n = collectExact(ctx.root, 'gustline').length;
      stage.dispose();
      return n;
    });
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[counts.length - 1]).toBe(GUST_LINE_COUNT);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });

  it('低档下签名仍成立（火线照样推进、焦痕照样不可逆）', () => {
    const { stage, ctx } = build({ quality: 'low' });
    const fronts: number[] = [];
    const areas: number[] = [];
    for (let i = 0; i <= 12; i += 1) {
      at(stage, i / 12, 'low');
      fronts.push(uniformOf(findOne(ctx.root, 'fire-front'), 'uFront'));
      areas.push(collectExact(ctx.root, 'charpatch').reduce((s, o) => s + o.scale.x, 0));
    }
    for (let i = 1; i < fronts.length; i += 1) {
      expect(fronts[i]).toBeGreaterThanOrEqual(fronts[i - 1] - 1e-9);
      expect(areas[i]).toBeGreaterThanOrEqual(areas[i - 1] - 1e-9);
    }
    expect(fronts[fronts.length - 1] - fronts[0]).toBeGreaterThan(0.8);
    stage.dispose();
  });

  it('火星发射率随档位缩减，但低档仍有火星（下限保底）', () => {
    // 火星是引燃信使，低档一颗不能少——scaledCount 的 Math.max(1,...) 下限
    // 保证这一点；同时高档必须确有更多。
    for (const quality of QUALITIES) {
      expect(scaledCount(PEAK_RATE, quality)).toBeGreaterThanOrEqual(1);
      expect(scaledCount(PEAK_RATE, quality))
        .toBeLessThanOrEqual(scaledCount(PEAK_RATE, 'cinematic'));
    }
    expect(scaledCount(PEAK_RATE, 'low')).toBeLessThan(scaledCount(PEAK_RATE, 'cinematic'));
    // 低档跑一整幕不抛错（粒子层在最小预算下仍能推进）。
    const { stage } = build({ quality: 'low' });
    expect(() => {
      for (let i = 0; i <= 30; i += 1) at(stage, i / 30, 'low');
    }).not.toThrow();
    stage.dispose();
  });
});

describe('dispose：递归清空子树', () => {
  it('dispose 后整棵子树归零', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    // 断言前先收集引用——dispose 之后就摘不到了。
    const before = nodes(ctx.root).length;
    expect(before).toBeGreaterThan(20);
    const containers = nodes(ctx.root).filter((o) => o.children.length > 0);
    expect(containers.length).toBeGreaterThan(0);
    stage.dispose();
    for (const c of containers) {
      expect(c.children.length, `${c.name || c.type} 未清空`).toBe(0);
    }
    expect(ctx.root.children).toHaveLength(0);
  });

  it('dispose 可重复调用且不抛错', () => {
    const { stage } = build();
    at(stage, 0.4);
    stage.dispose();
    expect(() => stage.dispose()).not.toThrow();
  });

  it('dispose 后 update 是空操作（不再改动已释放的对象）', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    stage.dispose();
    expect(() => at(stage, 0.9)).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });
});
