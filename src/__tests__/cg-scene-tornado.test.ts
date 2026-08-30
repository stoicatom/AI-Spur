import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-tornado';
import { resolveScene } from '../overlay/cg-scene-registry';
import { funnelSpin } from '../overlay/cg-scenes/cg-tornado';
import {
  TORNADO_ACT1_END,
  TORNADO_ACT2_END,
  dissipationFlare,
  funnelMaturity,
  funnelRadius,
  inflowRate,
  rainWhiten,
  swirlOmega,
  updraftRate,
} from '../overlay/cg-scenes/tornado-funnel';
import { makeSceneCtx, names, node, nodes, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 31 的 9 个构成件的具名节点（卷入物由 quarks 承载）。 */
const NAMED_ELEMENTS = [
  'tornado-funnel',  // ① 漏斗 + ⑨ 消散畸变（同层 uFlare）
  'intake-anchor',   // ② 卷入物（发射锚点）
  'sand-sheet',      // ③ 地面沙幕
  'ring-0',          // ④ 根环
  'cloud-cap',       // ⑤ 顶部云盖
  'junk-0',          // ⑥ 碎物
  'wind-eye',        // ⑦ 风眼光柱
  'rainline-0',      // ⑧ 雨旋
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('tornado');
  if (!scene) throw new Error('tornado 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** tornado 时长 1800ms，now 换算按它走。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1800, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 碎物到轴的**水平**距离（龙卷的半径是水平的，不含高度）。 */
function axialDistance(o: THREE.Object3D): number {
  return Math.hypot(o.position.x, o.position.z);
}

describe('场景 31 tornado（龙卷）', () => {
  it('注册项声明规格的 9 个元素与独立签名', () => {
    const scene = resolveScene('tornado');
    expect(scene).not.toBeNull();
    // 本场景规格给的是 9 个构成件（全库唯一超过 8 个的）。
    expect(scene!.config.elements).toHaveLength(9);
    expect(scene!.config.signature).toContain('垂直气柱');
    expect(scene!.config.signature).toContain('吸入');
    expect(scene!.config.preset).toBe('tornado');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'ring')).toHaveLength(3);
    expect(collectExact(ctx.root, 'rainline')).toHaveLength(14);
    expect(collectExact(ctx.root, 'junk').length).toBeGreaterThan(10);
    stage.dispose();
  });

  // 签名前半「垂直气柱」：半径随高度变化，且轮廓内凹（上宽下窄）。
  it('签名·漏斗半径随高度单调增大（上宽下窄的垂直气柱）', () => {
    const short = 1080;
    const radii = [0, 0.2, 0.4, 0.6, 0.8, 1].map((h) => funnelRadius(h, short, 1));
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i], `高度段 ${i}`).toBeGreaterThan(radii[i - 1]);
    }
    // 上下差距显著（真的是漏斗而非圆柱）。
    expect(radii[radii.length - 1] / radii[0]).toBeGreaterThan(4);
  });

  it('签名·漏斗轮廓内凹（低处比线性更细）', () => {
    const short = 1080;
    const base = funnelRadius(0, short, 1);
    const top = funnelRadius(1, short, 1);
    // 半高处若是线性应为 (base+top)/2，内凹则显著小于它。
    const mid = funnelRadius(0.5, short, 1);
    const linear = (base + top) / 2;
    expect(mid, `半高 ${mid.toFixed(1)} vs 线性 ${linear.toFixed(1)}`).toBeLessThan(linear);
  });

  // 签名后半「吸入」：径向速率必须指向轴心（负值），
  // 这是与纯涡旋（只有切向速度）的分界。
  it('签名·径向速率恒为向心（吸入，不是纯涡旋）', () => {
    for (const r of [0.15, 0.3, 0.45, 0.7, 1.0, 1.5]) {
      expect(inflowRate(r), `r=${r}`).toBeLessThan(0);
    }
    // 核边界（0.45）附近入流最强——真实龙卷的入流在此达峰。
    const atCore = Math.abs(inflowRate(0.45));
    expect(atCore).toBeGreaterThan(Math.abs(inflowRate(0.15)));
    expect(atCore).toBeGreaterThan(Math.abs(inflowRate(1.2)));
  });

  it('签名·角速度是 Rankine 剖面（核内恒定、核外按 1/r² 衰减）', () => {
    // 核内恒定。
    expect(swirlOmega(0.1)).toBeCloseTo(swirlOmega(0.4), 9);
    // 核外递减。
    const outer = [0.5, 0.7, 1.0, 1.5].map(swirlOmega);
    for (let i = 1; i < outer.length; i += 1) {
      expect(outer[i], `段 ${i}`).toBeLessThan(outer[i - 1]);
    }
    // 量纲：近轴角速度必须是「每秒几弧度」量级，不是几十
    // （本项目 wind 场景曾写成 screenShort*0.075 ≈ 81 rad/s = 每秒 13 圈）。
    expect(swirlOmega(0)).toBeGreaterThan(1);
    expect(swirlOmega(0)).toBeLessThan(20);
  });

  it('签名·上升气流集中在管壁内侧（不是全域均匀）', () => {
    const atWall = updraftRate(0.35);
    expect(atWall).toBeCloseTo(1, 3);
    // 远处几乎没有上升气流。
    expect(updraftRate(1.6)).toBeLessThan(0.1);
    // 轴心处也弱于管壁（龙卷中心是下沉气流区）。
    expect(updraftRate(0)).toBeLessThan(atWall);
  });

  it('签名·成形度三段（长成、维持、解体）', () => {
    expect(funnelMaturity(0)).toBe(0);
    // 第一幕单调长成。
    const forming = [0.05, 0.1, 0.15, 0.2, TORNADO_ACT1_END - 1e-6].map(funnelMaturity);
    for (let i = 1; i < forming.length; i += 1) {
      expect(forming[i], `成形段 ${i}`).toBeGreaterThan(forming[i - 1]);
    }
    // 第二幕维持满值。
    expect(funnelMaturity((TORNADO_ACT1_END + TORNADO_ACT2_END) / 2)).toBe(1);
    // 第三幕解体。
    const dying = [TORNADO_ACT2_END + 0.05, 0.85, 0.95, 1].map(funnelMaturity);
    for (let i = 1; i < dying.length; i += 1) {
      expect(dying[i], `解体段 ${i}`).toBeLessThan(dying[i - 1]);
    }
    expect(funnelMaturity(1)).toBeCloseTo(0, 6);
  });

  // 规格元素⑨「消散畸变」：结构在垮而边缘在炸开——两件事同时发生。
  it('签名·消散畸变与结构解体同时发生（不是简单淡出）', () => {
    // 第三幕之前没有外翻。
    expect(dissipationFlare(0.5)).toBe(0);
    expect(dissipationFlare(TORNADO_ACT2_END - 0.01)).toBe(0);

    // 第三幕：外翻单峰，且此间成形度在下降。
    const ts: number[] = [];
    for (let i = 1; i < 10; i += 1) ts.push(TORNADO_ACT2_END + (i / 10) * (1 - TORNADO_ACT2_END));
    const flares = ts.map(dissipationFlare);
    const maturities = ts.map(funnelMaturity);
    expect(Math.max(...flares)).toBeGreaterThan(0.9);
    // 成形度在同一区间单调降——「垮」与「炸开」并存。
    for (let i = 1; i < maturities.length; i += 1) {
      expect(maturities[i], `成形段 ${i}`).toBeLessThan(maturities[i - 1]);
    }
  });

  // 与 wind 的对照：wind 的旋风涡轴在平面内横扫，
  // tornado 的气柱扎在原地贯通天地。
  it('对照 wind·气柱轴心不横移（垂直贯通，不横扫的一团涡）', () => {
    const { stage, ctx } = build();
    const xs: number[] = [];
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      at(stage, t);
      xs.push(node(ctx.root, 'tornado-funnel').position.x);
    }
    for (const x of xs) expect(x).toBe(xs[0]);
    stage.dispose();
  });

  it('全屏：漏斗纵贯全屏高度', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    const funnel = node(ctx.root, 'tornado-funnel') as THREE.Mesh;
    const geo = funnel.geometry as THREE.PlaneGeometry;
    // 贴片高度接近屏高。
    expect(geo.parameters.height).toBeGreaterThan(ctx.height * 0.85);
    stage.dispose();
  });

  it('累计转角单调递增，且用闭式积分（成形期不重复累计）', () => {
    const spins = [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1].map(funnelSpin);
    for (let i = 1; i < spins.length; i += 1) {
      expect(spins[i], `段 ${i}`).toBeGreaterThan(spins[i - 1]);
    }
    expect(funnelSpin(0)).toBe(0);
    // 整幕累计转角量纲合理：几圈到十几圈，不是上百圈。
    const turns = spins[spins.length - 1] / (Math.PI * 2);
    expect(turns, `整幕 ${turns.toFixed(2)} 圈`).toBeGreaterThan(1);
    expect(turns, `整幕 ${turns.toFixed(2)} 圈`).toBeLessThan(20);
  });

  it('运行期漏斗 uniform 跟着成形度与外翻走', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const early = uniformOf(node(ctx.root, 'tornado-funnel'), 'uMaturity');
    at(stage, 0.6);
    const mid = uniformOf(node(ctx.root, 'tornado-funnel'), 'uMaturity');
    const midFlare = uniformOf(node(ctx.root, 'tornado-funnel'), 'uFlare');
    at(stage, 0.85);
    const lateFlare = uniformOf(node(ctx.root, 'tornado-funnel'), 'uFlare');

    expect(mid).toBeGreaterThan(early);
    expect(midFlare).toBe(0);
    expect(lateFlare).toBeGreaterThan(0.3);
    stage.dispose();
  });

  // 互动① 碎物：规格要的是「沿螺旋上升后**被甩出**」——所以轨迹分两段，
  // 先吸入（r 减小）、进上升区后被离心力甩出（r 增大）。
  // 采样窗口必须落在**吸入段之内**（实测拐点在 t≈0.30），跨过拐点会
  // 把甩出段一起量进来，吸入就测不出来了。
  it('互动·碎物先被吸向轴心（吸入段内水平半径缩小）', () => {
    const { stage, ctx } = build();
    at(stage, 0.13);
    const junks = collectExact(ctx.root, 'junk');
    const startR = junks.map(axialDistance);

    at(stage, 0.29);
    const pulledR = junks.map(axialDistance);

    let pulled = 0;
    for (let i = 0; i < junks.length; i += 1) {
      if (pulledR[i] < startR[i]) pulled += 1;
    }
    expect(pulled, `被吸近 ${pulled}/${junks.length}`).toBeGreaterThan(junks.length * 0.5);
    stage.dispose();
  });

  it('互动·碎物「先吸入后甩出」的完整时序（半径先减后增）', () => {
    const { stage, ctx } = build();
    const junks = collectExact(ctx.root, 'junk');

    at(stage, 0.13);
    const r0 = junks.map(axialDistance);
    at(stage, 0.29);
    const r1 = junks.map(axialDistance);
    at(stage, 0.8);
    const r2 = junks.map(axialDistance);

    // 逐颗检查「先减后增」这个双段形态。
    let arc = 0;
    for (let i = 0; i < junks.length; i += 1) {
      if (r1[i] < r0[i] && r2[i] > r1[i]) arc += 1;
    }
    expect(arc, `先吸后甩 ${arc}/${junks.length}`).toBeGreaterThan(junks.length * 0.5);

    // 甩出幅度必须显著（不是数值抖动）。
    let flung = 0;
    for (let i = 0; i < junks.length; i += 1) {
      if (r2[i] > r1[i] + 50) flung += 1;
    }
    expect(flung, `显著甩出 ${flung}/${junks.length}`).toBeGreaterThan(junks.length * 0.5);
    stage.dispose();
  });

  it('互动·碎物被上升气流抬起（高度上升）', () => {
    const { stage, ctx } = build();
    at(stage, 0.15);
    const junks = collectExact(ctx.root, 'junk');
    const startY = junks.map((o) => o.position.y);

    at(stage, 0.6);
    const midY = junks.map((o) => o.position.y);

    let lifted = 0;
    for (let i = 0; i < junks.length; i += 1) {
      if (midY[i] > startY[i] + 5) lifted += 1;
    }
    expect(lifted, `被抬起 ${lifted}/${junks.length}`).toBeGreaterThan(junks.length * 0.4);
    stage.dispose();
  });

  it('互动·碎物真的在绕轴转（方位角推进）', () => {
    const { stage, ctx } = build();
    const angles: number[][] = [];
    for (const t of [0.3, 0.4, 0.5]) {
      at(stage, t);
      angles.push(collectExact(ctx.root, 'junk').map(
        (o) => Math.atan2(o.position.z, o.position.x),
      ));
    }
    // 至少多数碎物的方位角在变（在绕转）。
    let turning = 0;
    for (let i = 0; i < angles[0].length; i += 1) {
      const moved = Math.abs(angles[1][i] - angles[0][i]) > 0.05
        || Math.abs(angles[2][i] - angles[1][i]) > 0.05;
      if (moved) turning += 1;
    }
    expect(turning, `绕转 ${turning}/${angles[0].length}`).toBeGreaterThan(angles[0].length * 0.5);
    stage.dispose();
  });

  // 互动② 雨旋变白：判据是几何（是否进入漏斗），不是定时器。
  it('互动·雨滴变白由「是否进入漏斗」决定（几何而非定时）', () => {
    const short = 1080;
    // 漏斗成形（maturity=1）时，半高处漏斗半径。
    const edge = funnelRadius(0.5, short, 1);
    // 深入内部：接近全白。
    expect(rainWhiten(edge * 0.1, 0.5, short, 1)).toBeGreaterThan(0.8);
    // 恰在边界：刚开始变。
    expect(rainWhiten(edge * 0.99, 0.5, short, 1)).toBeLessThan(0.05);
    // 在外面：不变白。
    expect(rainWhiten(edge * 1.5, 0.5, short, 1)).toBe(0);
    // 漏斗未成形（maturity 小）时，同一位置仍在外面。
    expect(rainWhiten(edge * 0.5, 0.5, short, 0.1)).toBe(0);
  });

  it('互动·运行期雨旋被吸向轴心且进入后拉长', () => {
    const { stage, ctx } = build();
    // 取一条初始靠外的雨。
    at(stage, 0.1);
    const early = node(ctx.root, 'rainline-1').position.x;
    const earlyScale = node(ctx.root, 'rainline-1').scale.y;
    at(stage, 0.7);
    const late = node(ctx.root, 'rainline-1').position.x;
    const lateScale = node(ctx.root, 'rainline-1').scale.y;

    // 被吸近轴心（|x| 变小）。
    expect(Math.abs(late), `早 ${early.toFixed(1)} / 晚 ${late.toFixed(1)}`)
      .toBeLessThan(Math.abs(early));
    // 至少有一条在某时刻被拉长过（进入漏斗）。
    let stretched = false;
    for (let i = 0; i < 14; i += 1) {
      for (const t of [0.4, 0.55, 0.7]) {
        at(stage, t);
        if (node(ctx.root, `rainline-${i}`).scale.y > 1.2) stretched = true;
      }
    }
    expect(stretched, '没有雨旋被拉长（未进入漏斗？）').toBe(true);
    void earlyScale; void lateScale;
    stage.dispose();
  });

  it('地面沙幕与根环随成形度扩张', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const earlyReach = uniformOf(node(ctx.root, 'sand-sheet'), 'uReach');
    const earlyRing = node(ctx.root, 'ring-0').scale.x;
    at(stage, 0.6);
    const midReach = uniformOf(node(ctx.root, 'sand-sheet'), 'uReach');
    const midRing = node(ctx.root, 'ring-0').scale.x;
    expect(midReach).toBeGreaterThan(earlyReach);
    expect(midRing).toBeGreaterThan(earlyRing);
    stage.dispose();
  });

  it('根环贴地压扁（不是空中光圈）', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    for (let i = 0; i < 3; i += 1) {
      const ring = node(ctx.root, `ring-${i}`);
      expect(ring.scale.y, `ring-${i}`).toBeLessThan(ring.scale.x * 0.5);
    }
    stage.dispose();
  });

  it('风眼光柱随成形度收细', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    const early = uniformOf(node(ctx.root, 'wind-eye'), 'uMaturity');
    at(stage, 0.6);
    const mid = uniformOf(node(ctx.root, 'wind-eye'), 'uMaturity');
    expect(mid).toBeGreaterThan(early);
    stage.dispose();
  });

  it('稀疏 update 与密集 update 的碎物终态一致（时间轴驱动）', () => {
    const sparse = build();
    const dense = build();
    // 稀疏：8 次跨约 100ms（本场景 1800ms）。
    for (let i = 0; i <= 8; i += 1) at(sparse.stage, (i / 8) * 0.6);
    // 密集：逐步推进到同一时刻。
    for (let i = 0; i <= 108; i += 1) at(dense.stage, (i / 108) * 0.6);

    const a = collectExact(sparse.ctx.root, 'junk').map(axialDistance);
    const b = collectExact(dense.ctx.root, 'junk').map(axialDistance);
    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i], `碎物 ${i}: 稀疏 ${a[i].toFixed(2)} / 密集 ${b[i].toFixed(2)}`)
        .toBeCloseTo(b[i], 3);
    }
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, TORNADO_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (TORNADO_ACT1_END + TORNADO_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档只减碎物与粒子密度，命名结构件一个不少', () => {
    const hi = build();
    at(hi.stage, 0.6);
    const hiTree = names(hi.ctx.root);
    const hiJunk = collectExact(hi.ctx.root, 'junk').length;

    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.6);
    const loTree = names(lo.ctx.root);
    const loJunk = collectExact(lo.ctx.root, 'junk').length;

    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `medium ${name}`).toContain(name);
    }
    expect(loJunk).toBeLessThan(hiJunk);
    expect(loJunk).toBeGreaterThan(0);
    // 根环与雨旋是结构件，数量不随档位变。
    expect(collectExact(lo.ctx.root, 'ring')).toHaveLength(collectExact(hi.ctx.root, 'ring').length);
    expect(collectExact(lo.ctx.root, 'rainline'))
      .toHaveLength(collectExact(hi.ctx.root, 'rainline').length);

    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树与嵌套容器都摘净，再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.6);
    // dispose 前持有嵌套容器引用——dispose 会把整个 group 从 root 摘走，
    // 只查 ctx.root.children 测不出容器内部的残留。
    const junkField = node(ctx.root, 'junk-field');
    expect(junkField.children.length).toBeGreaterThan(0);

    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(junkField.children, '刚体容器未清空').toHaveLength(0);
    expect(junkField.parent, '刚体容器未脱离父级').toBeNull();
    expect(() => at(stage, 0.9)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
  });
});
