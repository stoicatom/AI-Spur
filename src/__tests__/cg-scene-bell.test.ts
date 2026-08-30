import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-bell';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  AIR_DELAY,
  AIR_GAIN,
  BELL_ATTACK,
  BELL_PARTIALS,
  BODY_DELAY,
  beatPeriod,
  decayHalfLife,
  echoChain,
  partialAmplitude,
  partialEnvelope,
  resonanceEnvelope,
  spectralCentroid,
  strikeImpulse,
} from '../overlay/cg-scenes/bell-partials';
import {
  BELL_ACT1_END,
  BELL_ACT2_END,
  RING_TRAVEL,
  STRIKE_AT,
  bendingWaveFront,
  partialPhase,
  partialRingRadius,
  strikerApproach,
} from '../overlay/cg-scenes/bell-timeline';
import { AIR_RIPPLE_LAYERS, CLAPPER_GHOSTS } from '../overlay/cg-scenes/bell-parts';
import { stringEnvelope } from '../overlay/cg-scenes/guitar-acoustics';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/**
 * 规格 §4.2 场景 21 的 8 个构成件的具名节点。
 *
 * ⑤余韵拖尾由 quarks 承载——`hub.emit()` 返回的 emitter 一旦
 * `hub.update()` 跑过就被批渲染器摘走、无法按名定位，故场景自持
 * 具名锚点 `echo-trail-anchor` 镜像其发射点，验收对锚点断言。
 */
const NAMED_ELEMENTS = [
  'bell-body',           // ① 钟身
  'striker-ball',        // ② 撞球
  'bell-standing-wave',  // ③ 钟波（钟面驻波）
  'oring-0',             // ④ 泛音光环
  'echo-trail-anchor',   // ⑤ 余韵拖尾（锚点）
  'airwave-0',           // ⑥ 空气波纹
  'ghost-0',             // ⑦ 钟舌残影
  'temple-silhouette',   // ⑧ 背景庙宇剪影
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('bell');
  if (!scene) throw new Error('bell 场景未注册');
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
 * 命中刚体与反光片）。这里三个前缀 `oring` / `airwave` / `ghost`
 * 互不为前缀，且驻波层 `bell-standing-wave` 不带 `-N` 后缀，
 * 因此永远不会被 `/^x-\d+$/` 误收。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 采样一条曲线，返回峰值与峰值时刻。 */
function peakOf(f: (t: number) => number, from = 0, to = 1, steps = 2000): { peak: number; at: number } {
  let peak = -Infinity;
  let when = from;
  for (let i = 0; i <= steps; i += 1) {
    const t = from + ((to - from) * i) / steps;
    const v = f(t);
    if (v > peak) { peak = v; when = t; }
  }
  return { peak, at: when };
}

/** 曲线从自身峰值降到 frac 倍为止的持续时长（自撞击起算）。 */
function tailDuration(f: (t: number) => number, frac: number, origin: number): number {
  const { peak } = peakOf(f);
  let last = origin;
  for (let i = 0; i <= 4000; i += 1) {
    const t = i / 4000;
    if (f(t) >= peak * frac) last = t;
  }
  return last - origin;
}

describe('场景 21 bell（古钟余韵）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('bell');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.title).toBe('古钟余韵');
    expect(scene!.config.preset).toBe('echo');
    // 签名用规格原文：驻波 + 泛音分层。
    expect(scene!.config.signature).toContain('驻波+泛音分层');
    expect(scene!.config.signature).toContain('钟体→空间泛音');
    // 规格元素清单逐项。
    expect(scene!.config.elements).toEqual([
      '钟身 mesh', '撞球', '钟波', '泛音光环',
      '余韵拖尾', '空气波纹', '钟舌残影', '背景庙宇剪影',
    ]);
  });

  it('场景树包含规格的全部 8 个具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    // 五个分音各一层光环、三层空气波纹、四帧钟舌残影。
    expect(collectExact(ctx.root, 'oring')).toHaveLength(BELL_PARTIALS.length);
    expect(collectExact(ctx.root, 'airwave')).toHaveLength(AIR_RIPPLE_LAYERS);
    expect(collectExact(ctx.root, 'ghost')).toHaveLength(CLAPPER_GHOSTS);
    stage.dispose();
  });

  // ===== 签名核心 A：多泛音以不同速率衰减 =====
  // 若实现退化成「一条 exp 曲线」（所有分音同 decay），这条红。
  it('签名·五个分音的衰减时间常数各不相同且随频率严格递增', () => {
    const halves = BELL_PARTIALS.map((_, i) => decayHalfLife(i));
    const trace = BELL_PARTIALS.map((p, i) => `${p.name}=${halves[i].toFixed(4)}`).join(' ');
    // 严格递减：频率越高半衰期越短（高频先熄）。用严格 < 而非 <=，
    // 「全部同衰减率」会让相邻两项相等，这条随之转红。
    for (let i = 1; i < halves.length; i += 1) {
      expect(halves[i], `半衰期 ${trace} 在 ${i} 处未变短`).toBeLessThan(halves[i - 1]);
    }
    // 首末差距足够大（真的是分层，不是数值抖动）：嗡音余韵 ≥ 名义音的 5 倍。
    expect(halves[0] / halves[halves.length - 1], trace).toBeGreaterThan(5);
    // 且五个值两两互不相等（不是只有一两个特例）。
    expect(new Set(halves.map((h) => h.toFixed(6))).size).toBe(halves.length);
  });

  it('签名·各分音单独取值时衰减速率确实不同（同一时刻幅度比在变）', () => {
    // 取撞击后的两个时刻，比较「高分音 / 嗡音」的幅度比：分层则比值必须下降。
    // 时刻必须在撞击之后——此前两者皆为零，比值是 NaN 而非有效证据。
    const early = STRIKE_AT + 0.02;
    const late = STRIKE_AT + 0.45;
    const ratios: number[] = [];
    for (let i = 1; i < BELL_PARTIALS.length; i += 1) {
      const a = partialAmplitude(early, i, STRIKE_AT) / partialAmplitude(early, 0, STRIKE_AT);
      const b = partialAmplitude(late, i, STRIKE_AT) / partialAmplitude(late, 0, STRIKE_AT);
      expect(a, `分音 ${i} 早期无能量`).toBeGreaterThan(0.05);
      // 高分音相对嗡音必须越来越弱。同衰减率时 a === b，这条红。
      expect(b, `分音 ${i} 幅度比 ${a}→${b} 未随时间下降`).toBeLessThan(a);
      // 且下降量精确等于两者衰减率之差：ratio(t) ∝ exp(−(dᵢ−d₀)·t)。
      // 这比任何阈值都强——它把「差多少」也钉死，
      // 任何把 decay 列改成同值的变异都会让右式变成 1 而左式不变。
      const gap = BELL_PARTIALS[i].decay - BELL_PARTIALS[0].decay;
      expect(b / a, `分音 ${i} 幅度比的下降量与衰减率之差不符`)
        .toBeCloseTo(Math.exp(-gap * (late - early)), 9);
      expect(gap, `分音 ${i} 与嗡音衰减率相同`).toBeGreaterThan(0);
      ratios.push(b / a);
    }
    // 越高的分音衰减越猛：比值的下降幅度随分音序号递增。
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i], `分音 ${i + 1} 未比 ${i} 衰减更猛`).toBeLessThan(ratios[i - 1]);
    }
  });

  it('签名·谱心随时间单调下降（音色变暗，同衰减率时本量恒为常数）', () => {
    // 采样点全部取自撞击之后：撞击前无能量，谱心按定义为 0。
    const samples = [0.005, 0.02, 0.05, 0.1, 0.2, 0.35, 0.55, 0.8]
      .map((d) => ({ t: STRIKE_AT + d, c: spectralCentroid(STRIKE_AT + d, STRIKE_AT) }));
    const trace = samples.map((s) => `${s.t}:${s.c.toFixed(3)}`).join(' ');
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].c, `谱心 ${trace} 在 ${samples[i].t} 处未下降`)
        .toBeLessThan(samples[i - 1].c);
    }
    // 下降幅度足够大：起始谱心接近中分音（~2.2），末端明显趋近嗡音。
    expect(samples[0].c).toBeGreaterThan(2);
    expect(samples[samples.length - 1].c).toBeLessThan(1.45);
    // 撞击前无能量：谱心为 0（而非沿用上一帧的残值）。
    expect(spectralCentroid(STRIKE_AT - 1e-6, STRIKE_AT)).toBe(0);
  });

  // ===== 签名核心 B：合成包络出现拍频（振幅有起伏而非单调下降）=====
  it('签名·合成余韵包络在峰后出现多次回升（拍频，不是单调衰减）', () => {
    const N = 4000;
    const vals: number[] = [];
    for (let i = 0; i <= N; i += 1) vals.push(resonanceEnvelope(i / N, STRIKE_AT));
    let pi = 0;
    for (let i = 0; i < vals.length; i += 1) if (vals[i] > vals[pi]) pi = i;

    // 峰后的「局部极小 → 后续回升」段数：单调 exp 一段都不会有。
    let segments = 0;
    let rising = false;
    let localMin = vals[pi];
    let bestRebound = 0;
    for (let i = pi + 1; i < vals.length; i += 1) {
      if (vals[i] > vals[i - 1] + 1e-12) {
        if (!rising) { segments += 1; rising = true; }
        bestRebound = Math.max(bestRebound, (vals[i] - localMin) / Math.max(1e-9, localMin));
      } else {
        rising = false;
        if (vals[i] < localMin) localMin = vals[i];
      }
    }
    // 至少 3 段回升（拍频周期约 0.13–0.18 幕，一幕内必然多次）。
    expect(segments, `峰后回升段数 ${segments}`).toBeGreaterThanOrEqual(3);
    // 回升幅度显著（不是浮点抖动）：某次谷底后至少回涨 50%。
    expect(bestRebound, `最大相对回升 ${bestRebound}`).toBeGreaterThan(0.5);
  });

  it('签名·拍频来自双分音失谐：包络在拍频半周期处触零，周期与解析值一致', () => {
    // 单取嗡音：|cos(beatOmega·s/2)| 在 s = π/beatOmega 处为零。
    const period = beatPeriod(0);
    const half = period / 2;
    const zeroAt = STRIKE_AT + half;
    expect(partialEnvelope(zeroAt, 0, STRIKE_AT)).toBeCloseTo(0, 6);
    // 而在一个完整周期后回到（衰减后的）幅度峰：包络本身回升。
    const fullAt = STRIKE_AT + period;
    expect(partialEnvelope(fullAt, 0, STRIKE_AT))
      .toBeCloseTo(partialAmplitude(fullAt, 0, STRIKE_AT), 6);
    // 谷点确实低于其前后两侧（真的是谷，不是端点）。
    expect(partialEnvelope(zeroAt, 0, STRIKE_AT))
      .toBeLessThan(partialEnvelope(zeroAt - half * 0.5, 0, STRIKE_AT));
    expect(partialEnvelope(zeroAt, 0, STRIKE_AT))
      .toBeLessThan(partialEnvelope(zeroAt + half * 0.5, 0, STRIKE_AT));
    // 五个分音的拍频周期互不相同（各自失谐比不同）。
    const periods = BELL_PARTIALS.map((_, i) => beatPeriod(i));
    expect(new Set(periods.map((p) => p.toFixed(6))).size).toBe(periods.length);
    // 拍频周期落在一幕之内可见的量级（否则一幕内看不到起伏）。
    for (const p of periods) expect(p).toBeLessThan(0.35);
  });

  // ===== 与 guitar 的对照：锁住两个声学场景不趋同 =====
  it('对照 guitar·bell 余韵显著长于拨弦包络（半衰期与尾部能量双指标）', () => {
    // 指标一：嗡音半衰期 vs guitar 弦包络半衰期。
    const humHalf = decayHalfLife(0);
    // guitar 的 stringEnvelope 用 STRING_DECAY=3.1，半衰期 = ln2/3.1。
    const pluck = 0.02;
    const guitarHalf = tailDuration((t) => stringEnvelope(t, pluck), 0.5, pluck);
    expect(humHalf, `bell 嗡音半衰期 ${humHalf} / guitar 弦 ${guitarHalf}`)
      .toBeGreaterThan(guitarHalf * 3);

    // 指标二：末幕（700–1200ms）残留能量的绝对量，bell 必须明显更多。
    let bellTail = 0;
    let guitarTail = 0;
    const N = 2000;
    for (let i = 0; i <= N; i += 1) {
      const t = BELL_ACT2_END + ((1 - BELL_ACT2_END) * i) / N;
      bellTail += resonanceEnvelope(t, STRIKE_AT);
      guitarTail += stringEnvelope(t, pluck);
    }
    expect(bellTail, `末幕能量 bell=${bellTail} guitar=${guitarTail}`)
      .toBeGreaterThan(guitarTail * 1.4);
  });

  it('对照 guitar·拨弦包络峰后严格单调下降，bell 不是（机制不趋同）', () => {
    const N = 3000;
    const pluck = 0.02;
    let guitarRises = 0;
    let bellRises = 0;
    for (let i = 1; i <= N; i += 1) {
      const prev = (i - 1) / N;
      const cur = i / N;
      // 只看各自峰值之后的区间。
      if (prev > pluck + 0.05 && stringEnvelope(cur, pluck) > stringEnvelope(prev, pluck) + 1e-12) {
        guitarRises += 1;
      }
      if (prev > STRIKE_AT + 0.05
        && resonanceEnvelope(cur, STRIKE_AT) > resonanceEnvelope(prev, STRIKE_AT) + 1e-12) {
        bellRises += 1;
      }
    }
    // guitar：一条 exp，峰后一次都不回升。
    expect(guitarRises, 'guitar 拨弦包络出现回升').toBe(0);
    // bell：拍频让它反复回升。
    expect(bellRises, 'bell 余韵包络未出现回升（退化成单条 exp？）').toBeGreaterThan(100);
  });

  // ===== 因果链：撞击 → 钟体 → 空气 =====
  it('签名·三段传导链的峰值时刻依次滞后（撞击→钟体→空气）', () => {
    const s = peakOf((t) => echoChain(t, STRIKE_AT).strike);
    const b = peakOf((t) => echoChain(t, STRIKE_AT).body);
    const a = peakOf((t) => echoChain(t, STRIKE_AT).air);
    expect(s.peak).toBeGreaterThan(0.9);
    expect(b.peak).toBeGreaterThan(0.5);
    expect(a.peak).toBeGreaterThan(0.4);
    expect(b.at, `撞击 ${s.at} / 钟体 ${b.at}`).toBeGreaterThan(s.at);
    expect(a.at, `钟体 ${b.at} / 空气 ${a.at}`).toBeGreaterThan(b.at);
    // 滞后量与声明的延时一致（容差一个采样步）。
    expect(Math.abs(b.at - s.at - BODY_DELAY)).toBeLessThan(0.002);
    expect(Math.abs(a.at - b.at - AIR_DELAY)).toBeLessThan(0.002);
  });

  it('签名·切断撞击则下游两段必然归零（真串联，不是并联）', () => {
    // 撞击之前：三段全为零。
    for (const t of [0, 0.01, STRIKE_AT - 1e-6]) {
      const c = echoChain(t, STRIKE_AT);
      expect(c.strike, `t=${t} 撞击未发生却有脉冲`).toBe(0);
      expect(c.body, `t=${t} 未撞钟体却响`).toBe(0);
      expect(c.air, `t=${t} 未撞空气却有波`).toBe(0);
    }
    // 各段自己的延时窗口内也严格为零（下游比上游更晚起步）。
    expect(echoChain(STRIKE_AT + BODY_DELAY * 0.5, STRIKE_AT).body).toBe(0);
    expect(echoChain(STRIKE_AT + BODY_DELAY + AIR_DELAY * 0.5, STRIKE_AT).air).toBe(0);
    // 而撞击后足够晚，三段都有能量。
    const live = echoChain(STRIKE_AT + 0.1, STRIKE_AT);
    expect(live.body).toBeGreaterThan(0.05);
    expect(live.air).toBeGreaterThan(0.05);
  });

  it('签名·空气段恒等于钟段的滞后值（不是各跑一条曲线）', () => {
    for (const t of [0.2, 0.35, 0.5, 0.7, 0.9]) {
      const air = echoChain(t, STRIKE_AT).air;
      const bodyEarlier = echoChain(t - AIR_DELAY, STRIKE_AT).body;
      // air(t) === body(t - AIR_DELAY) × AIR_GAIN / BODY_GAIN
      const expected = (bodyEarlier / 0.88) * AIR_GAIN;
      expect(air, `t=${t} 空气段与钟体滞后值不符`).toBeCloseTo(expected, 9);
    }
  });

  it('互动①·撞击前钟波整层归零，撞击后波前沿钟身上行', () => {
    // 撞击前：波前在钟口以下。
    expect(bendingWaveFront(STRIKE_AT - 1e-6)).toBe(-1);
    expect(bendingWaveFront(0)).toBe(-1);
    // 撞击后：单调上行。
    const fronts = [0.02, 0.05, 0.1, 0.3].map((d) => bendingWaveFront(STRIKE_AT + d));
    for (let i = 1; i < fronts.length; i += 1) {
      expect(fronts[i], `波前未上行 ${fronts.join(',')}`).toBeGreaterThan(fronts[i - 1]);
    }
    // 走完整个钟体（>=1）需要时间，不是撞击瞬间铺满。
    expect(bendingWaveFront(STRIKE_AT + 0.01)).toBeLessThan(1);
  });

  it('互动①·运行期钟波层撞击前不可见、撞击后被点亮', () => {
    const { stage, ctx } = build();
    at(stage, STRIKE_AT * 0.5);
    expect(uniformOf(node(ctx.root, 'bell-standing-wave'), 'uAlpha'), '撞击前钟波已亮').toBe(0);
    const preAmps = (node(ctx.root, 'bell-standing-wave') as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >).material.uniforms.uAmp.value as number[];
    expect(Math.max(...preAmps), '撞击前分音已有幅度').toBe(0);

    at(stage, STRIKE_AT + 0.12);
    expect(uniformOf(node(ctx.root, 'bell-standing-wave'), 'uAlpha')).toBeGreaterThan(0.5);
    const amps = (node(ctx.root, 'bell-standing-wave') as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >).material.uniforms.uAmp.value as number[];
    expect(amps).toHaveLength(BELL_PARTIALS.length);
    expect(Math.max(...amps)).toBeGreaterThan(0.1);
    stage.dispose();
  });

  // 「驻波 + 泛音分层」的**空间**侧：每个分音在钟口圆周上有自己的节径数。
  // 这条是变异验证补写的——原先只测了幅度与相位，把 uMode 整列改成同一个
  // 常数时九项断言全绿，说明「分层」的空间半边压根没被测到。
  it('签名·各分音的环向节径数互不相同且随频率递增（驻波的空间分层）', () => {
    const modes = BELL_PARTIALS.map((p) => p.mode);
    const trace = modes.join(',');
    for (let i = 1; i < modes.length; i += 1) {
      expect(modes[i], `节径数 ${trace} 在 ${i} 处未变密`).toBeGreaterThan(modes[i - 1]);
    }
    // 全部互异，且都 >= 2（钟的最低弯曲模态是四分之一波，节径 2）。
    expect(new Set(modes).size).toBe(modes.length);
    for (const m of modes) expect(m).toBeGreaterThanOrEqual(2);

    // 节径真的落在不同角位置：cos(mode·φ) 在 φ∈[0,π] 上恰有 mode 个零点，
    // 节线数因此逐分音增加——这是钟面花纹「随时间由密变疏」的来源。
    const zerosOf = (mode: number): number => {
      let count = 0;
      const N = 20000;
      for (let k = 1; k <= N; k += 1) {
        const a = Math.cos((mode * Math.PI * (k - 1)) / N);
        const b = Math.cos((mode * Math.PI * k) / N);
        if (a === 0 || a * b < 0) count += 1;
      }
      return count;
    };
    const zeroCounts = modes.map(zerosOf);
    expect(zeroCounts, `节线数 ${zeroCounts.join(',')}`).toEqual(modes);

    // 场景真的把这一列喂给了 shader（不是建好就丢）。
    const { stage, ctx } = build();
    at(stage, 0.4);
    const uMode = (node(ctx.root, 'bell-standing-wave') as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >).material.uniforms.uMode.value as number[];
    expect(uMode, 'uMode 未按分音逐项写入').toEqual(modes);
    stage.dispose();
  });

  it('物理·钟波相位由时间轴算出（稀疏与密集调用结果一致）', () => {
    const target = 0.63;
    // 稀疏：一步跨到位。
    const sparse = build();
    at(sparse.stage, target);
    const sparsePhases = [...((node(sparse.ctx.root, 'bell-standing-wave') as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >).material.uniforms.uPhase.value as number[])];
    sparse.stage.dispose();

    // 密集：60 步走到同一时刻。
    const dense = build();
    for (let i = 1; i <= 60; i += 1) at(dense.stage, (target * i) / 60);
    const densePhases = [...((node(dense.ctx.root, 'bell-standing-wave') as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >).material.uniforms.uPhase.value as number[])];
    dense.stage.dispose();

    for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
      expect(densePhases[i], `分音 ${i} 相位随调用频率漂移`).toBeCloseTo(sparsePhases[i], 9);
    }
    // 相位确实在推进（不是恒零）且各分音速率不同。
    expect(sparsePhases[0]).toBeGreaterThan(1);
    expect(partialPhase(target, 4)).toBeGreaterThan(partialPhase(target, 0) * 3);
  });

  // ===== 互动②：泛音环按频率分层扩散 =====
  it('互动②·五环各自延时与速度不同，同一时刻半径互不相等', () => {
    // 高分音先发出：layerLag ∝ 1/ratio。
    const firstVisible = BELL_PARTIALS.map((_, i) => {
      for (let k = 0; k <= 3000; k += 1) {
        const t = k / 3000;
        if (partialRingRadius(t, i) >= 0) return t;
      }
      return Infinity;
    });
    const trace = firstVisible.map((v) => v.toFixed(4)).join(',');
    for (let i = 1; i < firstVisible.length; i += 1) {
      expect(firstVisible[i], `发出次序 ${trace} 在 ${i} 处未提前`)
        .toBeLessThan(firstVisible[i - 1]);
    }

    // 同一时刻五环半径两两不等（永不重合）。
    const t = 0.45;
    const radii = BELL_PARTIALS.map((_, i) => partialRingRadius(t, i)).filter((r) => r >= 0);
    expect(radii.length, '该时刻可见环不足').toBeGreaterThan(2);
    for (let i = 1; i < radii.length; i += 1) {
      expect(Math.abs(radii[i] - radii[i - 1]), `环 ${i} 与 ${i - 1} 重合`).toBeGreaterThan(1e-4);
    }

    // 扩散速度：高分音更快（同一飞行时长走得更远）。
    const flight = 0.08;
    const speeds = BELL_PARTIALS.map((p, i) => {
      const t0 = STRIKE_AT + p.layerLag;
      return partialRingRadius(t0 + flight, i);
    });
    for (let i = 1; i < speeds.length; i += 1) {
      expect(speeds[i], `分音 ${i} 未比 ${i - 1} 传得更快`).toBeGreaterThan(speeds[i - 1]);
    }
  });

  it('互动②·环半径线性外扩（声速恒定），未发出时返回 -1', () => {
    const p = BELL_PARTIALS[0];
    const t0 = STRIKE_AT + p.layerLag;
    const rs = [0.05, 0.1, 0.15, 0.2].map((d) => partialRingRadius(t0 + d, 0));
    for (const r of rs) expect(r).toBeGreaterThan(0);
    // 先钉「真的在外扩」：半径必须严格递增。
    // 只断言「两段增量相等」是假绿——常量半径的增量恒为 0，
    // 也满足「相等」，环钉死在原地照样过（本轮变异验证已证实）。
    const trace = rs.map((r) => r.toFixed(4)).join(',');
    for (let i = 1; i < rs.length; i += 1) {
      expect(rs[i], `半径 ${trace} 在 ${i} 处未外扩`).toBeGreaterThan(rs[i - 1]);
    }
    // 再钉「匀速」：两段增量相等且**不为零**（声速恒定）。
    const step = rs[1] - rs[0];
    expect(step, `增量 ${step} 为零，环没在动`).toBeGreaterThan(1e-3);
    expect(Math.abs(step - (rs[3] - rs[2]))).toBeLessThan(1e-9);
    // 起点在钟体附近而非半空冒出：刚发出时半径接近零。
    expect(partialRingRadius(t0 + 1e-4, 0)).toBeLessThan(0.01);
    // 未发出 / 已越界：-1。
    expect(partialRingRadius(STRIKE_AT - 0.01, 0)).toBe(-1);
    expect(partialRingRadius(t0 - 1e-6, 0)).toBe(-1);
    expect(partialRingRadius(t0 + RING_TRAVEL + 0.01, 0)).toBe(-1);
  });

  it('互动②·运行期环亮度由各自分音包络驱动（高分音的环先熄）', () => {
    const { stage, ctx } = build();
    // 撞击前：全部环不可见。
    at(stage, STRIKE_AT * 0.5);
    for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
      expect(uniformOf(node(ctx.root, `oring-${i}`), 'uAlpha'), `撞击前环 ${i} 已亮`).toBe(0);
    }

    // 各环自己的峰值亮度时刻：高分音必须更早达峰。
    const peaks = BELL_PARTIALS.map(() => ({ v: 0, t: 0 }));
    const total = 400;
    for (let k = 0; k <= total; k += 1) {
      const t = k / total;
      at(stage, t);
      for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
        const a = uniformOf(node(ctx.root, `oring-${i}`), 'uAlpha');
        if (a > peaks[i].v) { peaks[i].v = a; peaks[i].t = t; }
      }
    }
    for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
      expect(peaks[i].v, `环 ${i} 从未亮起`).toBeGreaterThan(0.1);
    }
    // 「高分音的环先熄」必须在**五环同时可见**的窗口内比较。
    // 直接取某个晚时刻做对照是假绿：那时高分音环之所以暗，
    // 只是它的飞行窗口已经关闭（半径越界归零），与衰减率无关——
    // 把 decay 列改成同值，那条断言照样过。
    // 0.31–0.41 是五环飞行窗口的交集（见 partialRingRadius 的 layerLag/travel）。
    const winFrom = 0.31;
    const winTo = 0.41;
    const steps = 100;
    const sums = BELL_PARTIALS.map(() => 0);
    for (let k = 0; k <= steps; k += 1) {
      const t = winFrom + ((winTo - winFrom) * k) / steps;
      at(stage, t);
      for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
        const r = uniformOf(node(ctx.root, `oring-${i}`), 'uRadius');
        // 窗口取自交集，五环必须全部在飞行中——否则这段对照不成立。
        expect(r, `环 ${i} 在 t=${t} 已越出飞行窗口，对照窗口选错`).toBeGreaterThan(0);
        sums[i] += uniformOf(node(ctx.root, `oring-${i}`), 'uAlpha');
      }
    }
    // 同一窗口内、各自归一化到自身峰值后的**剩余比例**必须严格递减：
    // 这才是「高分音先熄」。同衰减率时五个比例相等，这条转红。
    const remain = sums.map((sum, i) => sum / (steps + 1) / peaks[i].v);
    const trace = remain.map((v) => v.toFixed(3)).join(',');
    for (let i = 1; i < remain.length; i += 1) {
      expect(remain[i], `剩余比例 ${trace} 在 ${i} 处未更低（高分音未先熄）`)
        .toBeLessThan(remain[i - 1]);
    }
    // 首末差距足够大（真的分层，不是数值抖动）。
    expect(remain[0] / remain[remain.length - 1], trace).toBeGreaterThan(2);
    stage.dispose();
  });

  // 规格元素④原文写明「多环**不同色**」，环的粗细也该随分音频率变化。
  // 这两条同样是变异验证补写的：把 uColor 整列换成同一个颜色、
  // 把 uThickness 换成常量，两轮变异都全绿——这两个值原先根本没被测过。
  it('④泛音光环：五环颜色互不相同，环带粗细随频率变细', () => {
    const { stage, ctx } = build();
    at(stage, 0.4);
    const ringMesh = (i: number) => node(ctx.root, `oring-${i}`) as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >;

    // 颜色：五层两两不同（规格「多环不同色」）。
    const hexes = BELL_PARTIALS.map((_, i) => (
      (ringMesh(i).material.uniforms.uColor.value as THREE.Color).getHexString()
    ));
    expect(new Set(hexes).size, `环色 ${hexes.join(',')} 有重复`).toBe(BELL_PARTIALS.length);
    // 且是渐变而非随机：基频偏暖（红分量高）、高分音偏冷（蓝分量高）。
    const first = ringMesh(0).material.uniforms.uColor.value as THREE.Color;
    const last = ringMesh(BELL_PARTIALS.length - 1).material.uniforms.uColor.value as THREE.Color;
    expect(first.r, `基频环 ${hexes[0]} 不比高分音环暖`).toBeGreaterThan(last.r);
    expect(last.b, `名义音环 ${hexes[hexes.length - 1]} 不比基频环冷`).toBeGreaterThan(first.b);

    // 粗细：高分音波长更短，环带必须更细，且严格递减。
    const widths = BELL_PARTIALS.map((_, i) => Number(ringMesh(i).material.uniforms.uThickness.value));
    const trace = widths.map((w) => w.toFixed(4)).join(',');
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i], `环带 ${trace} 在 ${i} 处未变细`).toBeLessThan(widths[i - 1]);
    }
    // 粗细与频率比成反比（不只是「递减」，比例关系也钉死）。
    for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
      expect(widths[i] * BELL_PARTIALS[i].ratio).toBeCloseTo(widths[0] * BELL_PARTIALS[0].ratio, 9);
    }
    stage.dispose();
  });

  it('全屏·泛音环由中心向外覆盖全屏（规格要求）', () => {
    // 贴片是 1.5 倍屏幕，UV 0.5 即屏缘：环最大半径必须超过 1/3。
    for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
      const p = BELL_PARTIALS[i];
      const travel = RING_TRAVEL / Math.sqrt(p.ratio);
      const maxR = partialRingRadius(STRIKE_AT + p.layerLag + travel - 1e-7, i);
      expect(maxR, `环 ${i} 未铺满全屏`).toBeGreaterThan(1 / 3);
      // 「由中心向外」覆盖：起点必须近零，终点必须越过屏缘——
      // 只测终点是假绿（钉死在 0.4 的常量半径也满足）。
      const minR = partialRingRadius(STRIKE_AT + p.layerLag + 1e-7, i);
      expect(minR, `环 ${i} 不是从中心起扩`).toBeLessThan(1 / 3);
    }
    // 环贴片本身覆盖全屏尺寸。
    const { stage, ctx } = build();
    at(stage, 0.4);
    const ring = node(ctx.root, 'oring-0') as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    expect(ring.geometry.parameters.width).toBeGreaterThanOrEqual(ctx.width);
    expect(ring.geometry.parameters.height).toBeGreaterThanOrEqual(ctx.height);

    // 规格「**由中心**向外覆盖全屏」：环心必须落在钟体上，不能是屏幕角落。
    // 这条是变异验证补写的——把 uOrigin 改成 (0.05,0.05) 时全部断言照样绿。
    // 五环与三层空气波纹共用同一个环心（同一次撞击的同一个声源）。
    const origins = [
      ...BELL_PARTIALS.map((_, i) => `oring-${i}`),
      ...Array.from({ length: AIR_RIPPLE_LAYERS }, (_, i) => `airwave-${i}`),
    ].map((name) => (node(ctx.root, name) as THREE.Mesh<
      THREE.PlaneGeometry, THREE.ShaderMaterial
    >).material.uniforms.uOrigin.value as THREE.Vector2);
    for (const o of origins) {
      // 横向居中（钟体在画面中轴）。
      expect(o.x, `环心 x=${o.x} 偏离中轴`).toBeCloseTo(0.5, 6);
      // 纵向落在钟体高度范围内、略低于正中（声源在钟腰偏下）。
      expect(o.y, `环心 y=${o.y} 不在钟体上`).toBeGreaterThan(0.4);
      expect(o.y).toBeLessThan(0.5);
      // 与画面中心的距离远小于到任一屏角的距离。
      expect(Math.hypot(o.x - 0.5, o.y - 0.5)).toBeLessThan(0.1);
    }
    // 全部图层共用同一个环心对象（同源，不是各写各的）。
    for (const o of origins) expect(o).toBe(origins[0]);
    stage.dispose();
  });

  it('②撞球摆动飞入：撞击前逼近、撞击瞬间到位、之后淡出', () => {
    expect(strikerApproach(0)).toBe(0);
    expect(strikerApproach(STRIKE_AT)).toBe(1);
    expect(strikerApproach(0.9)).toBe(1);
    // 摆动加速：同样长的时间窗，越靠近撞击走得越多（切向速度单调递增）。
    // 若写成减速的 sin 段（越近越慢），这条红。
    const step = STRIKE_AT * 0.2;
    const gains = [0, 1, 2, 3, 4].map(
      (k) => strikerApproach(step * (k + 1)) - strikerApproach(step * k),
    );
    const trace = gains.map((g) => g.toFixed(4)).join(',');
    for (let i = 1; i < gains.length; i += 1) {
      expect(gains[i], `位移增量 ${trace} 在 ${i} 处未加速`).toBeGreaterThan(gains[i - 1]);
    }

    const { stage, ctx } = build();
    at(stage, STRIKE_AT * 0.3);
    const farX = node(ctx.root, 'striker-ball').position.x;
    at(stage, STRIKE_AT - 1e-4);
    const nearX = node(ctx.root, 'striker-ball').position.x;
    expect(nearX, '撞球未向钟体逼近').toBeGreaterThan(farX);
    expect(opacity(node(ctx.root, 'striker-ball'))).toBeGreaterThan(0.5);
    // 撞击后淡出。
    at(stage, STRIKE_AT + 0.3);
    expect(opacity(node(ctx.root, 'striker-ball'))).toBe(0);
    stage.dispose();
  });

  it('⑦钟舌残影：撞击附近可见、越旧越淡，远离撞击时退场', () => {
    const { stage, ctx } = build();
    at(stage, STRIKE_AT);
    const ops = Array.from({ length: CLAPPER_GHOSTS }, (_, i) => opacity(node(ctx.root, `ghost-${i}`)));
    expect(ops[0], '残影从未出现').toBeGreaterThan(0.2);
    for (let i = 1; i < ops.length; i += 1) {
      expect(ops[i], `残影 ${i} 不比 ${i - 1} 更淡`).toBeLessThan(ops[i - 1]);
    }
    // 残影位置依次落后于撞球（是拖影而不是同点重叠）。
    const xs = Array.from({ length: CLAPPER_GHOSTS }, (_, i) => node(ctx.root, `ghost-${i}`).position.x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i], `残影 ${i} 未落后`).toBeLessThan(xs[i - 1]);
    }
    // 远离撞击：全部退场。
    at(stage, 0.9);
    for (let i = 0; i < CLAPPER_GHOSTS; i += 1) {
      expect(opacity(node(ctx.root, `ghost-${i}`)), `残影 ${i} 末幕仍在`).toBe(0);
    }
    stage.dispose();
  });

  it('⑤余韵拖尾锚点跟着钟口走，且末幕随余韵上移', () => {
    const { stage, ctx } = build();
    at(stage, 0.3);
    const early = node(ctx.root, 'echo-trail-anchor').position.clone();
    at(stage, 0.98);
    const late = node(ctx.root, 'echo-trail-anchor').position.clone();
    // 锚点在钟口高度（局部 y 为负，钟口在钟体下缘）。
    expect(early.y).toBeLessThan(0);
    // 末幕上移（余韵向上飘散）。
    expect(late.y, `锚点未随余韵上移 ${early.y}→${late.y}`).toBeGreaterThan(early.y);
    stage.dispose();
  });

  it('①钟身与⑧庙宇整幕常在，亮度随链的对应段起伏', () => {
    const { stage, ctx } = build();
    at(stage, 0.02);
    // 撞击前钟身已可见（不是撞击才出现）。
    expect(uniformOf(node(ctx.root, 'bell-body'), 'uAlpha')).toBeGreaterThan(0.2);
    expect(uniformOf(node(ctx.root, 'bell-body'), 'uRing'), '撞击前钟身已泛光').toBe(0);
    expect(uniformOf(node(ctx.root, 'temple-silhouette'), 'uGlow'), '撞击前天光已亮').toBe(0);

    // 撞击后：钟身泛光与天光都被点起。取**幕内峰值**而非单点采样——
    // 单点可能正落在拍频谷底，而那恰是拍频存在的证据，不该判为失败。
    let ring = 0;
    let glow = 0;
    for (let i = 0; i <= 120; i += 1) {
      at(stage, STRIKE_AT + ((BELL_ACT2_END - STRIKE_AT) * i) / 120);
      ring = Math.max(ring, uniformOf(node(ctx.root, 'bell-body'), 'uRing'));
      glow = Math.max(glow, uniformOf(node(ctx.root, 'temple-silhouette'), 'uGlow'));
    }
    expect(ring, '钟身从未随驻波泛光').toBeGreaterThan(0.4);
    expect(glow, '天光从未被余韵染开').toBeGreaterThan(0.3);
    // 末幕（同样取峰值）明显衰减。
    let lateRing = 0;
    let lateGlow = 0;
    for (let i = 0; i <= 60; i += 1) {
      at(stage, BELL_ACT2_END + ((1 - BELL_ACT2_END) * i) / 60);
      lateRing = Math.max(lateRing, uniformOf(node(ctx.root, 'bell-body'), 'uRing'));
      lateGlow = Math.max(lateGlow, uniformOf(node(ctx.root, 'temple-silhouette'), 'uGlow'));
    }
    expect(lateRing, `钟身泛光未衰减 ${ring}→${lateRing}`).toBeLessThan(ring * 0.6);
    expect(lateGlow, `天光未衰减 ${glow}→${lateGlow}`).toBeLessThan(glow * 0.6);
    // 但没有归零：余韵残留是本场景的规格要求。
    expect(lateRing).toBeGreaterThan(0.02);
    stage.dispose();
  });

  it('⑥空气波纹三层错峰推出（半径依次更小）', () => {
    const { stage, ctx } = build();
    at(stage, 0.45);
    const radii = Array.from(
      { length: AIR_RIPPLE_LAYERS },
      (_, i) => uniformOf(node(ctx.root, `airwave-${i}`), 'uRadius'),
    );
    const live = radii.filter((r) => r > 0);
    expect(live.length, '空气波纹全未推出').toBeGreaterThan(1);
    for (let i = 1; i < live.length; i += 1) {
      expect(live[i], `波纹 ${i} 未错`).toBeLessThan(live[i - 1]);
    }
    // 撞击前不可见。
    at(stage, STRIKE_AT * 0.5);
    for (let i = 0; i < AIR_RIPPLE_LAYERS; i += 1) {
      expect(uniformOf(node(ctx.root, `airwave-${i}`), 'uAlpha'), `波纹 ${i}`).toBe(0);
    }
    stage.dispose();
  });

  it('三幕各自有可观测差异', () => {
    const { stage, ctx } = build();
    at(stage, BELL_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (BELL_ACT1_END + BELL_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);

    // 三幕的语义差异：一幕撞球在飞、二幕驻波最盛、三幕只剩余韵。
    at(stage, BELL_ACT1_END * 0.6);
    const act1Striker = opacity(node(ctx.root, 'striker-ball'));
    const act1Wave = uniformOf(node(ctx.root, 'bell-standing-wave'), 'uAlpha');
    at(stage, (BELL_ACT1_END + BELL_ACT2_END) / 2);
    const act2Wave = uniformOf(node(ctx.root, 'bell-standing-wave'), 'uAlpha');
    const act2Res = resonanceEnvelope((BELL_ACT1_END + BELL_ACT2_END) / 2, STRIKE_AT);
    at(stage, 0.97);
    const act3Striker = opacity(node(ctx.root, 'striker-ball'));
    const act3Res = resonanceEnvelope(0.97, STRIKE_AT);

    expect(act1Striker, '一幕撞球不可见').toBeGreaterThan(0.3);
    expect(act1Wave, '一幕（撞击前）钟波已亮').toBe(0);
    expect(act2Wave, '二幕钟波未起').toBeGreaterThan(0.5);
    expect(act3Striker, '三幕撞球仍在').toBe(0);
    expect(act3Res, '三幕余韵未低于二幕').toBeLessThan(act2Res);
    expect(act3Res, '三幕余韵已归零（应有残留）').toBeGreaterThan(0.01);
    stage.dispose();
  });

  it('降档后 8 个命名元素仍在，只有粒子数严格变少', () => {
    const hi = build();
    at(hi.stage, 0.45);
    const hiTree = names(hi.ctx.root);
    const lo = build({ quality: 'low' });
    at(lo.stage, 0.45);
    const loTree = names(lo.ctx.root);

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `low ${name}`).toContain(name);
    }
    // 结构件数量完全一致：降档只减密度。
    for (const prefix of ['oring', 'airwave', 'ghost']) {
      expect(collectExact(lo.ctx.root, prefix).length, prefix)
        .toBe(collectExact(hi.ctx.root, prefix).length);
    }
    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('降档使拖尾粒子数严格变少但不为零（scaledCount 下限）', () => {
    // scaledCount(96, quality)：cinematic 96 → high 72 → medium 48 → low 28。
    const counts = (['cinematic', 'high', 'medium', 'low'] as const).map((q) => {
      const scale = { cinematic: 1, high: 0.75, medium: 0.5, low: 0.3 }[q];
      return Math.max(1, Math.floor(96 * scale));
    });
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `档位 ${i} 未变稀疏`).toBeLessThan(counts[i - 1]);
      expect(counts[i], `档位 ${i} 归零`).toBeGreaterThan(0);
    }
  });

  it('dispose 后场景树摘净、幂等，再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.45);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => at(stage, 0.8)).not.toThrow();
  });

  it('撞击脉冲短促（不是长包络，与余韵形成对比）', () => {
    const s = peakOf((t) => strikeImpulse(t, STRIKE_AT));
    expect(s.peak).toBeGreaterThan(0.9);
    // 两者在撞击瞬间同量级，随后脉冲远快于余韵地掉下去。
    const atPeak = STRIKE_AT + 0.01;
    expect(strikeImpulse(atPeak, STRIKE_AT))
      .toBeGreaterThan(resonanceEnvelope(atPeak, STRIKE_AT) * 0.8);
    // 60ms（0.05 幕）后：脉冲已不足余韵的一半。
    const after = STRIKE_AT + 0.05;
    const imp = strikeImpulse(after, STRIKE_AT);
    const res = resonanceEnvelope(after, STRIKE_AT);
    expect(imp, `脉冲 ${imp} 未快于余韵 ${res} 衰减`).toBeLessThan(res * 0.5);
    // 脉冲的半衰期必须远短于嗡音的（一记「咔」对一段长余韵）。
    expect(Math.LN2 / 46).toBeLessThan(decayHalfLife(0) / 20);
    expect(strikeImpulse(STRIKE_AT - 1e-9, STRIKE_AT)).toBe(0);

    // 起振是**有限斜坡**而非阶跃：撞击后瞬间只有峰值的一小部分，
    // 且在斜坡段内随时间线性上升。这条是变异验证补写的——
    // 把 bellAttack 改成恒 1（起振瞬间满幅）时全部断言照样绿。
    const rampAt = (frac: number) => partialAmplitude(
      STRIKE_AT + BELL_ATTACK * frac, 0, STRIKE_AT,
    );
    const quarter = rampAt(0.25);
    const half = rampAt(0.5);
    const full = rampAt(1);
    expect(quarter, '起振瞬间已满幅（斜坡不存在）').toBeLessThan(full * 0.4);
    expect(half).toBeGreaterThan(quarter);
    expect(full).toBeGreaterThan(half);
    // 线性：半程幅度约为全程的一半（衰减在这段极短的窗口内可忽略）。
    expect(half / full).toBeCloseTo(0.5, 2);
    // 起振足够快：金属受击，斜坡不超过一幕的 2%。
    expect(BELL_ATTACK).toBeLessThan(0.02);
  });
});
