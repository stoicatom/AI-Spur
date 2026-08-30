import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-shield';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  ARC_HALF_ANGLE,
  IMPACT_AT,
  IMPACT_OFFSET,
  SHIELD_ACT1_END,
  SHIELD_ACT2_END,
  SHIELD_FACE_ANGLE,
  STRIKE_ANGLE,
  arcNormal,
  deflectSpread,
  deflect,
  deflectedFraction,
  normalLoad,
  strikeIncident,
  strikeDeflected,
  toScreen,
  angleOf,
} from '../overlay/cg-scenes/shield-deflect';
import {
  backlightLevel,
  barrierStrength,
  impactFlash,
  shieldAfterglow,
  strikeApproach,
  WAVE_COUNT,
  WAVE_STAGGER,
  waveFade,
  waveRadius,
} from '../overlay/cg-scenes/shield-timeline';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 25 的 8 个元素的具名节点（火花由 quarks 承载，观测锚点）。 */
const NAMED_ELEMENTS = [
  'shield-body',           // ① 盾 mesh
  'strike-phantom',        // ② 来击虚影
  'wavearc-0',             // ③ 盾面冲击波
  'sparkanchor-0',         // ④ 火花盾缘（发射锚点）
  'crack-flash',           // ⑤ 盾面战损闪
  'barrier-ring',          // ⑥ 格挡环
  'dustgrain-0',           // ⑦ 地面震尘
  'backlight-silhouette',  // ⑧ 背光剪影
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('shield');
  if (!scene) throw new Error('shield 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** shield 时长 1200ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 两个二维向量的点积。 */
function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

describe('场景 25 shield（盾御冲击）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('shield');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.elements).toEqual([
      '盾 mesh', '来击虚影', '盾面冲击波', '火花盾缘',
      '盾面战损闪', '格挡环', '地面震尘', '背光剪影',
    ]);
    expect(scene!.config.signature).toContain('格挡反弹');
    expect(scene!.config.preset).toBe('impact');
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

  it('三道弧波、三十粒震尘都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'wavearc')).toHaveLength(3);
    expect(collectExact(ctx.root, 'dustgrain')).toHaveLength(30);
    stage.dispose();
  });
});

describe('场景 25 shield · 签名：格挡反弹（动能沿弧面转向）', () => {
  // ── 后果一：出射角随撞击点转过 2×弧法线角 ─────────────────────────
  it('镜面反射律：出射角 = 2×法线角 − 入射角（逐点验证几何恒等式）', () => {
    const inc = strikeIncident();
    const incAngle = Math.atan2(inc.y, inc.x);
    for (const s of [-0.9, -0.42, 0, 0.35, 0.88]) {
      const out = deflect(inc, s);
      // 法线角来自实现自己的 arcNormal，不另写一份公式。
      const n = Math.atan2(arcNormal(s).y, arcNormal(s).x);
      // r = d − 2(d·n)n 的角度形式：出射角 = 2n − 入射角 − π。
      // 那个 −π 不是凑的：入射向量指向盾面内侧而出射指向外侧，
      // 两者互为反向的一支。少了它，断言会因 atan2 归一化在部分
      // 撞击点上恰好吸收掉 π 而假绿（s=0.35 通过、s=−0.9 暴露）。
      const expected = 2 * n - incAngle - Math.PI;
      const got = Math.atan2(out.y, out.x);
      // 角度差归一到 (−π, π] 再比，避免 ±2π 的假失败。
      const diff = Math.atan2(Math.sin(got - expected), Math.cos(got - expected));
      expect(Math.abs(diff), `s=${s} 处偏离镜面反射律`).toBeLessThan(1e-9);
    }
  });

  it('法线随撞击点转（法线钉死就等于把弧盾退化成平板）', () => {
    const angles = [-0.8, -0.3, 0, 0.4, 0.9]
      .map((s) => Math.atan2(arcNormal(s).y, arcNormal(s).x));
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i], '法线角必须随 s 严格递增').toBeGreaterThan(angles[i - 1]);
    }
    // 盾心法线沿 +x（正对来击）。
    expect(Math.abs(angles[2])).toBeLessThan(1e-12);
  });

  it('转向量与撞击点成 1.44 斜率的线性关系（盾缘偏斜更大）', () => {
    // 斜率 = d(转向)/ds = 2 · ARC_HALF_ANGLE。
    const slope = 2 * ARC_HALF_ANGLE;
    expect(slope).toBeCloseTo(1.44, 10);
    for (const s of [-0.7, -0.2, 0.25, 0.8]) {
      const h = 1e-4;
      const numeric = (deflectSpread(s + h) - deflectSpread(s - h)) / (2 * h);
      expect(numeric, `s=${s} 处斜率不符`).toBeCloseTo(slope, 6);
    }
  });

  it('转向量真值与实际出射方向严格自洽（deflectSpread 不是摆设）', () => {
    // deflectSpread 度量的是「相对该点正撞基准转过多少」。它与 deflect
    // 的关系是恒等式：出射相对「直接倒回」的偏离 = spread − 2·入射偏角。
    // 两者脱钩时上面的斜率断言就只在验证一个与渲染无关的公式，
    // 所以这里把它们钉死在一起。
    const inc = strikeIncident();
    const incAngle = Math.atan2(inc.y, inc.x);
    // 入射相对盾心法线（+x）的偏角。
    const offset = Math.atan2(Math.sin(incAngle - Math.PI), Math.cos(incAngle - Math.PI));
    expect(offset).toBeCloseTo(STRIKE_ANGLE - Math.PI, 12);
    for (const s of [-0.75, -0.25, 0, 0.3, 0.85]) {
      const out = deflect(inc, s);
      const raw = Math.atan2(out.y, out.x) - incAngle - Math.PI;
      const turn = Math.atan2(Math.sin(raw), Math.cos(raw));
      expect(turn, `s=${s} 处真值与出射脱钩`).toBeCloseTo(deflectSpread(s) - 2 * offset, 9);
    }
  });

  it('盾心正撞不转向，盾缘两侧转向反号（转向由撞击点定符号）', () => {
    expect(Math.abs(deflectSpread(0))).toBeLessThan(1e-12);
    expect(deflectSpread(0.6)).toBeGreaterThan(0.5);
    expect(deflectSpread(-0.6)).toBeLessThan(-0.5);
    // 两侧对称：同幅度偏心给出等量反向的转向。
    expect(deflectSpread(0.6) + deflectSpread(-0.6)).toBeCloseTo(0, 12);
  });

  // ── 后果二：反射保长（动能不进入盾，只转向） ───────────────────────
  it('反射保长：出射速率与入射速率严格相等（动能不被吸收）', () => {
    const inc = strikeIncident();
    const len = Math.hypot(inc.x, inc.y);
    for (const s of [-1, -0.5, 0, 0.5, 1]) {
      const out = deflect(inc, s);
      expect(Math.hypot(out.x, out.y), `s=${s} 处不保长`).toBeCloseTo(len, 12);
    }
  });

  it('实际落点处出射确实朝回（与入射反向），签名在本场景成立', () => {
    // 注意：这条断言锁的是本场景真正使用的落点，而不是整条盾缘。
    // ARC_HALF_ANGLE=0.72 下 s ≲ −0.83 的极端边缘会转过 90° 以上，
    // 那是弧面几何的正常结果，本场景不取那些点。
    const inc = strikeIncident();
    const out = deflect(inc, IMPACT_OFFSET);
    expect(dot(inc, out)).toBeLessThan(-0.9 * Math.hypot(inc.x, inc.y) ** 2 * 0.9);
  });

  it('strikeDeflected 就是本场景撞击点处的出射方向（场景专用量与通用签名一致）', () => {
    // strikeDeflected() 是场景在 IMPACT_OFFSET 处的出射向量；若它与
    // deflect(strikeIncident(), IMPACT_OFFSET) 脱钩，场景画的弧波方向
    // 就可能不是签名真正算出来的那个方向。
    const expected = deflect(strikeIncident(), IMPACT_OFFSET);
    const got = strikeDeflected();
    expect(got.x).toBeCloseTo(expected.x, 12);
    expect(got.y).toBeCloseTo(expected.y, 12);
  });

  it('toScreen 是保长旋转，默认朝向即 SHIELD_FACE_ANGLE（场景与签名共用同一变换）', () => {
    const v = { x: 1, y: 0 };
    const withDefault = toScreen(v);
    const withExplicit = toScreen(v, SHIELD_FACE_ANGLE);
    expect(withDefault.x).toBeCloseTo(withExplicit.x, 12);
    expect(withDefault.y).toBeCloseTo(withExplicit.y, 12);
    // 旋转保长：不会顺带把撞击/弹开方向的强度也改了。
    expect(Math.hypot(withDefault.x, withDefault.y)).toBeCloseTo(1, 12);
    // 转角正好是 faceAngle 本身。
    expect(Math.atan2(withDefault.y, withDefault.x)).toBeCloseTo(SHIELD_FACE_ANGLE, 10);
  });

  // ── 后果三：切向整份保留、法向那一份才震地面 ───────────────────────
  it('法向载荷与弹开占比互补，且合计为一（能量账不重不漏）', () => {
    const inc = strikeIncident();
    for (const s of [-0.8, -0.3, 0, 0.45, 0.9]) {
      const load = normalLoad(inc, s);
      const away = deflectedFraction(inc, s);
      expect(load + away, `s=${s} 处两份不合一`).toBeCloseTo(1, 10);
      expect(load).toBeGreaterThanOrEqual(0);
      expect(away).toBeGreaterThanOrEqual(0);
    }
  });

  it('法向载荷在「法线与入射共线」处吃满，峰位可解析预测', () => {
    // 满载点不在盾心：来击带 0.22 rad 偏角，满载落在 s* = 0.22/H。
    // 这条断言比「盾心最大」强——它锁死了载荷确实由几何决定，
    // 而不是随手写的一个以 0 为中心的钟形。
    const inc = strikeIncident();
    const predicted = (STRIKE_ANGLE - Math.PI) / ARC_HALF_ANGLE;
    let bestS = -2;
    let best = -1;
    for (let i = -1000; i <= 1000; i += 1) {
      const s = i / 1000;
      const v = normalLoad(inc, s);
      if (v > best) { best = v; bestS = s; }
    }
    expect(bestS, '满载点偏离解析预测').toBeCloseTo(predicted, 2);
    expect(best).toBeCloseTo(1, 5);
  });

  it('载荷自峰位向两侧单调下降，盾缘明显更小（擦过就几乎不震）', () => {
    const inc = strikeIncident();
    const peak = (STRIKE_ANGLE - Math.PI) / ARC_HALF_ANGLE;
    // 峰右侧递减。
    let prev = Infinity;
    for (let s = peak; s <= 1.0001; s += 0.1) {
      const v = normalLoad(inc, s);
      expect(v, `s=${s.toFixed(2)} 右侧未递减`).toBeLessThan(prev);
      prev = v;
    }
    // 峰左侧递减。
    prev = Infinity;
    for (let s = peak; s >= -1.0001; s -= 0.1) {
      const v = normalLoad(inc, s);
      expect(v, `s=${s.toFixed(2)} 左侧未递减`).toBeLessThan(prev);
      prev = v;
    }
    // 两端与峰值的落差要显著，否则震尘读不出撞击点差异。
    expect(normalLoad(inc, peak) - normalLoad(inc, -1)).toBeGreaterThan(0.6);
    expect(normalLoad(inc, peak) - normalLoad(inc, 1)).toBeGreaterThan(0.2);
  });
});

describe('场景 25 shield · 互动与三幕', () => {
  it('三幕切分点符合规格（200ms / 700ms 于 1200ms）', () => {
    expect(SHIELD_ACT1_END).toBeCloseTo(200 / 1200, 10);
    expect(SHIELD_ACT2_END).toBeCloseTo(700 / 1200, 10);
    // 撞击发生在第一幕末：来击飞入 → 命中 → 格挡。
    expect(IMPACT_AT).toBeCloseTo(SHIELD_ACT1_END, 12);
  });

  it('来击虚影加速扑向盾，命中后钳在 1（挡住而非穿透）', () => {
    // strikeApproach 是行进相位：0 = 屏外，1 = 触盾。
    const phases = [0.02, 0.08, 0.14].map(strikeApproach);
    for (let i = 1; i < phases.length; i += 1) {
      expect(phases[i], '命中前相位应持续推进').toBeGreaterThan(phases[i - 1]);
    }
    // 命中时正好抵达盾面。
    expect(strikeApproach(IMPACT_AT)).toBeCloseTo(1, 6);
    // 命中后钳住：不会越过 1 穿过去。
    for (const t of [IMPACT_AT + 0.05, 0.5, 0.99]) {
      expect(strikeApproach(t), `t=${t} 相位越界`).toBeCloseTo(1, 6);
    }
  });

  it('来击是加速而非匀速（k² 型，高速来击的特征）', () => {
    // 匀速会让等距采样的增量相等；加速让后段增量更大。
    const d1 = strikeApproach(0.05) - strikeApproach(0.0);
    const d2 = strikeApproach(0.10) - strikeApproach(0.05);
    const d3 = strikeApproach(0.15) - strikeApproach(0.10);
    expect(d2).toBeGreaterThan(d1 * 1.5);
    expect(d3).toBeGreaterThan(d2 * 1.2);
  });

  // ── 互动①：火花与裂纹同帧（共用 impactFlash 门控） ─────────────────
  it('互动①：火花与裂纹读同一个门控，同帧是数学必然', () => {
    // 命中前静默，命中瞬间为 1，之后快衰。
    expect(impactFlash(IMPACT_AT * 0.5)).toBeCloseTo(0, 6);
    expect(impactFlash(IMPACT_AT)).toBeGreaterThan(0.9);
    const decay = [0.02, 0.08, 0.2].map((d) => impactFlash(IMPACT_AT + d));
    for (let i = 1; i < decay.length; i += 1) {
      expect(decay[i], '门控必须单调衰减').toBeLessThan(decay[i - 1]);
    }
  });

  it('冲击波匀速外扩、亮度随半径衰减（速度不衰减、亮度才衰减）', () => {
    const reach = 900;
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      // 每道波有自己的发出时刻，采样窗口必须从它自己出生后起——
      // 用统一窗口会把「尚未发出」的 0 当成「已衰减到 0」而假失败。
      const born = IMPACT_AT + i * WAVE_STAGGER;
      const radii = [0.02, 0.12, 0.24].map((d) => waveRadius(born + d, i, reach));
      for (let k = 1; k < radii.length; k += 1) {
        expect(radii[k], `第 ${i} 道波未单调外扩`).toBeGreaterThan(radii[k - 1]);
      }
      const fades = [0.02, 0.12, 0.24].map((d) => waveFade(born + d, i, reach));
      for (let k = 1; k < fades.length; k += 1) {
        expect(fades[k], `第 ${i} 道波未随半径变暗`).toBeLessThan(fades[k - 1]);
      }
      // 发出前必须是零（错时才有意义）。
      if (i > 0) expect(waveFade(born - 0.01, i, reach)).toBe(0);
    }
  });

  it('多道波错时发出：同一帧三道半径互不相同', () => {
    const reach = 900;
    const rs: number[] = [];
    for (let i = 0; i < WAVE_COUNT; i += 1) rs.push(waveRadius(IMPACT_AT + 0.3, i, reach));
    expect(new Set(rs.map((r) => r.toFixed(4))).size).toBe(WAVE_COUNT);
  });

  it('格挡环与撞击闪刻意不同源（否则"余辉"没有载体）', () => {
    // 闪是瞬时战损，环是持续屏障：第二幕中段两者必须分道。
    const mid = SHIELD_ACT1_END + (SHIELD_ACT2_END - SHIELD_ACT1_END) * 0.6;
    expect(impactFlash(mid)).toBeLessThan(0.1);
    expect(barrierStrength(mid), '格挡环应仍维持薄壳').toBeGreaterThan(0.2);
  });

  it('互动②：闪光与余辉反相交接（闪光退了余辉才显）', () => {
    const flashPeak = impactFlash(IMPACT_AT + 0.01);
    const flashLate = impactFlash(0.95);
    const glowEarly = shieldAfterglow(IMPACT_AT + 0.01);
    const glowLate = shieldAfterglow(0.8);
    expect(flashPeak).toBeGreaterThan(0.7);
    expect(flashLate).toBeLessThan(0.1);
    // 余辉在闪光峰时还没起来，随后接管。
    expect(glowEarly).toBeLessThan(flashPeak * 0.5);
    expect(glowLate).toBeGreaterThan(glowEarly);
  });

  it('互动②：闪光是单帧量级的脉冲，不是长亮（战损闪的特征）', () => {
    // 峰后很快掉下来：闪光的半衰要显著短于余辉。
    const peak = impactFlash(IMPACT_AT + 0.005);
    const soon = impactFlash(IMPACT_AT + 0.06);
    expect(soon).toBeLessThan(peak * 0.5);
  });

  it('背光剪影整幕都在，命中瞬间被推亮一档（布光而非事件）', () => {
    const calm = backlightLevel(IMPACT_AT * 0.4);
    const hit = backlightLevel(IMPACT_AT);
    // 是底色：静默期也有可观值，不是从零起。
    expect(calm).toBeGreaterThan(0.1);
    // 撞击瞬间被推亮。
    expect(hit).toBeGreaterThan(calm);
    // 推亮是短促的，随闪光退去。
    expect(backlightLevel(IMPACT_AT + 0.25)).toBeLessThan(hit);
  });

  // ── 场景层：真正读到这些量 ───────────────────────────────────────
  it('场景把格挡环强度写进材质（数学层与渲染层不脱钩）', () => {
    const { stage, ctx } = build();
    for (const t of [0.05, 0.25, 0.5, 0.85]) {
      at(stage, t);
      const ring = node(ctx.root, 'barrier-ring') as THREE.Mesh<
        THREE.BufferGeometry, THREE.MeshBasicMaterial
      >;
      expect(ring.material.opacity).toBeCloseTo(barrierStrength(t) * 0.55, 9);
      // 环也随强度胀缩，屏障在尺寸上可见。
      expect(ring.scale.x).toBeCloseTo(1 + barrierStrength(t) * 0.06, 9);
    }
    stage.dispose();
  });

  it('场景把背光强度写进 uniform（uLevel 在背光层上）', () => {
    const { stage, ctx } = build();
    for (const t of [0.05, IMPACT_AT, 0.5, 0.9]) {
      at(stage, t);
      const bl = node(ctx.root, 'backlight-silhouette')!;
      expect(uniformOf(bl, 'uLevel')).toBeCloseTo(backlightLevel(t), 9);
    }
    stage.dispose();
  });

  it('弧波开口角 = 签名出射方向经 toScreen 的像（渲染不绕过签名）', () => {
    // 上面所有签名断言都在**盾面坐标系**里做。渲染却要经 toScreen 旋到
    // 屏幕系、并在 IMPACT_OFFSET 处取点。这两步若与签名脱钩，把 toScreen
    // 改成恒等、或把 IMPACT_OFFSET 改成 0，签名断言仍会全绿而画面已错。
    const { stage, ctx } = build();
    at(stage, IMPACT_AT + 0.05);
    const expected = angleOf(toScreen(
      deflect(strikeIncident(), IMPACT_OFFSET), SHIELD_FACE_ANGLE,
    ));
    // 三道弧波开口都朝弹开方向：逐道验证，任一道脱钩即失败。
    const arcs = collectExact(ctx.root, 'wavearc');
    expect(arcs).toHaveLength(WAVE_COUNT);
    for (const arc of arcs) {
      const aim = uniformOf(arc, 'uAimAngle');
      const diff = Math.atan2(Math.sin(aim - expected), Math.cos(aim - expected));
      expect(Math.abs(diff), `${arc.name} 开口与签名出射脱钩`).toBeLessThan(1e-9);
    }
    stage.dispose();
  });

  it('盾面朝向确实参与变换（toScreen 不是恒等）', () => {
    // 若 faceAngle 被忽略，屏幕系与盾面系重合，上一条断言就退化成同义反复。
    const v = { x: 1, y: 0 };
    const rotated = toScreen(v, SHIELD_FACE_ANGLE);
    expect(Math.hypot(rotated.x - v.x, rotated.y - v.y)).toBeGreaterThan(0.05);
    // 且是旋转：长度守恒。
    expect(Math.hypot(rotated.x, rotated.y)).toBeCloseTo(1, 12);
  });

  it('撞击点不在盾心（IMPACT_OFFSET 非零，斜撞才有转向可言）', () => {
    expect(Math.abs(IMPACT_OFFSET)).toBeGreaterThan(0.05);
    // 该点的转向量确实不为零。
    expect(Math.abs(deflectSpread(IMPACT_OFFSET))).toBeGreaterThan(0.05);
  });

  it('弧波源点落在撞击点、不在屏心（波从撞击处涌出，不是从盾中央）', () => {
    // 半径/亮度/开口角断言都不含源点：把 mesh.position 挪到 (0,0)，
    // 规格「冲击波从撞击点涌出」已破而那些断言照样全绿。
    const { stage, ctx } = build();
    at(stage, IMPACT_AT + 0.05);
    const arcs = collectExact(ctx.root, 'wavearc');
    expect(arcs).toHaveLength(WAVE_COUNT);
    // 撞击点方向由签名独立重算：arcNormal 在 IMPACT_OFFSET 处的屏幕像。
    const dir = toScreen(arcNormal(IMPACT_OFFSET), SHIELD_FACE_ANGLE);
    for (const arc of arcs) {
      const r = Math.hypot(arc.position.x, arc.position.y);
      // 源点离屏心有实际距离（挪到屏心即失败）。
      expect(r, `${arc.name} 源点塌在屏心`).toBeGreaterThan(1);
      // 且方向与撞击点方向共线（挪到别处也失败）。
      const cos = (arc.position.x * dir.x + arc.position.y * dir.y) / r;
      expect(cos, `${arc.name} 源点不在撞击点方向上`).toBeCloseTo(1, 6);
    }
    // 三道同源：源点重合，扩散靠半径而非平移。
    for (const arc of arcs.slice(1)) {
      expect(arc.position.x).toBeCloseTo(arcs[0].position.x, 10);
      expect(arc.position.y).toBeCloseTo(arcs[0].position.y, 10);
    }
    stage.dispose();
  });

  it('场景把三道弧波的半径按 uniform 写入，且彼此错开', () => {
    const { stage, ctx } = build();
    at(stage, IMPACT_AT + 0.3);
    const rs = collectExact(ctx.root, 'wavearc')
      .map((m) => uniformOf(m, 'uRadius'));
    expect(new Set(rs.map((r) => r.toFixed(4))).size).toBe(3);
    stage.dispose();
  });

  it('来击虚影的屏幕位置沿来击方向逼近（方向与签名同源）', () => {
    const { stage, ctx } = build();
    const dists: number[] = [];
    for (const t of [0.02, 0.08, 0.14]) {
      at(stage, t);
      const p = node(ctx.root, 'strike-phantom')!.position;
      dists.push(Math.hypot(p.x, p.y));
    }
    for (let i = 1; i < dists.length; i += 1) {
      expect(dists[i], '虚影必须逐步逼近盾心').toBeLessThan(dists[i - 1]);
    }
    stage.dispose();
  });

  // ── 档位与释放 ──────────────────────────────────────────────────
  it('降档只减密度不移除元素', () => {
    const hi = build();
    at(hi.stage, 0.5, 'cinematic');
    const lo = build();
    at(lo.stage, 0.5, 'low');
    for (const name of NAMED_ELEMENTS) {
      expect(names(lo.ctx.root), `低档缺少 ${name}`).toContain(name);
    }
    hi.stage.dispose();
    lo.stage.dispose();
  });

  it('dispose 后场景树清空，且嵌套容器不残留子节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    // 必须在 dispose 之前收集容器引用：dispose 会把整个 group 从 root
    // 摘走，之后遍历 root 找不到残留的嵌套容器（本项目踩过这个坑）。
    const containers: THREE.Object3D[] = [];
    ctx.root.traverse((o) => { if (o.children.length > 0) containers.push(o); });
    expect(containers.length).toBeGreaterThan(1);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    for (const c of containers) {
      expect(c.children, `容器 ${c.name} dispose 后仍有子节点`).toHaveLength(0);
    }
  });

  it('dispose 幂等，且之后 update 静默失效', () => {
    const { stage } = build();
    at(stage, 0.5);
    stage.dispose();
    expect(() => stage.dispose()).not.toThrow();
    expect(() => at(stage, 0.7)).not.toThrow();
  });
});
