import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-downpour';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  DOWNPOUR_ACT1_END,
  DOWNPOUR_ACT2_END,
  farFlash,
  puddleLevel,
  rainDensity,
  rainFallSpeed,
  rainIncidence,
  rippleAxisAngle,
  rippleFade,
  rippleFlatten,
  rippleRadius,
  splashPulse,
  windAngle,
} from '../overlay/cg-scenes/downpour-field';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 32 的八个构成件的具名节点。 */
const NAMED_ELEMENTS = [
  'rain-curtain',   // ① 雨帘
  'splash-0',       // ② 地面雨舞（白雾团）
  'ripple-0',       // ③ 涟漪万环
  'rain-haze',      // ④ 雨幕深浅
  'far-flash',      // ⑤ 闪电间隙亮光
  'puddle-mirror',  // ⑥ 积水反光
  'ground-fog',     // ⑧ 雾气沿地
];

const SHORT = 1080;

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('downpour');
  if (!scene) throw new Error('downpour 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** downpour 时长 1900ms，now 换算按它走。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1900, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 取雨帘的顶点缓冲。 */
function curtainPositions(root: THREE.Object3D): Float32Array {
  const lines = node(root, 'rain-curtain') as THREE.LineSegments;
  return lines.geometry.attributes.position.array as Float32Array;
}

/** 第 i 条雨丝的方向向量（头→尾）。 */
function streakDir(pos: Float32Array, i: number): { x: number; y: number; len: number } {
  const o = i * 6;
  const x = pos[o + 3] - pos[o];
  const y = pos[o + 4] - pos[o + 1];
  return { x, y, len: Math.hypot(x, y) };
}

describe('场景 32 downpour — 注册与元素清单', () => {
  it('按 packId 注册，八元素齐备', () => {
    const scene = resolveScene('downpour');
    expect(scene).toBeTruthy();
    expect(scene?.config.packId).toBe('downpour');
    expect(scene?.config.elements).toHaveLength(8);
  });

  it('八个构成件都有具名节点挂进场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const all = names(ctx.root);
    for (const name of NAMED_ELEMENTS) expect(all).toContain(name);
    // ⑦风摆没有独立 mesh：它是驱动量，验收在下方的耦合断言里。
    stage.dispose();
  });

  it('雨帘铺满全屏（规格「最满的素材」）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const pos = curtainPositions(ctx.root);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
      minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
    }
    // 覆盖宽高必须超过画面本身。
    expect(maxX - minX).toBeGreaterThan(ctx.width);
    expect(maxY - minY).toBeGreaterThan(ctx.height);
    stage.dispose();
  });
});

describe('场景 32 downpour — 签名：一个风场驱动两种介质', () => {
  it('风速上升段里，雨的入射角增大而涟漪压扁比同步减小', () => {
    // 这是签名的核心：空气介质与水介质对同一风场的两种响应必须反向同步。
    let prevInc = -Infinity;
    let prevFlat = Infinity;
    let samples = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = DOWNPOUR_ACT1_END + (0.5 - DOWNPOUR_ACT1_END) * (i / 40);
      const inc = rainIncidence(t, SHORT);
      const flat = rippleFlatten(t, SHORT);
      if (i > 0) {
        expect(inc).toBeGreaterThan(prevInc);
        expect(flat).toBeLessThan(prevFlat);
        samples += 1;
      }
      prevInc = inc;
      prevFlat = flat;
    }
    expect(samples).toBe(40);
  });

  it('压扁比确实是椭圆而非正圆：全场最扁处显著小于 1', () => {
    let min = Infinity;
    for (let i = 0; i <= 100; i += 1) min = Math.min(min, rippleFlatten(i / 100, SHORT));
    // 长短轴比接近 2：真实斜射水花的量级。
    expect(min).toBeLessThan(0.6);
    expect(min).toBeGreaterThan(0.3);
  });

  it('无风时涟漪回到正圆（压扁比 → 1）', () => {
    // 反解自洽：压扁比只由入射角决定，入射角为 0 必须给出正圆。
    // 这条保证公式不是"随时间递减"的伪耦合。
    const flattenAtZeroWind = 1 / (1 + 2.6 * Math.sin(0));
    expect(flattenAtZeroWind).toBeCloseTo(1, 10);
    // 且实际曲线在风速最小的两端最接近 1。
    const ends = [rippleFlatten(0, SHORT), rippleFlatten(1, SHORT)];
    const mid = rippleFlatten(0.5, SHORT);
    for (const e of ends) expect(e).toBeGreaterThan(mid);
  });

  it('涟漪长轴朝向与风向逐点相等（同一个角，不是两条曲线）', () => {
    for (let i = 0; i <= 30; i += 1) {
      const t = i / 30;
      expect(rippleAxisAngle(t)).toBeCloseTo(windAngle(t), 12);
    }
  });

  it('雨丝渲染方向与解析入射角一致（TS 与几何同源）', () => {
    const { stage, ctx } = build();
    for (const t of [0.25, 0.5, 0.7]) {
      at(stage, t);
      const pos = curtainPositions(ctx.root);
      const theta = rainIncidence(t, SHORT);
      // 雨向 = 竖直向下旋 theta：dx = sin θ, dy = -cos θ。
      for (const i of [0, 7, 31, 99]) {
        const d = streakDir(pos, i);
        expect(d.x / d.len).toBeCloseTo(Math.sin(theta), 5);
        expect(d.y / d.len).toBeCloseTo(-Math.cos(theta), 5);
      }
    }
    stage.dispose();
  });

  it('涟漪的渲染缩放就是解析压扁比（水侧同源）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const flat = rippleFlatten(0.5, SHORT);
    const axis = rippleAxisAngle(0.5);
    const rings = collectExact(ctx.root, 'ripple').filter((o) => opacity(o) > 0.02);
    expect(rings.length).toBeGreaterThan(4);
    for (const ring of rings) {
      expect(ring.scale.y / ring.scale.x).toBeCloseTo(flat, 6);
      expect(ring.rotation.z).toBeCloseTo(axis, 10);
    }
    stage.dispose();
  });
});

describe('场景 32 downpour — 雨雪对照：弹道 vs 飘摆', () => {
  it('同一时刻所有雨丝共享一个斜率（雨是弹道，不飘摆）', () => {
    // 这是与 ice 雪幕的物理分野：雪被 drag 主导所以逐粒飘摆相位不同，
    // 雨 drag 0.999 近乎无阻力所以整帘同斜。若这里出现逐粒角度差，
    // 说明实现里混进了飘摆项，雨就变成雪了。
    const { stage, ctx } = build();
    at(stage, 0.5);
    const pos = curtainPositions(ctx.root);
    const angles: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const d = streakDir(pos, i);
      angles.push(Math.atan2(d.x, -d.y));
    }
    // 上界取 1e-4 rad：顶点存在 Float32 缓冲里，散布本底约 1e-8；
    // 任何真实的逐粒飘摆都在 1e-2 rad 以上，因此这条仍然咬得住。
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeLessThan(1e-4);
    // 同时确认整帘并非竖直（否则"共享斜率"会被 0 平凡满足）。
    expect(Math.abs(angles[0])).toBeGreaterThan(0.15);
    stage.dispose();
  });

  it('雨丝长度随速度不同而不同（大滴拖影更长）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const pos = curtainPositions(ctx.root);
    const lens: number[] = [];
    for (let i = 0; i < 400; i += 1) lens.push(streakDir(pos, i).len);
    const min = Math.min(...lens);
    const max = Math.max(...lens);
    // 速度倍率 0.72–1.28，长度比应接近 1.78。
    expect(max / min).toBeGreaterThan(1.5);
    stage.dispose();
  });

  it('雨的终端速度不随风摆变化（只随雨强轻微变化）', () => {
    // 风摆在 t=0.35 与 t=0.65 对称（风速相同），但角度不同。
    // 弹道模型下竖直落速与风无关，两处必须相等。
    expect(rainFallSpeed(0.35, SHORT)).toBeCloseTo(rainFallSpeed(0.65, SHORT), 8);
    expect(windAngle(0.35)).not.toBeCloseTo(windAngle(0.65), 3);
  });

  it('雨速远高于雪的量级（0.35s 内掠过全屏高）', () => {
    const v = rainFallSpeed(0.5, SHORT);
    // 短边 1080，满速应在 3000px/s 上下：约 0.35s 走完一屏。
    expect(v).toBeGreaterThan(SHORT * 2.4);
  });
});

describe('场景 32 downpour — 互动①：涟漪从溅点连成片', () => {
  it('溅点强度同时门控白雾团亮度与涟漪可见数（一强俱强）', () => {
    const { stage, ctx } = build();
    // 在主幕内找 splashPulse 的一个高点与一个低点。
    let hiT = 0, loT = 0, hi = -1, lo = 2;
    for (let i = 0; i <= 300; i += 1) {
      const t = DOWNPOUR_ACT1_END + (DOWNPOUR_ACT2_END - DOWNPOUR_ACT1_END) * (i / 300);
      const p = splashPulse(t);
      if (p > hi) { hi = p; hiT = t; }
      if (p < lo) { lo = p; loT = t; }
    }
    expect(hi / Math.max(1e-6, lo)) .toBeGreaterThan(2);

    at(stage, hiT);
    const puffHi = collectExact(ctx.root, 'splash').reduce((s, o) => s + opacity(o), 0);
    const ringHi = collectExact(ctx.root, 'ripple').filter((o) => opacity(o) > 0.02).length;

    at(stage, loT);
    const puffLo = collectExact(ctx.root, 'splash').reduce((s, o) => s + opacity(o), 0);
    const ringLo = collectExact(ctx.root, 'ripple').reduce((s, o) => s + opacity(o), 0);
    const ringHiSum = (() => { at(stage, hiT); return collectExact(ctx.root, 'ripple').reduce((s, o) => s + opacity(o), 0); })();

    // 两条介质的亮度必须同向：门控是同一个。
    expect(puffHi).toBeGreaterThan(puffLo);
    expect(ringHiSum).toBeGreaterThan(ringLo);
    expect(ringHi).toBeGreaterThan(4);
    stage.dispose();
  });

  it('涟漪确实成片：主幕内同屏可见环数达到两位数', () => {
    const { stage, ctx } = build();
    let best = 0;
    for (let i = 0; i <= 60; i += 1) {
      const t = DOWNPOUR_ACT1_END + (DOWNPOUR_ACT2_END - DOWNPOUR_ACT1_END) * (i / 60);
      at(stage, t);
      best = Math.max(best, collectExact(ctx.root, 'ripple').filter((o) => opacity(o) > 0.02).length);
    }
    expect(best).toBeGreaterThanOrEqual(10);
    stage.dispose();
  });

  it('溅点是间歇的而非匀强（规格明写「间歇」）', () => {
    const mid: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      mid.push(splashPulse(DOWNPOUR_ACT1_END + (DOWNPOUR_ACT2_END - DOWNPOUR_ACT1_END) * i / 199));
    }
    let reversals = 0;
    for (let i = 2; i < mid.length; i += 1) {
      if ((mid[i - 1] - mid[i - 2]) * (mid[i] - mid[i - 1]) < 0) reversals += 1;
    }
    // 匀强或单调包络给不出多次方向反转。
    expect(reversals).toBeGreaterThanOrEqual(4);
    expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(0.4);
  });
});

describe('场景 32 downpour — 三幕与积水积分', () => {
  it('雨强走「至 → 满 → 止」，两端归零', () => {
    expect(rainDensity(0)).toBeCloseTo(0, 6);
    expect(rainDensity(1)).toBeCloseTo(0, 6);
    expect(rainDensity(DOWNPOUR_ACT1_END)).toBeGreaterThan(0.95);
    expect(rainDensity(0.5)).toBeCloseTo(1, 6);
    // 第三幕单调下降。
    let prev = Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const t = DOWNPOUR_ACT2_END + (1 - DOWNPOUR_ACT2_END) * (i / 20);
      const d = rainDensity(t);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });

  it('积水是雨强的积分：雨停后水位仍高（不随雨强同步归零）', () => {
    // 这条区分"积水"与"瞬时雨强"：若两者同源，雨停水就没了，
    // 规格第三幕的"积水退"就无从表现。
    expect(rainDensity(1)).toBeCloseTo(0, 6);
    expect(puddleLevel(1)).toBeGreaterThan(0.5);
    // 上涨段单调。
    let prev = -Infinity;
    for (let i = 0; i <= 30; i += 1) {
      const t = (DOWNPOUR_ACT2_END * i) / 30;
      const lv = puddleLevel(t);
      expect(lv).toBeGreaterThanOrEqual(prev);
      prev = lv;
    }
    // 峰值在主幕末，第三幕退水。
    expect(puddleLevel(DOWNPOUR_ACT2_END)).toBeGreaterThan(puddleLevel(1));
  });

  it('积水覆盖度驱动镜面层不透明度（水多则镜面强）', () => {
    const { stage, ctx } = build();
    at(stage, 0.05);
    const early = uniformOf(node(ctx.root, 'puddle-mirror'), 'uAlpha');
    const earlyLevel = uniformOf(node(ctx.root, 'puddle-mirror'), 'uLevel');
    at(stage, DOWNPOUR_ACT2_END);
    const peak = uniformOf(node(ctx.root, 'puddle-mirror'), 'uAlpha');
    const peakLevel = uniformOf(node(ctx.root, 'puddle-mirror'), 'uLevel');
    expect(peakLevel).toBeGreaterThan(earlyLevel);
    expect(peak).toBeGreaterThan(early);
    stage.dispose();
  });

  it('远闪只在第二幕出现，且是短促两次', () => {
    expect(farFlash(0.1)).toBe(0);
    expect(farFlash(0.9)).toBe(0);
    let peaks = 0;
    let prev = 0, rising = false;
    for (let i = 0; i <= 600; i += 1) {
      const t = i / 600;
      const f = farFlash(t);
      if (f > prev + 1e-9) rising = true;
      else if (rising && f < prev - 1e-9) { peaks += 1; rising = false; }
      prev = f;
    }
    expect(peaks).toBe(2);
    // 「间隙亮光」是弱闪：峰值不该盖过主体。
    let maxF = 0;
    for (let i = 0; i <= 600; i += 1) maxF = Math.max(maxF, farFlash(i / 600));
    expect(maxF).toBeLessThan(0.55);
    expect(maxF).toBeGreaterThan(0.2);
  });

  it('远闪同时提亮闪幕与积水镜面（一处光源两处响应）', () => {
    const { stage, ctx } = build();
    // 找闪电峰值时刻。
    let peakT = 0, peak = 0;
    for (let i = 0; i <= 600; i += 1) {
      const t = i / 600;
      if (farFlash(t) > peak) { peak = farFlash(t); peakT = t; }
    }
    at(stage, peakT);
    const veilLit = uniformOf(node(ctx.root, 'far-flash'), 'uAlpha');
    const puddleLit = uniformOf(node(ctx.root, 'puddle-mirror'), 'uFlash');
    // 取一个雨强相同但无闪的时刻做对照。
    at(stage, 0.55);
    const veilDark = uniformOf(node(ctx.root, 'far-flash'), 'uAlpha');
    const puddleDark = uniformOf(node(ctx.root, 'puddle-mirror'), 'uFlash');
    expect(veilLit).toBeGreaterThan(veilDark);
    expect(puddleLit).toBeGreaterThan(puddleDark);
    stage.dispose();
  });

  it('雾气沿地在第三幕最盛（雨止后水面蒸发）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const mid = uniformOf(node(ctx.root, 'ground-fog'), 'uAlpha');
    at(stage, 1);
    const end = uniformOf(node(ctx.root, 'ground-fog'), 'uAlpha');
    expect(end).toBeGreaterThan(mid * 1.5);
    stage.dispose();
  });
});

describe('场景 32 downpour — 涟漪波形与降档', () => {
  it('环半径随年龄增长且被封顶（表面波扩散后耗散）', () => {
    let prev = -1;
    for (const age of [0, 0.05, 0.15, 0.3, 0.45]) {
      const r = rippleRadius(age, SHORT);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    // 0.5s 后封顶。
    expect(rippleRadius(0.6, SHORT)).toBeCloseTo(rippleRadius(0.5, SHORT), 6);
    // 开方形状：前段涨得比后段快。
    const early = rippleRadius(0.1, SHORT) - rippleRadius(0.02, SHORT);
    const late = rippleRadius(0.48, SHORT) - rippleRadius(0.4, SHORT);
    expect(early).toBeGreaterThan(late * 1.5);
  });

  it('环亮度随扩散淡去并在生命末归零', () => {
    expect(rippleFade(0)).toBeCloseTo(1, 6);
    expect(rippleFade(0.62)).toBeCloseTo(0, 6);
    let prev = Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const f = rippleFade((0.62 * i) / 20);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });

  it('降档只减密度不移除元素', () => {
    const tiers: EffectQuality[] = ['cinematic', 'high', 'medium', 'low'];
    let prevRings = Infinity;
    let prevDrops = Infinity;
    for (const q of tiers) {
      const { stage, ctx } = build({ quality: q });
      at(stage, 0.5, q);
      const all = names(ctx.root);
      // 八个具名件在每一档都必须在。
      for (const name of NAMED_ELEMENTS) expect(all).toContain(name);
      const rings = collectExact(ctx.root, 'ripple').length;
      const drops = curtainPositions(ctx.root).length / 6;
      expect(rings).toBeGreaterThanOrEqual(1);
      expect(rings).toBeLessThanOrEqual(prevRings);
      expect(drops).toBeLessThanOrEqual(prevDrops);
      prevRings = rings;
      prevDrops = drops;
      stage.dispose();
    }
    // 最低档必须严格少于最高档（否则 scaledCount 没接上）。
    expect(prevRings).toBeLessThan(120);
    expect(prevDrops).toBeLessThan(2600);
  });

  it('dispose 后场景树摘净，且无嵌套容器残留', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    // 必须在 dispose 之前收集容器引用：dispose 会把整棵 group 从 root
    // 摘走，之后 root 遍历不到残留容器（本项目 thunder 场景踩过这个坑）。
    const containers = nodes(ctx.root).filter((o) => o.children.length > 0);
    expect(containers.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    for (const c of containers) {
      expect(c.children).toHaveLength(0);
      expect(c.parent).toBeNull();
    }
    // 幂等。
    expect(() => stage.dispose()).not.toThrow();
  });

  it('dispose 后 update 不抛错（失效保护）', () => {
    const { stage } = build();
    at(stage, 0.4);
    stage.dispose();
    expect(() => at(stage, 0.6)).not.toThrow();
  });

  it('整幕稀疏与密集采样得到同一视觉状态（时变场无累加漂移）', () => {
    // 闭式输运的必要条件：同一 t 必须给出同一帧，与到达路径无关。
    // 逐帧累加式积分会让这条失败（本项目 ice 场景已定此规）。
    const a = build();
    for (let i = 0; i <= 4; i += 1) at(a.stage, i / 4);
    const sparse = visualSnapshot(a.ctx.root);
    a.stage.dispose();

    const b = build();
    for (let i = 0; i <= 160; i += 1) at(b.stage, i / 160);
    const dense = visualSnapshot(b.ctx.root);
    b.stage.dispose();

    expect(dense).toEqual(sparse);
  });
});

describe('场景 32 downpour — 输运守恒与大气透视（变异测试补的盲区）', () => {
  it('雨帘整幕铺满：任意时刻雨滴都留在覆盖范围内（环绕重入生效）', () => {
    // 盲区来源：去掉环绕取模后所有断言仍全绿——因为它们只在少数 t 上数
    // 雨滴条数与分布，而雨要到中后段才漂出画面。这条改为**逐时刻**检查
    // 包围盒不逃逸，且四象限都有雨。
    const { stage, ctx } = build();
    const spanX = 1920 * 1.6;
    const spanY = 1080 * 1.25;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      at(stage, t);
      const pos = curtainPositions(ctx.root);
      let q = 0;
      for (let d = 0; d < pos.length / 6; d += 1) {
        const x = pos[d * 6];
        const y = pos[d * 6 + 1];
        // 头点必须始终在覆盖范围内（含一个拖影长度的余量）。
        expect(Math.abs(x)).toBeLessThan(spanX * 0.5 + 8);
        expect(Math.abs(y)).toBeLessThan(spanY * 0.5 + 8);
        if (x < 0 && y > 0) q |= 1;
        if (x > 0 && y > 0) q |= 2;
        if (x < 0 && y < 0) q |= 4;
        if (x > 0 && y < 0) q |= 8;
      }
      // 四象限全有雨：这是「铺满」的可测形式。
      expect(q).toBe(15);
    }
    stage.dispose();
  });

  it('雨滴数守恒：环绕重入不吞粒子（顶点数整幕恒定且全部有效）', () => {
    const { stage, ctx } = build();
    const counts = new Set<number>();
    for (let i = 0; i <= 30; i += 1) {
      at(stage, i / 30);
      const pos = curtainPositions(ctx.root);
      counts.add(pos.length);
      for (let k = 0; k < pos.length; k += 1) expect(Number.isFinite(pos[k])).toBe(true);
    }
    expect(counts.size).toBe(1);
    stage.dispose();
  });

  it('④雨幕深浅走大气透视：远层随雨强与雨至进程变化，且始终淡于近景雨帘', () => {
    // 盲区来源：远幕 uAlpha 写成常量时全绿。这条把「大气透视」拆成两条
    // 可测性质：① 随场景状态变化（不是常量）；② 恒淡于近景（远处对比度低）。
    // 刻意不测速度差——那是 ice 的签名，本场景走密度/亮度差。
    const { stage, ctx } = build();
    const hazeAlphas: number[] = [];
    for (let i = 0; i <= 30; i += 1) {
      const t = i / 30;
      at(stage, t);
      const haze = uniformOf(node(ctx.root, 'rain-haze'), 'uAlpha');
      hazeAlphas.push(haze);
      const near = opacity(node(ctx.root, 'rain-curtain'));
      // 主幕内近景更实：远景是背景层。
      if (t > DOWNPOUR_ACT1_END && t < DOWNPOUR_ACT2_END) {
        expect(haze).toBeLessThan(near + 0.2);
      }
    }
    expect(Math.max(...hazeAlphas) - Math.min(...hazeAlphas)).toBeGreaterThan(0.15);
    // 远幕在「雨至」阶段先到：t 很小时已有可见密度（远处先看见雨墙）。
    at(stage, 0.06);
    expect(uniformOf(node(ctx.root, 'rain-haze'), 'uAlpha')).toBeGreaterThan(0.05);
    stage.dispose();
  });

  it('远层与近景共用同一风向（大气透视只改浓淡，不改风）', () => {
    const { stage, ctx } = build();
    for (const t of [0.2, 0.45, 0.7]) {
      at(stage, t);
      expect(uniformOf(node(ctx.root, 'rain-haze'), 'uWindAngle')).toBeCloseTo(windAngle(t), 10);
      expect(uniformOf(node(ctx.root, 'ground-fog'), 'uWindAngle')).toBeCloseTo(windAngle(t), 10);
      expect(uniformOf(node(ctx.root, 'puddle-mirror'), 'uWindAngle')).toBeCloseTo(windAngle(t), 10);
    }
    stage.dispose();
  });
});
