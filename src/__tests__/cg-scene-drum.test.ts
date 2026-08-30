import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-drum';
import { resolveScene } from '../overlay/cg-scene-registry';
import { DRUM_ACT1_END, DRUM_ACT2_END } from '../overlay/cg-scenes/cg-drum';
import {
  DRUM_DURATION_S,
  DRUM_STRIKE_AT,
  RIPPLE_LAYERS,
  RIPPLE_MAX_R,
  boomSmear,
  dentDepth,
  drumQuakeAmount,
  headDeflection,
  malletApproach,
  rippleDrive,
  rippleRadii,
  rippleRadius,
  sweepPush,
} from '../overlay/cg-scenes/drum-impact';
import { DRUM_SQUASH, RIPPLE_PLANE_SCALE } from '../overlay/cg-scenes/drum-parts';
// meteor 的震荡包络：签名要求 drum 的震屏与它「机制可测地不同」，
// 只能把两条曲线放在同一把尺子下量，不能各自断言「衰减」了事。
import { METEOR_ACT2_END, screenShakeAmount } from '../overlay/cg-scenes/cg-meteor';
import { makeSceneCtx, names, node, nodes, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 20 的 8 个构成件的具名节点。 */
const NAMED_ELEMENTS = [
  'drum-body',    // ① 鼓身 mesh
  'drum-mallet',  // ② 鼓槌
  'head-impact',  // ③ 鼓面冲击
  'ripple-0',     // ④ 低频环波
  'skin-0',       // ⑤ 鼓皮粒子
  'drum-scene',   // ⑥ 震屏（整个 group 被位移，签名机制）
  'boom-smear',   // ⑦ 音浪拖影
  'spark-burst',  // ⑧ 锤头火星（emitter 会脱离场景树，锚点镜像发射点）
];

/** 物理步长换算到整幕归一化。 */
const STEP_T = (1 / 60) / DRUM_DURATION_S;

/**
 * 第 i 次单步采样的时刻。
 *
 * 半步偏移是必需的：追赶循环的条件是 `elapsed + STEP <= target`，
 * 正好落在步边界上时浮点误差会让某次 update 推进 0 步、下一次推进 2 步，
 * 差分序列因此出现 0 与双倍值交替，看起来像重力时有时无。
 * 落在两步中间就稳定地「一次 update 一个物理步」。
 */
function stepAt(i: number): number {
  return DRUM_STRIKE_AT + (i + 0.5) * STEP_T;
}
/** 环波贴片的 UV 横向尺度，与 shader / drum-skin 保持同一把尺子。 */
const UV_X = 1920 * RIPPLE_PLANE_SCALE;

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('drum');
  if (!scene) throw new Error('drum 场景未注册');
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
 * 全形——`skin-\d+` 因此不可能收到 `head-impact` 那张鼓面贴片。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 鼓面网格的实际离面形变：正 = 外鼓，负 = 凹陷（顶点 z）。 */
function headDeform(root: THREE.Object3D): { dent: number; bulge: number } {
  const mesh = node(root, 'head-impact') as THREE.Mesh;
  const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  let dent = 0;
  let bulge = 0;
  for (let i = 0; i < attr.count; i += 1) {
    const z = attr.getZ(i);
    if (z < dent) dent = z;
    if (z > bulge) bulge = z;
  }
  return { dent: -dent, bulge };
}

/** 每步恰好推进一个物理步地采样全部鼓皮粒子的横向距离。 */
function sampleSkinRadii(stage: CgStage, root: THREE.Object3D, steps: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= steps; i += 1) {
    at(stage, stepAt(i));
    out.push(collectExact(root, 'skin').map((o) => Math.abs(o.position.x)));
  }
  return out;
}

/** 一条曲线上「峰值被重新拉起」的次数：余震单次冲击的判别量。 */
function reignitionCount(f: (t: number) => number, from: number, window: number): number {
  const peaks: number[] = [];
  for (let w = 0; from + (w + 1) * window <= 1; w += 1) {
    let peak = 0;
    for (let i = 0; i <= 200; i += 1) peak = Math.max(peak, f(from + w * window + (i / 200) * window));
    peaks.push(peak);
  }
  let rises = 0;
  for (let i = 1; i < peaks.length; i += 1) if (peaks[i] > peaks[i - 1] * 1.15) rises += 1;
  return rises;
}

describe('场景 20 drum（战鼓重击）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('drum');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.elements).toEqual([
      '鼓身 mesh', '鼓槌', '鼓面冲击', '低频环波',
      '鼓皮粒子', '震屏', '音浪拖影', '锤头火星',
    ]);
    expect(scene!.config.signature).toContain('击打-凹陷-反弹');
    expect(scene!.config.signature).toContain('鼓槌飞入+震屏');
    expect(scene!.config.preset).toBe('drum-beat');
    // 三幕切分取自规格 0–150 / 150–700 / 700–1200ms。
    expect(DRUM_ACT1_END).toBeCloseTo(150 / 1200, 9);
    expect(DRUM_ACT2_END).toBeCloseTo(700 / 1200, 9);
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'ripple')).toHaveLength(RIPPLE_LAYERS);
    expect(collectExact(ctx.root, 'skin').length).toBeGreaterThan(20);
    stage.dispose();
  });

  // ── 签名前半：击打-凹陷-反弹 ────────────────────────────────────

  // 凹陷必须是**单峰**形态：从零涨到最深，再退回零。停在最深不回弹的
  // 实现（凹陷量写成阶跃或单调曲线）在这条上直接红。
  it('签名·鼓面真的凹陷再回弹（形变量单峰：先增后减回零）', () => {
    const { stage, ctx } = build();
    const dents: Array<{ t: number; v: number }> = [];
    for (let i = 0; i <= 90; i += 1) {
      const t = DRUM_STRIKE_AT + (i / 90) * 0.14;
      at(stage, t);
      dents.push({ t, v: headDeform(ctx.root).dent });
    }
    // 触面瞬间平（还没压下去）。
    expect(dents[0].v).toBeLessThan(1);
    // 中途必须压出一口有量级的坑（鼓皮半径 324px，坑深应到几十 px）。
    const peak = dents.reduce((a, b) => (b.v > a.v ? b : a));
    expect(peak.v, '鼓面未凹陷').toBeGreaterThan(60);
    // 峰值落在区间内部（不是端点），且末端已退回零 → 单峰。
    expect(peak.t).toBeGreaterThan(dents[0].t);
    expect(peak.t).toBeLessThan(dents[dents.length - 1].t);
    expect(dents[dents.length - 1].v, '凹陷未回弹').toBeLessThan(peak.v * 0.1);

    // 单调性：峰前不降、峰后不升（允许采样噪声内的相等）。
    const pi = dents.indexOf(peak);
    for (let i = 1; i <= pi; i += 1) {
      expect(dents[i].v, `峰前第 ${i} 段回落`).toBeGreaterThanOrEqual(dents[i - 1].v - 1e-6);
    }
    for (let i = pi + 1; i < dents.length; i += 1) {
      expect(dents[i].v, `峰后第 ${i} 段反涨`).toBeLessThanOrEqual(dents[i - 1].v + 1e-6);
    }
    stage.dispose();
  });

  // 凹陷必须是**碗形**：鼓皮被鼓框夹住，鼓缘位移恒为零，鼓心最深。
  // 把整片皮平移下去（剖面写成常量）也能通过「单峰」与「同帧」断言
  // ——那是活塞不是鼓面，缺这条断言的话变异会全绿。
  it('签名·凹陷是碗形（鼓心最深、鼓缘被夹住不动）', () => {
    const { stage, ctx } = build();
    at(stage, DRUM_STRIKE_AT + 0.0417);
    const mesh = node(ctx.root, 'head-impact') as THREE.Mesh;
    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

    // 按半径分箱，取每箱的平均下沉量。
    const bins = 6;
    const sums = new Array<number>(bins).fill(0);
    const counts = new Array<number>(bins).fill(0);
    let rMax = 0;
    for (let i = 0; i < attr.count; i += 1) {
      rMax = Math.max(rMax, Math.hypot(attr.getX(i), attr.getY(i)));
    }
    for (let i = 0; i < attr.count; i += 1) {
      const r = Math.hypot(attr.getX(i), attr.getY(i)) / rMax;
      const b = Math.min(bins - 1, Math.floor(r * bins));
      sums[b] += -attr.getZ(i);
      counts[b] += 1;
    }
    const depth = sums.map((v, i) => v / Math.max(1, counts[i]));

    // 鼓心最深。
    expect(depth[0], `鼓心下沉 ${depth[0].toFixed(1)}`).toBeGreaterThan(60);
    // 逐箱向外单调变浅。
    for (let i = 1; i < bins; i += 1) {
      expect(depth[i], `第 ${i} 环比内环更深（剖面不是碗形？）`).toBeLessThan(depth[i - 1]);
    }
    // 鼓缘被鼓框夹住：外缘下沉不到鼓心的 8%。
    expect(depth[bins - 1] / depth[0],
      `鼓缘/鼓心 = ${(depth[bins - 1] / depth[0]).toFixed(3)}（鼓缘未被夹住）`)
      .toBeLessThan(0.08);
    // 形变必须被标记上传。`needsUpdate` 是只写属性（setter 只递增
    // `version`），所以查 version：只写缓冲不置 needsUpdate 的话数据对、
    // 屏幕上什么都不动，而按缓冲取值的断言照样绿。
    const versionBefore = attr.version;
    at(stage, DRUM_STRIKE_AT + 0.06);
    expect(attr.version, '顶点形变未标记上传（屏幕上不会动）')
      .toBeGreaterThan(versionBefore);
    stage.dispose();
  });

  // 「反弹」不止是回到平面——绷紧的膜会**冲过**平面向外鼓。
  // 只做「凹下去再抬平」的实现在这条上红。
  it('签名·反弹冲过平面向外鼓（形变换向）', () => {
    const { stage, ctx } = build();
    let maxBulge = 0;
    let bulgeAt = 0;
    let maxDent = 0;
    let dentAt = 0;
    for (let i = 0; i <= 160; i += 1) {
      const t = DRUM_STRIKE_AT + (i / 160) * 0.4;
      at(stage, t);
      const d = headDeform(ctx.root);
      if (d.dent > maxDent) { maxDent = d.dent; dentAt = t; }
      if (d.bulge > maxBulge) { maxBulge = d.bulge; bulgeAt = t; }
    }
    expect(maxBulge, '鼓面从未外鼓（只凹不弹）').toBeGreaterThan(20);
    // 外鼓必须发生在凹陷之后（先压进去，后弹出来）。
    expect(bulgeAt).toBeGreaterThan(dentAt);
    // 反弹能量低于击打（膜有阻尼）。
    expect(maxBulge).toBeLessThan(maxDent);
    stage.dispose();
  });

  // 签名后半之一：鼓槌是**飞入**的，位置单调逼近鼓面。
  it('签名·鼓槌飞入（到击点距离单调递减且加速）', () => {
    const { stage, ctx } = build();
    at(stage, DRUM_ACT1_END);
    const strike = node(ctx.root, 'drum-mallet').position.clone();

    const dists: number[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = (i / 12) * DRUM_ACT1_END;
      at(stage, t);
      dists.push(node(ctx.root, 'drum-mallet').position.distanceTo(strike));
    }
    // 起点在画面另一头（不是原地淡入）。
    expect(dists[0], '鼓槌起始就在击点上').toBeGreaterThan(500);
    // 严格逼近。
    for (let i = 1; i < dists.length; i += 1) {
      expect(dists[i], `第 ${i} 段未逼近`).toBeLessThan(dists[i - 1]);
    }
    expect(dists[dists.length - 1]).toBeLessThan(1);
    // 抡下来是加速的：逐段位移越来越大（匀速飞入这条红）。
    const seg: number[] = [];
    for (let i = 1; i < dists.length; i += 1) seg.push(dists[i - 1] - dists[i]);
    for (let i = 1; i < seg.length; i += 1) {
      expect(seg[i], `第 ${i} 段未加速`).toBeGreaterThan(seg[i - 1]);
    }
    expect(malletApproach(0)).toBe(0);
    expect(malletApproach(DRUM_ACT1_END)).toBeCloseTo(1, 9);
    stage.dispose();
  });

  // ── 签名后半之二：震屏 ─────────────────────────────────────────

  it('签名·震屏位移整个场景 group（不只是元素各自抖）', () => {
    const { stage, ctx } = build();
    const group = node(ctx.root, 'drum-scene');
    at(stage, 0.02);
    expect(group.position.length(), '击打前不该震').toBeLessThan(1e-6);

    let maxOffset = 0;
    for (let i = 0; i < 80; i += 1) {
      at(stage, DRUM_STRIKE_AT + i * 0.002);
      maxOffset = Math.max(maxOffset, group.position.length());
    }
    expect(maxOffset, 'group 未被位移').toBeGreaterThan(10);

    // 幕尾必须回到原位附近（不是永久跑偏）。
    at(stage, 0.999);
    expect(group.position.length()).toBeLessThan(maxOffset * 0.15);
    stage.dispose();
  });

  it('震屏是衰减的余震（分窗峰值序列单调下降）', () => {
    const { stage, ctx } = build();
    const group = node(ctx.root, 'drum-scene');
    // 窗宽取鼓面振动的半周期：一次回弹对应一记余震。
    const lobe = Math.PI / 34;
    const peaks: number[] = [];
    for (let w = 0; w < 5; w += 1) {
      let peak = 0;
      for (let i = 0; i <= 120; i += 1) {
        const t = DRUM_STRIKE_AT + w * lobe + (i / 120) * lobe;
        at(stage, t);
        peak = Math.max(peak, group.position.length());
      }
      peaks.push(peak);
    }
    expect(peaks[0]).toBeGreaterThan(10);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i], `第 ${i} 记余震未衰减（峰值序列 ${peaks.map((v) => v.toFixed(1))}）`)
        .toBeLessThan(peaks[i - 1]);
    }
    stage.dispose();
  });

  // 与 meteor 的可测差异：meteor 是坠地一次冲击后**单调**衰减的 exp 包络，
  // 一次都不会被重新拉起；drum 的包络由鼓面回弹反复拉起，是多次余震。
  // 把 drum 的震屏改成 meteor 式的单包络，这条立刻红。
  it('震屏与 meteor 的单次冲击机制可测地不同（多次再拉起）', () => {
    const carrier = Math.PI / 155;
    const drumRises = reignitionCount(drumQuakeAmount, DRUM_STRIKE_AT, carrier);
    const meteorRises = reignitionCount(screenShakeAmount, METEOR_ACT2_END, Math.PI / 118);
    expect(meteorRises, 'meteor 应为单次冲击（零次再拉起）').toBe(0);
    expect(drumRises, `drum 余震再拉起次数 ${drumRises}`).toBeGreaterThanOrEqual(5);
    // 且 drum 的再拉起来自鼓面回弹：包络与鼓面位移同源。
    expect(drumQuakeAmount(DRUM_STRIKE_AT - 0.01)).toBe(0);
    expect(drumQuakeAmount(0.9)).toBeLessThan(drumQuakeAmount(0.2));
  });

  // ── 物理：鼓皮粒子 ────────────────────────────────────────────

  // 重力的判别特征不是「升幅递减」——线性阻尼也让升幅递减（实测重力关掉后
  // 二阶差分仍是 -0.013 的恒负值，只做单调性检查的断言在 gravity=0 下照样绿，
  // 本项目反复出现的「绿灯但机制不存在」）。真重力的两个不可伪造特征是：
  // 粒子会**落回来**，且抛物线高度与实测加速度满足 h ≈ v0²/(2|a|)。
  it('物理·鼓皮粒子受重力（抛物线落回，且高度与实测加速度自洽）', () => {
    const { stage, ctx } = build();
    // 采样窗只覆盖自由飞行段：落地反弹会给出正的二阶差分（那是法向
    // 冲量不是重力），把它算进来会污染判据。
    const all: number[] = [];
    for (let i = 0; i <= 40; i += 1) {
      at(stage, stepAt(i));
      all.push(node(ctx.root, 'skin-0').position.y);
    }
    // 落点 = 顶点之后第一个上折处（那一步已被地面钳位，故排除在窗外）。
    let apex = 0;
    for (let i = 0; i < all.length; i += 1) if (all[i] > all[apex]) apex = i;
    let low = apex;
    while (low < all.length - 1 && all[low + 1] < all[low]) low += 1;
    const ys = all.slice(0, low);
    expect(ys.length, '自由飞行段过短').toBeGreaterThan(12);
    const d1: number[] = [];
    for (let i = 1; i < ys.length; i += 1) d1.push(ys[i] - ys[i - 1]);

    // 被弹起来了。
    expect(d1[0], '粒子未被弹起').toBeGreaterThan(5);
    const v0 = d1[0];

    // 二阶差分恒负（持续向下加速）。
    const d2: number[] = [];
    for (let i = 1; i < d1.length; i += 1) d2.push(d1[i] - d1[i - 1]);
    for (let i = 0; i < d2.length; i += 1) {
      expect(d2[i], `第 ${i} 段未向下加速`).toBeLessThan(0);
    }

    // ① 必须落回来：升到顶点后掉头下坠。零重力下粒子一路飞出画面。
    const apexIdx = apex;
    expect(apexIdx, '粒子从未到达顶点（一直上升＝无重力）').toBeLessThan(ys.length - 2);
    expect(ys[ys.length - 1], '粒子未下坠').toBeLessThan(ys[apexIdx] * 0.85);
    // 零重力下升幅几乎不减，顶点会撞在采样窗末端。
    expect(apexIdx, '顶点落在窗尾＝仍在上升').toBeLessThan(ys.length - 3);

    // ② 抛体自洽：顶点高度必须与实测加速度对得上（h ≈ v0²/2|a|）。
    // 阻尼冒充重力时加速度小两个量级，预测高度会大出几十倍，这条立刻红。
    const meanAccel = Math.abs(d2.reduce((a, b) => a + b, 0) / d2.length);
    const predicted = (v0 * v0) / (2 * meanAccel);
    expect(predicted / ys[apexIdx], `预测顶点 ${predicted.toFixed(0)} vs 实测 ${ys[apexIdx].toFixed(0)}`)
      .toBeGreaterThan(0.6);
    expect(predicted / ys[apexIdx], `预测顶点 ${predicted.toFixed(0)} vs 实测 ${ys[apexIdx].toFixed(0)}`)
      .toBeLessThan(1.6);
    stage.dispose();
  });

  it('物理·鼓皮粒子落回鼓面反弹且弹跳高度衰减', () => {
    const { stage, ctx } = build();
    const ys: number[] = [];
    const steps = Math.floor((1 - DRUM_STRIKE_AT) / STEP_T);
    for (let i = 0; i <= steps; i += 1) {
      at(stage, stepAt(i));
      ys.push(node(ctx.root, 'skin-0').position.y);
    }
    const floor = Math.min(...ys);

    // 反弹判据是**单步升幅**，不是总回升量。restitution=0 时粒子仍会
    // 沿面滑行，而每步地面钳位会把 y 微抬——只看总量的断言在
    // restitution=0 下照样绿（本项目反复出现的「绿灯但机制不存在」）。
    // 找到首个落点（第一个波谷）之后再量升幅。
    let apexIdx = 0;
    for (let i = 0; i < ys.length; i += 1) if (ys[i] > ys[apexIdx]) apexIdx = i;
    let touchIdx = apexIdx;
    while (touchIdx < ys.length - 1 && ys[touchIdx + 1] <= ys[touchIdx]) touchIdx += 1;
    expect(ys[touchIdx], '粒子未落回鼓面').toBeLessThan(floor + 5);

    let maxStepRise = 0;
    for (let i = touchIdx + 1; i < ys.length; i += 1) {
      maxStepRise = Math.max(maxStepRise, ys[i] - ys[i - 1]);
    }
    // 一次真反弹的首步升幅远大于滑行漂移（本项目实测：滑行仅 ~3.8px/步）。
    expect(maxStepRise, '粒子未反弹（restitution 未施加？）').toBeGreaterThan(8);

    // 逐次弹跳顶点必须衰减。用「离面高度回落到近地」切分弹跳。
    const near = floor + 3;
    const apexes: number[] = [];
    let cur = -1;
    for (const y of ys) {
      if (y <= near) { if (cur > near + 2) apexes.push(cur); cur = -1; } else cur = Math.max(cur, y);
    }
    if (cur > near + 2) apexes.push(cur);
    expect(apexes.length, `弹跳次数 ${apexes.length}（应连跳数次）`).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < apexes.length; i += 1) {
      expect(apexes[i], `第 ${i} 次弹跳未衰减（${apexes.map((v) => v.toFixed(1))}）`)
        .toBeLessThan(apexes[i - 1]);
    }
    stage.dispose();
  });

  // ── 互动① 鼓面凹陷与环波同帧 ──────────────────────────────────

  // 环的强度取鼓面位移的绝对值，不是另跑一条正弦。
  //
  // 只断言「峰值时刻差 <0.04」是**不够的**：把环换成另一条频率相近的
  // 自跑正弦（ω=27, ζ=4.1，峰值 t=0.1776）与真实曲线（峰值 t=0.16675）
  // 只差 0.011，照样通过——这是本项目反复出现的「绿灯但机制不存在」。
  // 派生关系的不可伪造特征是**整条曲线成定比**：环亮度与鼓面形变量之比
  // 在全部采样上恒定。频率或阻尼一改，比值立刻散开。
  it('互动·鼓面凹陷与环波同帧达峰（峰值同帧，且整条曲线成定比）', () => {
    const { stage, ctx } = build();
    const rows: Array<{ t: number; deform: number; alpha: number }> = [];
    for (let i = 0; i <= 300; i += 1) {
      const t = DRUM_STRIKE_AT + (i / 300) * 0.3;
      at(stage, t);
      const d = headDeform(ctx.root);
      rows.push({
        t,
        // 形变的绝对量：凹陷段取凹陷、外鼓段取外鼓（环被两个方向都推动）。
        deform: Math.max(d.dent, d.bulge),
        alpha: uniformOf(node(ctx.root, 'ripple-0'), 'uAlpha'),
      });
    }
    // 峰值必须落在同一个采样点上（同帧，不是「相近」）。
    const dentPeak = rows.reduce((a, b) => (b.deform > a.deform ? b : a));
    const ringPeak = rows.reduce((a, b) => (b.alpha > a.alpha ? b : a));
    expect(dentPeak.deform, '鼓面未凹陷').toBeGreaterThan(60);
    expect(ringPeak.alpha, '环波未亮').toBeGreaterThan(0.3);
    // 规格要求 <0.04；同源驱动应当严格同帧（采样间隔 0.001）。
    expect(Math.abs(ringPeak.t - dentPeak.t),
      `凹陷峰 ${dentPeak.t.toFixed(5)} vs 环波峰 ${ringPeak.t.toFixed(5)}`).toBeLessThan(0.04);
    expect(Math.abs(ringPeak.t - dentPeak.t),
      `峰值未同帧：凹陷 ${dentPeak.t.toFixed(5)} vs 环波 ${ringPeak.t.toFixed(5)}`)
      .toBeLessThan(0.0015);

    // 定比：环亮度 / 形变量在全部有效采样上恒定（离散度 <2%）。
    const ratios = rows
      .filter((r) => r.deform > 5 && r.alpha > 0.02)
      .map((r) => r.alpha / r.deform);
    expect(ratios.length, '有效采样过少').toBeGreaterThan(80);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const spread = (Math.max(...ratios) - Math.min(...ratios)) / mean;
    expect(spread, `环/形变比值离散度 ${(spread * 100).toFixed(1)}%（环与鼓面脱钩？）`)
      .toBeLessThan(0.02);
    stage.dispose();
  });

  it('互动·环波强度就是鼓面位移的派生量（切断鼓面则环归零）', () => {
    // 因果本体是纯函数：环的驱动量恒等于 |鼓面位移|。
    for (const t of [0.13, 0.16, 0.2, 0.26, 0.35, 0.6]) {
      expect(rippleDrive(t), `t=${t}`).toBeCloseTo(Math.abs(headDeflection(t)), 12);
    }
    // 击打前鼓面不动，环也不该有强度。
    expect(headDeflection(DRUM_STRIKE_AT - 0.01)).toBe(0);
    expect(rippleDrive(DRUM_STRIKE_AT - 0.01)).toBe(0);
    // 凹陷量只取压入方向，外鼓段归零（但环仍被外鼓推动）。
    const bulgeT = DRUM_STRIKE_AT + Math.PI / 34 + 0.02;
    expect(headDeflection(bulgeT)).toBeLessThan(0);
    expect(dentDepth(bulgeT)).toBe(0);
    expect(rippleDrive(bulgeT)).toBeGreaterThan(0);
  });

  // ── 互动② 鼓皮粒子被环波推远 ──────────────────────────────────

  // 「被推」的可观测特征是**加速度**只在波前经过时出现：波前之外只有
  // 阻尼在减速。去掉推力后 in-band 与 out-band 都变成负值，这条红。
  it('互动·环波扫过时粒子径向加速（波前之外只减速）', () => {
    const { stage, ctx } = build();
    const steps = Math.floor((1 - DRUM_STRIKE_AT) / STEP_T) - 1;
    const xs = sampleSkinRadii(stage, ctx.root, steps);
    const sceneT = (i: number) => stepAt(i);

    let inSum = 0; let inN = 0; let outSum = 0; let outN = 0;
    for (let p = 0; p < xs[0].length; p += 1) {
      for (let i = 2; i < xs.length; i += 1) {
        // 该步的速度增量，以及产生它的那一步上波前是否正扫过该粒子。
        const dv = (xs[i][p] - xs[i - 1][p]) - (xs[i - 1][p] - xs[i - 2][p]);
        const rUv = xs[i - 2][p] / UV_X;
        const push = Math.max(...rippleRadii(sceneT(i - 2)).map((r) => sweepPush(r, rUv)));
        if (push > 0.2) { inSum += dv; inN += 1; } else { outSum += dv; outN += 1; }
      }
    }
    expect(inN, '没有任何粒子被波前扫到').toBeGreaterThan(50);
    const inMean = inSum / inN;
    const outMean = outSum / outN;
    // 波前内：外移速度被拉起（正加速）。
    expect(inMean, `波前内平均加速 ${inMean.toFixed(3)}`).toBeGreaterThan(0.3);
    // 波前外：只有阻尼，净减速。
    expect(outMean, `波前外平均加速 ${outMean.toFixed(3)}`).toBeLessThan(0);
    // 两者量级必须真的拉开，不是噪声。
    expect(inMean).toBeGreaterThan(Math.abs(outMean) * 3);
    stage.dispose();
  });

  it('互动·推力窗口是波前经过（环没到不推、过去也不推）', () => {
    // 因果本体：只有环半径落在粒子半径的窄带里才有推力。
    expect(sweepPush(0.3, 0.3)).toBeCloseTo(1, 9);
    expect(sweepPush(-1, 0.3), '环未发出仍推').toBe(0);
    expect(sweepPush(0.05, 0.3), '环还没到就推').toBe(0);
    expect(sweepPush(0.6, 0.3), '环已过去还在推').toBe(0);
    // 带宽必须比鼓面在同一尺度下的跨度窄，否则是「一次齐推」不是「扫过」。
    const headSpanUv = (1080 * 0.3) / UV_X;
    let band = 0;
    for (let g = 0; g <= 400; g += 1) {
      const gap = (g / 400) * 0.2;
      if (sweepPush(0.3 + gap, 0.3) > 0) band = gap;
    }
    expect(band, `推力带宽 ${band.toFixed(4)} 应窄于鼓面跨度 ${headSpanUv.toFixed(4)}`)
      .toBeLessThan(headSpanUv);
    expect(band).toBeGreaterThan(0.005);
  });

  // 稀疏 update 陷阱（本项目最容易中招的一类）：验收会在稀疏 t 上调
  // update（一次跨几百毫秒），运行时则每帧密集调用。凡「按调用频率推进」
  // 的逻辑在两种模式下结果不同，而**密集调用看着完全正常**。
  // 密集/稀疏等价是这条逻辑的唯一可测判据：物理必须由场景时间轴驱动
  // （target = (t - strike) × 时长），环波半径必须在追赶循环内逐步采样。
  it('物理·稀疏 update 与密集 update 结果一致（时间轴驱动而非调用频率）', () => {
    const end = 0.62;
    const readout = (root: THREE.Object3D) => {
      const skins = collectExact(root, 'skin');
      const xs = skins.map((o) => Math.abs(o.position.x));
      return {
        y: node(root, 'skin-0').position.y,
        spread: xs.reduce((a, b) => a + b, 0) / xs.length,
      };
    };

    // 密集：每个物理步一次 update（运行时的样子）。
    const dense = build();
    const steps = Math.floor((end - DRUM_STRIKE_AT) / STEP_T);
    for (let i = 0; i <= steps; i += 1) at(dense.stage, stepAt(i));
    at(dense.stage, end);
    const d = readout(dense.ctx.root);

    // 稀疏：整段只调 6 次，每次跨近百毫秒（验收的样子）。
    const sparse = build();
    for (let i = 1; i <= 6; i += 1) {
      at(sparse.stage, DRUM_STRIKE_AT + ((end - DRUM_STRIKE_AT) * i) / 6);
    }
    const sp = readout(sparse.ctx.root);

    // 弹跳高度：两种调用模式必须落在同一处。
    expect(Math.abs(sp.y - d.y), `稀疏 y=${sp.y.toFixed(1)} vs 密集 y=${d.y.toFixed(1)}`)
      .toBeLessThan(Math.max(8, Math.abs(d.y) * 0.12));
    // 被环波推开的散布半径：两种模式必须一致（快照式采样会让它明显偏小）。
    expect(sp.spread / d.spread, `稀疏散布 ${sp.spread.toFixed(1)} vs 密集 ${d.spread.toFixed(1)}`)
      .toBeGreaterThan(0.9);
    expect(sp.spread / d.spread).toBeLessThan(1.1);

    dense.stage.dispose();
    sparse.stage.dispose();
  });

  it('互动·粒子被推远后整体散开半径显著增大', () => {
    const { stage, ctx } = build();
    at(stage, DRUM_STRIKE_AT);
    const before = collectExact(ctx.root, 'skin').map((o) => Math.abs(o.position.x));
    const meanBefore = before.reduce((a, b) => a + b, 0) / before.length;
    for (let i = 0; i <= 200; i += 1) at(stage, DRUM_STRIKE_AT + (i / 200) * (1 - DRUM_STRIKE_AT));
    const after = collectExact(ctx.root, 'skin').map((o) => Math.abs(o.position.x));
    const meanAfter = after.reduce((a, b) => a + b, 0) / after.length;
    expect(meanAfter, `散开半径 ${meanBefore.toFixed(1)} → ${meanAfter.toFixed(1)}`)
      .toBeGreaterThan(meanBefore * 1.8);
    stage.dispose();
  });

  // ── 其它规格条目 ──────────────────────────────────────────────

  it('全屏·低频环波末端半径越过屏角（铺满全屏）', () => {
    // 环贴片是 1.6 倍屏，屏缘在 UV 0.5/1.6 = 0.3125；
    // 环被压扁（÷DRUM_SQUASH）后屏角落在 hypot(0.3125, 0.3125/SQUASH)。
    const edge = 0.5 / RIPPLE_PLANE_SCALE;
    const corner = Math.hypot(edge, edge / DRUM_SQUASH);
    expect(RIPPLE_MAX_R, `最大半径 ${RIPPLE_MAX_R} 未越过屏角 ${corner.toFixed(3)}`)
      .toBeGreaterThan(corner);
    // 各层都真的扩到最大半径。
    for (let i = 0; i < RIPPLE_LAYERS; i += 1) {
      let maxR = 0;
      for (let k = 0; k <= 400; k += 1) maxR = Math.max(maxR, rippleRadius(k / 400, i));
      expect(maxR, `第 ${i} 层未扩到屏角`).toBeGreaterThan(corner);
    }
  });

  it('环波多层错峰发出（未发出时不可见）', () => {
    const { stage, ctx } = build();
    at(stage, 0.05);
    for (let i = 0; i < RIPPLE_LAYERS; i += 1) {
      expect(uniformOf(node(ctx.root, `ripple-${i}`), 'uAlpha'), `击打前第 ${i} 层`).toBe(0);
      expect(uniformOf(node(ctx.root, `ripple-${i}`), 'uRadius'), `击打前第 ${i} 层`).toBe(0);
    }
    // 各层半径依次落后：同一时刻外层比内层小。
    at(stage, 0.34);
    const radii: number[] = [];
    for (let i = 0; i < RIPPLE_LAYERS; i += 1) {
      radii.push(uniformOf(node(ctx.root, `ripple-${i}`), 'uRadius'));
    }
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i], `第 ${i} 层未错峰`).toBeLessThan(radii[i - 1]);
    }
    stage.dispose();
  });

  it('音浪拖影是低频残留（比凹陷晚达峰、散得更慢）', () => {
    let dentAt = -1; let dentPeak = -1;
    let smearAt = -1; let smearPeak = -1;
    for (let i = 0; i <= 2000; i += 1) {
      const t = i / 2000;
      const d = dentDepth(t);
      if (d > dentPeak) { dentPeak = d; dentAt = t; }
      const s = boomSmear(t);
      if (s > smearPeak) { smearPeak = s; smearAt = t; }
    }
    expect(smearAt, `拖影峰 ${smearAt.toFixed(4)} 未晚于凹陷峰 ${dentAt.toFixed(4)}`)
      .toBeGreaterThan(dentAt);
    // 晚期残留比：拖影衰减得比凹陷慢。
    const lateT = 0.55;
    expect(boomSmear(lateT) / smearPeak).toBeGreaterThan(dentDepth(lateT) / dentPeak);
  });

  it('锤头火星只在凹陷期间迸发，发射点跟着击点走', () => {
    const { stage, ctx } = build();
    at(stage, 0.05);
    const restY = node(ctx.root, 'spark-burst').position.y;
    // 凹陷最深时锚点被压到最低（跟着鼓面走，不是钉在原地）。
    at(stage, DRUM_STRIKE_AT + 0.0417);
    const deepY = node(ctx.root, 'spark-burst').position.y;
    expect(deepY, '火星发射点没跟着鼓面下沉').toBeLessThan(restY - 5);
    stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, DRUM_ACT1_END * 0.5);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (DRUM_ACT1_END + DRUM_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.95);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档只减粒子密度，8 个命名构成件一个不少', () => {
    const hi = build();
    at(hi.stage, 0.4);
    const hiTree = names(hi.ctx.root);
    const hiSkins = collectExact(hi.ctx.root, 'skin').length;

    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.4, 'medium');
    const loTree = names(lo.ctx.root);
    const loSkins = collectExact(lo.ctx.root, 'skin').length;

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    // 鼓皮粒子是密度件：严格变少但绝不归零（scaledCount 的 max(1,…) 下限）。
    expect(loSkins, `medium ${loSkins} 应少于 cinematic ${hiSkins}`).toBeLessThan(hiSkins);
    expect(loSkins).toBeGreaterThan(0);
    // 环波是结构件，层数不随档位变。
    expect(collectExact(lo.ctx.root, 'ripple')).toHaveLength(RIPPLE_LAYERS);
    expect(collectExact(hi.ctx.root, 'ripple')).toHaveLength(RIPPLE_LAYERS);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树摘净、幂等，且再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.7)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });
});
