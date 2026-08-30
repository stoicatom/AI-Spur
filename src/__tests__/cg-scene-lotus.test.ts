import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-lotus';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  LAYER_OPEN_SPAN,
  LOTUS_ACT1_END,
  LOTUS_ACT2_END,
  LOTUS_LAYER_COUNT,
  PETAL_ANGLE_CLOSED,
  PETAL_ANGLE_OPEN,
  bloomOpenness,
  layerDelay,
  layerOpen,
  petalOpenAngle,
  petalReleaseAt,
  rippleFadeFromOpen,
  rippleRadiusFromOpen,
} from '../overlay/cg-scenes/lotus-bloom';
import {
  DEW_COUNT,
  FIREFLY_COUNT,
  dewLandAt,
  dewRingRadius,
  dewRollProgress,
  fireflyOrbit,
} from '../overlay/cg-scenes/lotus-ambience';
import { makeSceneCtx, names, node, nodes } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 29 的 8 个元素的具名节点（花瓣刚体在漂散层，露珠本体是 quarks）。 */
const NAMED_ELEMENTS = [
  'seatpetal-0-0',  // ① 莲座（层-序）
  'driftpetal-0',   // ② 花瓣刚体
  'bloomring-0',     // ③ 水面涟漪
  'lotus-glow',      // ④ 莲光
  'dew-anchor',      // ⑤ 露珠（发射锚点）
  'lilypad-0',       // ⑥ 荷叶浮影
  'firefly-0',       // ⑦ 萤火
  'under-caustic',   // ⑧ 水下光斑
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('lotus');
  if (!scene) throw new Error('lotus 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** lotus 时长 1200ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象。 */
function collectExact(root: THREE.Object3D, re: RegExp): THREE.Object3D[] {
  return nodes(root).filter((o) => re.test(o.name));
}

type RingMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

describe('场景 29 lotus（莲开）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('lotus');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('层叠绽放');
    expect(scene!.config.preset).toBe('petal');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    const built = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(built, `缺少元素节点 ${name}`).toContain(name);
    }
    stage.dispose();
  });

  it('四层莲座、四环涟漪、八环露珠、十四点萤火都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    expect(collectExact(ctx.root, /^bloomring-\d+$/)).toHaveLength(LOTUS_LAYER_COUNT);
    expect(collectExact(ctx.root, /^dewring-\d+$/)).toHaveLength(DEW_COUNT);
    expect(collectExact(ctx.root, /^firefly-\d+$/)).toHaveLength(FIREFLY_COUNT);
    // 莲座四层各有瓣，层号 0..3 全部在场。
    for (let layer = 0; layer < LOTUS_LAYER_COUNT; layer += 1) {
      const inLayer = collectExact(ctx.root, new RegExp(`^seatpetal-${layer}-\\d+$`));
      expect(inLayer.length, `第 ${layer} 层无花瓣`).toBeGreaterThan(0);
    }
    stage.dispose();
  });

  it('水面四层不重复建（parts 委托 water，同名节点只有一份）', () => {
    // parts 与 water 曾各建一份 under-caustic / lilypad-N，按名查找会撞上两个。
    const { stage, ctx } = build();
    at(stage, 0.6);
    expect(collectExact(ctx.root, /^under-caustic$/)).toHaveLength(1);
    expect(collectExact(ctx.root, /^lilypad-0$/)).toHaveLength(1);
    stage.dispose();
  });

  // ── 签名：层叠绽放（滞后是层序的函数） ──────────────────────────

  it('签名·层序滞后：layerDelay 严格单增，内层先开外层后开', () => {
    for (let l = 0; l < LOTUS_LAYER_COUNT - 1; l += 1) {
      expect(layerDelay(l), `层 ${l} 未早于层 ${l + 1}`).toBeLessThan(layerDelay(l + 1));
    }
    // 滞后量本身要够大：全部挤在一帧内就读不出层叠。
    const span = layerDelay(LOTUS_LAYER_COUNT - 1) - layerDelay(0);
    expect(span).toBeGreaterThan(0.1);
  });

  it('签名·非齐开：存在四层同时在开且四相各异的时刻', () => {
    // 「层叠」与 star/fireworks 的「齐开」之分全在此处。把 LAYER_STAGGER
    // 归零后四层永远同相，这条断言是唯一的守门人。
    // 注意判据不能写成「任意时刻两两不等」——绽放早期外层还没起步，
    // 进度同为 0 本就该相等，那样写等于把正确实现判成错的。
    const t = layerDelay(LOTUS_LAYER_COUNT - 1) + LAYER_OPEN_SPAN * 0.1;
    const opens = Array.from({ length: LOTUS_LAYER_COUNT }, (_, l) => layerOpen(t, l));
    // 四层都严格在「开了但没开满」之间：同时在开。
    for (let l = 0; l < LOTUS_LAYER_COUNT; l += 1) {
      expect(opens[l], `层 ${l} 未在开放中`).toBeGreaterThan(0);
      expect(opens[l], `层 ${l} 已开满`).toBeLessThan(1);
    }
    // 且四个相位互不相同。
    expect(new Set(opens.map((v) => v.toFixed(9))).size).toBe(LOTUS_LAYER_COUNT);
  });

  it('签名·层序单调：任意时刻内层进度不低于外层', () => {
    for (const t of [0.1, 0.26, 0.3, 0.45, 0.5, 0.66, 0.9]) {
      const opens = Array.from({ length: LOTUS_LAYER_COUNT }, (_, l) => layerOpen(t, l));
      for (let l = 0; l < LOTUS_LAYER_COUNT - 1; l += 1) {
        expect(opens[l], `t=${t} 层 ${l} 落后于层 ${l + 1}`)
          .toBeGreaterThanOrEqual(opens[l + 1]);
      }
    }
  });

  it('签名·未到时不开：各层在自己的延迟前进度恒为零', () => {
    for (let l = 0; l < LOTUS_LAYER_COUNT; l += 1) {
      expect(layerOpen(layerDelay(l) - 1e-6, l), `层 ${l} 提前开了`).toBe(0);
      expect(layerOpen(0, l)).toBe(0);
    }
  });

  it('签名·开满即满：经过一个 LAYER_OPEN_SPAN 后各层为 1 且不越界', () => {
    for (let l = 0; l < LOTUS_LAYER_COUNT; l += 1) {
      expect(layerOpen(layerDelay(l) + LAYER_OPEN_SPAN, l)).toBeCloseTo(1, 10);
      // 超时不回落也不超过 1。
      expect(layerOpen(layerDelay(l) + LAYER_OPEN_SPAN * 3, l)).toBeCloseTo(1, 10);
    }
  });

  it('签名·外层在第二幕内开完（绽放不溢出到漂散幕）', () => {
    const outerDone = layerDelay(LOTUS_LAYER_COUNT - 1) + LAYER_OPEN_SPAN;
    expect(outerDone).toBeLessThanOrEqual(LOTUS_ACT2_END + 1e-9);
  });

  it('签名·反向传导：petalReleaseAt 严格单减，外层先漂散', () => {
    // 由内到外开、由外到内散——两个方向相反才是「莲开」而非「花谢」。
    for (let l = 0; l < LOTUS_LAYER_COUNT - 1; l += 1) {
      expect(petalReleaseAt(l), `层 ${l} 未晚于层 ${l + 1}`)
        .toBeGreaterThan(petalReleaseAt(l + 1));
    }
    // 最早的漂散不早于绽放幕结束。
    expect(Math.min(...Array.from({ length: LOTUS_LAYER_COUNT }, (_, l) => petalReleaseAt(l))))
      .toBeGreaterThanOrEqual(LOTUS_ACT2_END);
  });

  // ── 互动①：涟漪由开启进度门控（因果，不是并发） ──────────────────

  it('互动①·因果本体：未开的层半径与亮度恒为零', () => {
    expect(rippleRadiusFromOpen(0, 600)).toBe(0);
    expect(rippleFadeFromOpen(0)).toBe(0);
    // 开了就必须有环：否则「门控」退化成「永远关」。
    expect(rippleRadiusFromOpen(1, 600)).toBeGreaterThan(0);
    expect(rippleFadeFromOpen(0.5)).toBeGreaterThan(0);
  });

  it('互动①·半径随开启单增，且以 √open 形状扩散', () => {
    let prev = -1;
    for (let k = 0; k <= 10; k += 1) {
      const r = rippleRadiusFromOpen(k / 10, 600);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    // √ 形：前半程扩得比后半程快（线性实现会让两段相等）。
    const first = rippleRadiusFromOpen(0.5, 600) - rippleRadiusFromOpen(0, 600);
    const second = rippleRadiusFromOpen(1, 600) - rippleRadiusFromOpen(0.5, 600);
    expect(first).toBeGreaterThan(second * 1.2);
  });

  it('互动①·场景层落实：第一幕四环全部不可见且缩放归零', () => {
    // 只清 opacity 会留下上一帧的 scale，场景状态就取决于「怎么走到这一帧」。
    const { stage, ctx } = build();
    at(stage, LOTUS_ACT1_END * 0.5);
    const rings = collectExact(ctx.root, /^bloomring-\d+$/) as RingMesh[];
    expect(rings).toHaveLength(LOTUS_LAYER_COUNT);
    for (const ring of rings) {
      expect(ring.material.opacity, `${ring.name} 花苞未开却有亮度`).toBe(0);
      expect(ring.scale.x, `${ring.name} 残留缩放`).toBe(0);
    }
    stage.dispose();
  });

  it('互动①·层序传导到水面：绽放中内环严格大于外环', () => {
    const { stage, ctx } = build();
    at(stage, layerDelay(LOTUS_LAYER_COUNT - 1) + LAYER_OPEN_SPAN * 0.1);
    const rings = collectExact(ctx.root, /^bloomring-\d+$/) as RingMesh[];
    const byLayer = [...rings].sort((a, b) => a.name.localeCompare(b.name));
    for (let l = 0; l < byLayer.length - 1; l += 1) {
      expect(byLayer[l].scale.x, `${byLayer[l].name} 未领先于 ${byLayer[l + 1].name}`)
        .toBeGreaterThan(byLayer[l + 1].scale.x);
    }
    stage.dispose();
  });

  it('签名·花瓣几何承载层序：内层花瓣压得比外层平（外倾更大）', () => {
    // 层序断言若只测涟漪环，把莲座花瓣的 layerOpen(t, layer) 改成
    // layerOpen(t, 0)（四层齐张）照样全绿——而花瓣几何才是签名最主要的
    // 可见载体。判据取纵向缩放而非径向位移：位移里混着各层不同的
    // `length`（外层花瓣更长），外层能靠长度反超，量不出外倾。
    const { stage, ctx } = build();
    const t = layerDelay(LOTUS_LAYER_COUNT - 1) + LAYER_OPEN_SPAN * 0.1;
    at(stage, t);
    const flat: number[] = [];
    for (let l = 0; l < LOTUS_LAYER_COUNT; l += 1) {
      flat.push(node(ctx.root, `seatpetal-${l}-0`).scale.y);
    }
    // 外倾越大 → cos 越小 → 纵向缩放越小。内层必须比外层更平。
    for (let l = 0; l < LOTUS_LAYER_COUNT - 1; l += 1) {
      expect(flat[l], `层 ${l} 的瓣未比层 ${l + 1} 张得开`).toBeLessThan(flat[l + 1]);
    }
    stage.dispose();
  });

  it('签名·花瓣张角读的正是该层的 petalOpenAngle（不是另调一套）', () => {
    const { stage, ctx } = build();
    const t = layerDelay(1) + LAYER_OPEN_SPAN * 0.5;
    at(stage, t);
    for (let l = 0; l < LOTUS_LAYER_COUNT; l += 1) {
      const petal = node(ctx.root, `seatpetal-${l}-0`);
      // 纵向缩放 = 0.42 + cos(angle) * 0.58，可反解出该层张角。
      const rise = (petal.scale.y - 0.42) / 0.58;
      const expected = Math.cos(petalOpenAngle(layerOpen(t, l)));
      expect(rise, `seatpetal-${l}-0 张角与签名脱钩`).toBeCloseTo(expected, 6);
    }
    stage.dispose();
  });

  it('互动①·环半径读的正是签名函数（不是另调一套参数）', () => {
    const { stage, ctx } = build();
    const t = layerDelay(1) + LAYER_OPEN_SPAN * 0.6;
    at(stage, t);
    const short = Math.min(1920, 1080);
    for (let l = 0; l < LOTUS_LAYER_COUNT; l += 1) {
      const ring = node(ctx.root, `bloomring-${l}`) as RingMesh;
      const expected = rippleRadiusFromOpen(layerOpen(t, l), short);
      expect(ring.scale.x, `bloomring-${l} 半径与签名脱钩`).toBeCloseTo(expected, 6);
    }
    stage.dispose();
  });

  // ── 三幕结构 ────────────────────────────────────────────────────

  it('三幕切分点符合规格（300ms / 800ms 于 1200ms）', () => {
    expect(LOTUS_ACT1_END).toBeCloseTo(300 / 1200, 10);
    expect(LOTUS_ACT2_END).toBeCloseTo(800 / 1200, 10);
  });

  it('整朵花开度：起手为零、绽放幕内单增、幕末接近全开', () => {
    expect(bloomOpenness(0)).toBe(0);
    let prev = -1;
    for (let k = 0; k <= 12; k += 1) {
      const t = LOTUS_ACT1_END + (LOTUS_ACT2_END - LOTUS_ACT1_END) * (k / 12);
      const v = bloomOpenness(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(bloomOpenness(LOTUS_ACT2_END)).toBeGreaterThan(0.95);
  });

  it('开度取均值而非最大值（内层开满时整朵花还没读满）', () => {
    // 取 max 会让最内层一开满就显示 1，外层还没动。
    const t = layerDelay(0) + LAYER_OPEN_SPAN;
    expect(layerOpen(t, 0)).toBeCloseTo(1, 10);
    expect(bloomOpenness(t)).toBeLessThan(0.9);
  });

  it('花瓣张角两端锚定在规格角度', () => {
    expect(petalOpenAngle(0)).toBeCloseTo(PETAL_ANGLE_CLOSED, 10);
    expect(petalOpenAngle(1)).toBeCloseTo(PETAL_ANGLE_OPEN, 10);
    // 中间单增且不越界。
    expect(petalOpenAngle(0.5)).toBeGreaterThan(PETAL_ANGLE_CLOSED);
    expect(petalOpenAngle(0.5)).toBeLessThan(PETAL_ANGLE_OPEN);
  });

  // ── 环境层：露珠与萤火 ──────────────────────────────────────────

  it('露珠落水时刻互不相同（八颗不齐落）', () => {
    const lands = Array.from({ length: DEW_COUNT }, (_, i) => dewLandAt(i));
    expect(new Set(lands.map((v) => v.toFixed(9))).size).toBe(DEW_COUNT);
    for (const v of lands) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('露珠环在落水前无半径、落水后张开', () => {
    const short = 1080;
    for (let i = 0; i < DEW_COUNT; i += 1) {
      const land = dewLandAt(i);
      expect(dewRingRadius(Math.max(0, land - 0.01), i, short), `露珠 ${i} 提前起环`).toBe(0);
      expect(dewRingRadius(Math.min(1, land + 0.02), i, short)).toBeGreaterThan(0);
    }
  });

  it('露珠滚动进度在落水前推进、落水后不再增长', () => {
    for (let i = 0; i < DEW_COUNT; i += 1) {
      const land = dewLandAt(i);
      const before = dewRollProgress(land * 0.5, i);
      const atLand = dewRollProgress(land, i);
      expect(atLand).toBeGreaterThanOrEqual(before);
      expect(dewRollProgress(Math.min(1, land + 0.1), i)).toBeCloseTo(atLand, 6);
    }
  });

  it('萤火各自成轨：同一时刻十四点位置互不重合', () => {
    const short = 1080;
    const seen = new Set<string>();
    for (let i = 0; i < FIREFLY_COUNT; i += 1) {
      const { x, y } = fireflyOrbit(0.5, i, short);
      seen.add(`${x.toFixed(4)},${y.toFixed(4)}`);
    }
    expect(seen.size).toBe(FIREFLY_COUNT);
  });

  it('萤火整场都在动（不是静止的贴图点）', () => {
    const short = 1080;
    const a = fireflyOrbit(0.2, 3, short);
    const b = fireflyOrbit(0.7, 3, short);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
  });

  // ── 稀疏 update 无关性 ──────────────────────────────────────────

  it('稀疏与密集 update 在同一 t 得到同一帧（闭式求值）', () => {
    const t = 0.58;
    const sparse = build();
    at(sparse.stage, t);
    const sparseScales = collectExact(sparse.ctx.root, /^bloomring-\d+$/)
      .map((r) => (r as RingMesh).scale.x);
    sparse.stage.dispose();

    const dense = build();
    for (let k = 1; k <= 58; k += 1) at(dense.stage, k / 100);
    const denseScales = collectExact(dense.ctx.root, /^bloomring-\d+$/)
      .map((r) => (r as RingMesh).scale.x);
    dense.stage.dispose();

    expect(denseScales).toHaveLength(sparseScales.length);
    for (let i = 0; i < sparseScales.length; i += 1) {
      expect(denseScales[i]).toBeCloseTo(sparseScales[i], 6);
    }
  });

  // ── 降档与释放 ──────────────────────────────────────────────────

  it('降档只减粒子密度，八个元素与四层结构一个不少', () => {
    for (const quality of ['cinematic', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.6, quality);
      const built = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(built, `${quality} 档缺少 ${name}`).toContain(name);
      }
      // 层数是签名载体，任何档位都必须是四层。
      expect(collectExact(ctx.root, /^bloomring-\d+$/)).toHaveLength(LOTUS_LAYER_COUNT);
      expect(collectExact(ctx.root, /^dewring-\d+$/)).toHaveLength(DEW_COUNT);
      expect(collectExact(ctx.root, /^firefly-\d+$/)).toHaveLength(FIREFLY_COUNT);
      stage.dispose();
    }
  });

  it('dispose 摘净场景树且嵌套容器不残留子节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    // 必须在 dispose 之前收集容器引用：dispose 会把整个 group 从 root
    // 摘走，之后遍历 root 找不到残留容器。只断言 root.children 归零，
    // 把递归清子树退化成 group.clear() 照样全绿——而莲座（四层花瓣）、
    // 漂散层、水面层都是嵌套容器，正是泄漏最重的形态。
    const containers: THREE.Object3D[] = [];
    ctx.root.traverse((o) => { if (o.children.length > 0) containers.push(o); });
    expect(containers.length).toBeGreaterThan(2);

    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    for (const c of containers) {
      if (c === ctx.root) continue;
      expect(c.children, `${c.name || c.type} 残留子节点`).toHaveLength(0);
    }
  });

  it('dispose 后 update 静默失效', () => {
    const { stage } = build();
    at(stage, 0.4);
    stage.dispose();
    expect(() => at(stage, 0.9)).not.toThrow();
    stage.dispose();
  });
});
