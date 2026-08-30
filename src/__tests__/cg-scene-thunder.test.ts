import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-thunder';
import '../overlay/cg-scenes/cg-lightning';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  SHOCK_LAYERS, THUNDER_ACT1_END, THUNDER_ACT2_END, THUNDER_DURATION_S,
  THUNDER_GROUND_FLATTEN, echoRadius, frontOverpressure, ringArrivalT,
  rubbleAttenuation, shockLaunchAt, shockRadius, shockReach, shockSpeedFor, skyStrobe,
} from '../overlay/cg-scenes/thunder-shock';
import { RUBBLE_STEP } from '../overlay/cg-scenes/thunder-rubble';
import { ECHO_WAVES, MIST_BANDS, RIDGE_LAYERS } from '../overlay/cg-scenes/thunder-parts';
import { box, makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/**
 * 规格 §4.2 场景 11 的八元素在场景树里的具名落点。
 *
 * ④碎石是刚体（`rock-N`），⑤扬尘是 quarks 粒子——emitter 会被
 * BatchedRenderer 摘出场景树，按名字定位不到，所以由场景自持的具名锚点
 * `dust-anchor-N` 镜像其发射位置。
 */
const NAMED_ELEMENTS = [
  'ground-crack',   // ① 地裂雷光
  'shock-ring-0',   // ② 环形冲击波
  'echo-wave-0',    // ③ 山谷回响尾迹
  'rock-0',         // ④ 碎石跳起
  'dust-anchor-0',  // ⑤ 扬尘（发射点锚）
  'ridge-0',        // ⑥ 远山剪影
  'sky-strobe',     // ⑦ 天空暗闪
  'mist-band-0',    // ⑧ 空气冷凝纹
];

const W = 1920;
const H = 1080;
const SPEED = shockSpeedFor(W, H);
const REACH = shockReach(W, H);
/** 一个物理固定步对应的归一化进度：反弹要按**单步**升幅判定。 */
const STEP_T = RUBBLE_STEP / THUNDER_DURATION_S;

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('thunder');
  if (!scene) throw new Error('thunder 场景未注册');
  const ctx = makeSceneCtx({ width: W, height: H, ...overrides });
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/**
 * 精确正则收集。
 *
 * 前缀撞车会让断言测错对象却照样通过（本项目真实事故：`shard-` 同时命中
 * 刚体与反片，48 个「刚体」里混进 21 个贴片）。因此一律用 `^前缀-\d+$`，
 * 且本场景的各前缀互不包含。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 逐固定步采样每块碎石的 y，返回 [步序 → 各石 y]。 */
function flyRocks(stage: CgStage, root: THREE.Object3D, untilT = 1): { ys: number[][]; steps: number } {
  at(stage, 0);
  const rocks = collectExact(root, 'rock');
  const ys: number[][] = rocks.map(() => []);
  const steps = Math.round(untilT / STEP_T);
  for (let i = 0; i <= steps; i += 1) {
    at(stage, i * STEP_T);
    rocks.forEach((r, k) => ys[k].push(r.position.y));
  }
  return { ys, steps };
}

describe('场景 11 thunder（雷击山谷）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('thunder');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toEqual([
      '地裂雷光', '环形冲击波', '山谷回响尾迹', '碎石跳起',
      '扬尘', '远山剪影', '天空暗闪', '空气冷凝纹',
    ]);
    expect(scene!.config.signature).toContain('贴地环波');
    expect(scene!.config.preset).toBe('shock-ring');
  });

  it('场景树包含规格的全部具名构成件', () => {
    const { stage, ctx } = build();
    at(stage, 0.45);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, name).toContain(name);
    }
    expect(collectExact(ctx.root, 'shock-ring')).toHaveLength(SHOCK_LAYERS);
    expect(collectExact(ctx.root, 'echo-wave')).toHaveLength(ECHO_WAVES);
    expect(collectExact(ctx.root, 'mist-band')).toHaveLength(MIST_BANDS);
    expect(collectExact(ctx.root, 'ridge')).toHaveLength(RIDGE_LAYERS);
    expect(collectExact(ctx.root, 'rock').length).toBeGreaterThan(10);
    expect(collectExact(ctx.root, 'dust-anchor').length).toBeGreaterThan(1);
    stage.dispose();
  });

  // ───────── 签名：贴地环波 ─────────

  it('签名·环波半径随 t 单调增且线性外扩（声速恒定）', () => {
    const rs: number[] = [];
    for (let i = 0; i <= 200; i += 1) rs.push(shockRadius(i / 200, 0, SPEED));
    // 单调不减，且起爆后严格增。
    for (let i = 1; i < rs.length; i += 1) {
      expect(rs[i], `第 ${i} 步半径回缩`).toBeGreaterThanOrEqual(rs[i - 1]);
    }
    const launch = shockLaunchAt(0);
    expect(shockRadius(launch - 1e-6, 0, SPEED)).toBe(0);
    // 线性：起爆后任取两段等长区间，增量必须相等（写成 t² 或指数会红）。
    const d1 = shockRadius(0.3, 0, SPEED) - shockRadius(0.25, 0, SPEED);
    const d2 = shockRadius(0.75, 0, SPEED) - shockRadius(0.70, 0, SPEED);
    expect(Math.abs(d1 - d2), `增量 ${d1} vs ${d2}`).toBeLessThan(1e-6);
    // 常量半径会让所有增量为 0——上面的等式照样成立，所以这里要求真的在走。
    expect(d1).toBeGreaterThan(REACH * 0.05);
  });

  it('签名·末幕环波抵达四缘（覆盖 max(width,height)/2）', () => {
    // 第二幕末正好抵达屏缘（谷壁），整幕末已远远越出，四角也扫过。
    expect(shockRadius(THUNDER_ACT2_END, 0, SPEED)).toBeCloseTo(REACH, 3);
    const final = shockRadius(1, 0, SPEED);
    expect(final, `末幕半径 ${final} 未达屏缘 ${REACH}`).toBeGreaterThan(REACH);
    // 屏幕对角的半长：四个角也必须被扫到。
    expect(final).toBeGreaterThan(Math.hypot(W, H) * 0.5);
    expect(REACH).toBe(Math.max(W, H) / 2);
  });

  it('签名·环是压扁的贴地椭圆而非空中光圈（scale.y < scale.x/2）', () => {
    const { stage, ctx } = build();
    // 起爆前取地面线：此刻碎石还躺在地上，它们的底就是地面。
    at(stage, 0);
    const groundLine = Math.min(...collectExact(ctx.root, 'rock').map((r) => box(r).min.y));
    at(stage, 0.5);
    for (let i = 0; i < SHOCK_LAYERS; i += 1) {
      const ring = node(ctx.root, `shock-ring-${i}`);
      expect(ring.scale.y, `环 ${i} 未压扁`).toBeLessThan(ring.scale.x * 0.5);
      expect(ring.scale.y).toBeCloseTo(ring.scale.x * THUNDER_GROUND_FLATTEN, 6);
    }
    // 回响与雾带同样贴地（都是地面上的波）。
    for (const name of ['echo-wave-0', 'echo-wave-1', 'mist-band-0', 'mist-band-1']) {
      const m = node(ctx.root, name);
      expect(m.scale.y, `${name} 未压扁`).toBeLessThan(m.scale.x * 0.5);
    }
    // 且环心锁在地面线上：贴地的波不会浮在半空。
    const ringCenterY = box(node(ctx.root, 'shock-ring-0')).getCenter(new THREE.Vector3()).y;
    expect(Math.abs(ringCenterY - groundLine), `环心 ${ringCenterY} 离地面线 ${groundLine}`)
      .toBeLessThan(H * 0.03);
    // 环心明显在屏幕中线之下（贴地，不是居中的一圈光晕）。
    expect(ringCenterY).toBeLessThan(-H * 0.2);
    stage.dispose();
  });

  it('签名·多层环错峰发出，同一时刻外层在前内层在后', () => {
    const mid = 0.55;
    const radii = Array.from({ length: SHOCK_LAYERS }, (_, i) => shockRadius(mid, i, SPEED));
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i], `层 ${i} 未落后于 ${i - 1}`).toBeLessThan(radii[i - 1]);
    }
    // 起爆前全部为零。
    for (let i = 0; i < SHOCK_LAYERS; i += 1) {
      expect(shockRadius(THUNDER_ACT1_END - 0.01, i, SPEED), `层 ${i}`).toBe(0);
    }
  });

  it('签名·运行期环 uRadius 随 t 增、起爆前不可见', () => {
    const { stage, ctx } = build();
    at(stage, 0.1);
    expect(uniformOf(node(ctx.root, 'shock-ring-0'), 'uAlpha')).toBe(0);
    expect(uniformOf(node(ctx.root, 'shock-ring-0'), 'uRadius')).toBe(0);

    const seq: number[] = [];
    for (const t of [0.25, 0.4, 0.55, 0.7, 0.9]) {
      at(stage, t);
      seq.push(uniformOf(node(ctx.root, 'shock-ring-0'), 'uRadius'));
    }
    for (let i = 1; i < seq.length; i += 1) {
      expect(seq[i], `uRadius 序列 ${seq.join(',')}`).toBeGreaterThan(seq[i - 1]);
    }
    stage.dispose();
  });

  // ───────── 与 lightning 的天地对照 ─────────

  it('对照·主体机制是贴地环波，无横贯天穹的主电弧', () => {
    const light = resolveScene('lightning')!;
    const thunder = resolveScene('thunder')!;
    expect(light.config.signature).toContain('天象');
    expect(thunder.config.signature).toContain('lightning');
    expect(thunder.config.signature).not.toBe(light.config.signature);

    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    // lightning 的纵向放电元素在 thunder 中一个都不该出现。
    for (const banned of ['bolt-main', 'bolt-fork', 'leader-bolt', 'strike-pool', 'serpent']) {
      expect(tree, `thunder 不该有 ${banned}`).not.toContain(banned);
    }

    // 几何判据：thunder 的电光元素是**横躺的**（宽远大于高），
    // 而 lightning 的主弧是纵向的（高远大于宽）。
    const crack = box(node(ctx.root, 'ground-crack'));
    const crackW = crack.max.x - crack.min.x;
    const crackH = crack.max.y - crack.min.y;
    expect(crackW / crackH, `地裂 ${crackW}x${crackH} 不够横`).toBeGreaterThan(4);
    // 地裂贴在地面线上，不跨到上半屏。
    expect(crack.max.y).toBeLessThan(0);

    const lightCtx = makeSceneCtx({ width: W, height: H });
    const lightStage = light.create(lightCtx);
    lightStage.update(0.5, 600, 'cinematic');
    const boltBox = box(node(lightCtx.root, 'bolt-main-0'));
    const boltH = boltBox.max.y - boltBox.min.y;
    const boltW = boltBox.max.x - boltBox.min.x;
    expect(boltH / boltW, 'lightning 主弧应纵向').toBeGreaterThan(2);
    // 天穹弧跨到上半屏，贴地环不跨。
    expect(boltBox.max.y).toBeGreaterThan(0);
    lightStage.dispose();
    stage.dispose();
  });

  // ───────── 物理：碎石 ─────────

  it('物理·碎石受重力（自由段竖直位移二阶差分为负且接近 -g·dt²）', () => {
    const { stage, ctx } = build();
    const { ys } = flyRocks(stage, ctx.root);
    const rel = ys[0];
    const peakI = rel.indexOf(Math.max(...rel));
    // 峰值前后各取几步（纯自由飞行段，无超压、未落地）。
    let samples = 0;
    for (let i = peakI - 3; i <= peakI + 3; i += 1) {
      const d2 = rel[i + 1] - 2 * rel[i] + rel[i - 1];
      expect(d2, `第 ${i} 步二阶差分 ${d2} 非负`).toBeLessThan(0);
      samples += 1;
    }
    expect(samples).toBe(7);
    // 二阶差分应恒定（匀加速）——重力若被写成 0 这里会全为 0 而先在上一条红。
    const a = rel[peakI + 1] - 2 * rel[peakI] + rel[peakI - 1];
    const b = rel[peakI + 3] - 2 * rel[peakI + 2] + rel[peakI + 1];
    expect(Math.abs(a - b), `加速度不恒定 ${a} vs ${b}`).toBeLessThan(0.05);
    stage.dispose();
  });

  /**
   * 反弹判据必须测**单步升幅**而非总回升量。
   *
   * 本项目实测过：restitution=0 时碎石沿地面滑行，每个固定步的地面钳位会
   * 微抬 y，累计能到 19.5px——「总回升 >10px」照样绿。真反弹的单步升幅
   * 数量级完全不同（这里 >1.5px/步），滑行则严格为 0（地面接触由解析钳位
   * 给出，没有求解器噪声）。
   */
  it('物理·碎石落地反弹（单步升幅可观）且反弹高度大幅衰减', () => {
    const { stage, ctx } = build();
    const { ys } = flyRocks(stage, ctx.root);
    const rel = ys[0].map((v) => v - ys[0][0]);
    const peak = Math.max(...rel);
    expect(peak, '碎石根本没被抛起').toBeGreaterThan(H * 0.1);

    // 第一次落地：从高处回到接触面。
    let land = -1;
    for (let i = 1; i < rel.length; i += 1) {
      if (rel[i - 1] > 2 && rel[i] <= 0.6) { land = i; break; }
    }
    expect(land, '碎石从未落地').toBeGreaterThan(0);

    const after = rel.slice(land);
    let maxStepRise = 0;
    for (let i = 1; i < after.length; i += 1) {
      maxStepRise = Math.max(maxStepRise, after[i] - after[i - 1]);
    }
    // ★ 单步升幅：真反弹的第一步就抬起可观的高度。
    expect(maxStepRise, `落地后单步最大升幅仅 ${maxStepRise.toFixed(3)}px`).toBeGreaterThan(1.5);

    // 反弹高度远低于首次抛起高度（restitution .12，能量大幅损失）。
    const rebound = Math.max(...after);
    expect(rebound).toBeGreaterThan(1.5);
    expect(rebound, `反弹 ${rebound} 未衰减（首跳 ${peak}）`).toBeLessThan(peak * 0.1);
    stage.dispose();
  });

  it('物理·碎石不穿透地面（刚体位姿原样上屏）', () => {
    const { stage, ctx } = build();
    const rocks = collectExact(ctx.root, 'rock');
    at(stage, 0);
    const floor = Math.min(...rocks.map((r) => r.position.y));
    const steps = Math.round(1 / STEP_T);
    for (let i = 0; i <= steps; i += 1) {
      at(stage, i * STEP_T);
      for (const r of rocks) {
        // 允许一个石块半径的余量（各石半边长不同，floor 取的是最矮那块）。
        expect(r.position.y, `${r.name} 在第 ${i} 步陷入地下`).toBeGreaterThan(floor - H * 0.02);
      }
    }
    stage.dispose();
  });

  it('物理·外圈碎石被抛得更矮（球面衰减律）', () => {
    expect(rubbleAttenuation(0, REACH)).toBeCloseTo(1, 6);
    let prev = Infinity;
    for (const r of [0, 0.25, 0.5, 0.75, 1].map((k) => k * REACH)) {
      const a = rubbleAttenuation(r, REACH);
      expect(a, `半径 ${r} 衰减未递减`).toBeLessThan(prev);
      prev = a;
    }
    const { stage, ctx } = build();
    const { ys } = flyRocks(stage, ctx.root);
    const rise = ys.map((a) => Math.max(...a) - a[0]);
    // 近震中的一批明显高于远处的一批。
    const inner = rise.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
    const outer = rise.slice(-4).reduce((s, v) => s + v, 0) / 4;
    expect(inner, `内圈 ${inner} 外圈 ${outer}`).toBeGreaterThan(outer * 2);
    stage.dispose();
  });

  // ───────── 互动①：冲击波扫过碎石将其抛起 ─────────

  it('互动①·超压场是波前的函数：波未到不推、刚过最强、远后泄压', () => {
    const band = REACH * 0.3;
    // 前沿还在里侧：这块石头不该受力（写成定时器就没有这条性质）。
    expect(frontOverpressure(100, 400, band)).toBe(0);
    // 前沿刚过：峰值。
    expect(frontOverpressure(400, 400, band)).toBeCloseTo(1, 6);
    // 过去一段：线性泄压。
    expect(frontOverpressure(400 + band * 0.5, 400, band)).toBeCloseTo(0.5, 6);
    // 远远过去：归零。
    expect(frontOverpressure(400 + band * 2, 400, band)).toBe(0);
  });

  it('互动①·每块碎石的起跳时刻落在环波经过它的时刻附近（差 <0.05）', () => {
    const { stage, ctx } = build();
    const rocks = collectExact(ctx.root, 'rock');
    at(stage, 0);
    const baseY = rocks.map((r) => r.position.y);
    const baseX = rocks.map((r) => r.position.x);
    const liftAt = rocks.map(() => -1);

    const steps = Math.round(1 / STEP_T);
    for (let i = 1; i <= steps; i += 1) {
      const t = i * STEP_T;
      at(stage, t);
      rocks.forEach((r, k) => {
        if (liftAt[k] < 0 && r.position.y > baseY[k] + 1) liftAt[k] = t;
      });
    }

    const trace: string[] = [];
    for (let k = 0; k < rocks.length; k += 1) {
      // 环波抵达这块石头所在半径的时刻——起跳的**预期**时刻。
      const arrival = ringArrivalT(Math.abs(baseX[k]), SPEED);
      const gap = liftAt[k] - arrival;
      trace.push(`${rocks[k].name}:${liftAt[k].toFixed(3)}/${arrival.toFixed(3)}`);
      expect(liftAt[k], `${rocks[k].name} 从未起跳`).toBeGreaterThan(0);
      // 起跳只能在波到之后（或同一步内），且必须紧随其后。
      expect(gap, `${rocks[k].name} 早于波前起跳（${trace[k]}）`).toBeGreaterThan(-STEP_T);
      expect(Math.abs(gap), `${rocks[k].name} 起跳与波到脱节（${trace[k]}）`).toBeLessThan(0.05);
    }
    // 且起跳时刻真的铺开在整个第二幕上（写成定时齐跳会挤成一团）。
    const spread = Math.max(...liftAt) - Math.min(...liftAt);
    expect(spread, `起跳时刻跨度仅 ${spread}`).toBeGreaterThan(0.3);
    stage.dispose();
  });

  it('互动①·起跳次序严格随半径递增（近石先跳，不是同时）', () => {
    const { stage, ctx } = build();
    const rocks = collectExact(ctx.root, 'rock');
    at(stage, 0);
    const baseY = rocks.map((r) => r.position.y);
    const rows = rocks.map((r, k) => ({ k, radius: Math.abs(r.position.x), liftAt: -1, name: r.name, baseY: baseY[k] }));
    const steps = Math.round(1 / STEP_T);
    for (let i = 1; i <= steps; i += 1) {
      const t = i * STEP_T;
      at(stage, t);
      rows.forEach((row) => {
        if (row.liftAt < 0 && rocks[row.k].position.y > row.baseY + 1) row.liftAt = t;
      });
    }
    const byRadius = [...rows].sort((a, b) => a.radius - b.radius);
    for (let i = 1; i < byRadius.length; i += 1) {
      // 允许同一固定步内并发（半径相近时），但不允许远石先跳。
      expect(byRadius[i].liftAt, `${byRadius[i].name} 先于更近的 ${byRadius[i - 1].name} 起跳`)
        .toBeGreaterThanOrEqual(byRadius[i - 1].liftAt - 1e-9);
    }
    // 首末必须拉开：全部同时起跳时该差为 0。
    expect(byRadius[byRadius.length - 1].liftAt - byRadius[0].liftAt).toBeGreaterThan(0.3);
    stage.dispose();
  });

  it('互动①·稀疏 update 与逐步 update 的碎石终态一致（时变场逐步采样）', () => {
    const dense = build();
    const sparse = build();
    const steps = Math.round(1 / STEP_T);
    for (let i = 0; i <= steps; i += 1) at(dense.stage, i * STEP_T);
    // 稀疏：整幕只调 14 次，每次跨约 86ms。
    for (let i = 0; i <= 14; i += 1) at(sparse.stage, i / 14);

    const d = collectExact(dense.ctx.root, 'rock').map((r) => r.position.y);
    const s = collectExact(sparse.ctx.root, 'rock').map((r) => r.position.y);
    expect(s).toHaveLength(d.length);
    for (let i = 0; i < d.length; i += 1) {
      expect(s[i], `第 ${i} 块稀疏/密集不一致`).toBeCloseTo(d[i], 6);
    }
    dense.stage.dispose();
    sparse.stage.dispose();
  });

  // ───────── 互动②：扬尘跟着环波走 ─────────

  it('互动②·扬尘发射点半径与环波半径逐帧同步', () => {
    const { stage, ctx } = build();
    const anchors = collectExact(ctx.root, 'dust-anchor');
    expect(anchors.length).toBeGreaterThan(1);

    const radii: number[] = [];
    for (const t of [0.25, 0.4, 0.55, 0.7, 0.85]) {
      at(stage, t);
      const front = shockRadius(t, 0, SPEED);
      expect(front).toBeGreaterThan(0);
      for (const a of anchors) {
        // 锚点沿环周铺开，其到环心的半径必须等于当帧前沿半径。
        // z 方向按贴地压扁（0.34），故用椭圆参数化反解。
        const r = Math.hypot(a.position.x, a.position.z / 0.34);
        expect(r, `${a.name} 在 t=${t} 未跟上波前 ${front}`).toBeCloseTo(front, 3);
      }
      radii.push(Math.abs(anchors[0].position.x));
    }
    // 且发射点确实在往外走（不是钉在原地）。
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i], `扬尘锚点序列 ${radii.join(',')}`).toBeGreaterThan(radii[i - 1]);
    }
    // 起爆前尘点还在震中。
    at(stage, 0.05);
    expect(Math.hypot(anchors[0].position.x, anchors[0].position.z)).toBeCloseTo(0, 6);
    stage.dispose();
  });

  it('互动②·扬尘贴着地面走（锚点恒在地面线上）', () => {
    const { stage, ctx } = build();
    const anchors = collectExact(ctx.root, 'dust-anchor');
    at(stage, 0.3);
    const groundLevel = anchors[0].position.y;
    for (const t of [0.2, 0.5, 0.9]) {
      at(stage, t);
      for (const a of anchors) expect(a.position.y, `${a.name} 离地`).toBe(groundLevel);
    }
    expect(groundLevel).toBeLessThan(0);
    stage.dispose();
  });

  // ───────── 三幕 ─────────

  it('三幕·各自有可观测差异（蓄雷 / 地裂冲击波 / 回响尾迹）', () => {
    const { stage, ctx } = build();
    at(stage, THUNDER_ACT1_END * 0.5);
    const s1 = visualSnapshot(ctx.root);
    const act1Ring = uniformOf(node(ctx.root, 'shock-ring-0'), 'uAlpha');
    const act1Crack = uniformOf(node(ctx.root, 'ground-crack'), 'uAlpha');

    at(stage, (THUNDER_ACT1_END + THUNDER_ACT2_END) / 2);
    const s2 = visualSnapshot(ctx.root);
    const act2Ring = uniformOf(node(ctx.root, 'shock-ring-0'), 'uAlpha');
    const act2Crack = uniformOf(node(ctx.root, 'ground-crack'), 'uAlpha');
    const act2Echo = uniformOf(node(ctx.root, 'echo-wave-0'), 'uAlpha');

    at(stage, 0.96);
    const s3 = visualSnapshot(ctx.root);
    const act3Ring = uniformOf(node(ctx.root, 'shock-ring-0'), 'uAlpha');
    const act3Echo = uniformOf(node(ctx.root, 'echo-wave-0'), 'uAlpha');

    expect(s1).not.toBe(s2);
    expect(s2).not.toBe(s3);
    expect(s1).not.toBe(s3);

    // 第一幕：只有天空在闪，地面尚无动静。
    expect(act1Ring).toBe(0);
    expect(act1Crack).toBe(0);
    expect(act2Echo).toBe(0);
    // 第二幕：地裂 + 冲击波正盛。
    expect(act2Ring).toBeGreaterThan(0.3);
    expect(act2Crack).toBeGreaterThan(0.5);
    // 第三幕：主环已远去、回响接手。
    expect(act3Ring).toBeLessThan(act2Ring * 0.5);
    expect(act3Echo).toBeGreaterThan(0.2);
    expect(act3Echo).toBeGreaterThan(act3Ring);
    stage.dispose();
  });

  it('三幕·第一幕天空高频暗闪，末幕熄灭', () => {
    // 高频：整幕十次以上的独立闪动（lightning 整幕只有三相放电）。
    let flashes = 0; let prev = 0; let rising = false;
    for (let i = 0; i <= 4000; i += 1) {
      const v = skyStrobe(i / 4000);
      if (v > prev && v > 0.3) rising = true;
      else if (rising && v < prev) { flashes += 1; rising = false; }
      prev = v;
    }
    expect(flashes, `整幕仅 ${flashes} 次频闪`).toBeGreaterThan(8);

    // 蓄雷幕有峰值、末幕彻底熄。
    let act1Peak = 0; let act3Peak = 0;
    for (let i = 0; i <= 2000; i += 1) {
      const t = i / 2000; const v = skyStrobe(t);
      if (t <= THUNDER_ACT1_END) act1Peak = Math.max(act1Peak, v);
      if (t > THUNDER_ACT2_END) act3Peak = Math.max(act3Peak, v);
    }
    expect(act1Peak).toBeGreaterThan(0.6);
    expect(act3Peak).toBe(0);

    const { stage, ctx } = build();
    at(stage, 0.96);
    expect(opacity(node(ctx.root, 'sky-strobe'))).toBe(0);
    stage.dispose();
  });

  it('三幕·回响是向内回传的那一支（半径递减，与主环反向）', () => {
    // 波前未到谷壁：还没有回响。
    expect(echoRadius(REACH * 0.5, REACH)).toBe(-1);
    // 撞壁之后：半径随主环继续外扩而**递减**。
    const backs = [1.1, 1.3, 1.5].map((k) => echoRadius(REACH * k, REACH));
    for (const b of backs) expect(b).toBeGreaterThan(0);
    for (let i = 1; i < backs.length; i += 1) {
      expect(backs[i], `回响 ${backs.join(',')} 未回传`).toBeLessThan(backs[i - 1]);
    }

    const { stage, ctx } = build();
    const seq: number[] = [];
    for (const t of [0.72, 0.82, 0.92, 0.99]) {
      at(stage, t);
      seq.push(uniformOf(node(ctx.root, 'echo-wave-0'), 'uRadius'));
    }
    for (const v of seq) expect(v).toBeGreaterThan(0);
    for (let i = 1; i < seq.length; i += 1) {
      expect(seq[i], `运行期回响 ${seq.join(',')} 未回传`).toBeLessThan(seq[i - 1]);
    }
    stage.dispose();
  });

  it('冷凝雾带跟在波后（半径小于波前但同步外扩）', () => {
    const { stage, ctx } = build();
    let prev = -1;
    for (const t of [0.3, 0.5, 0.7, 0.9]) {
      at(stage, t);
      const mist = uniformOf(node(ctx.root, 'mist-band-0'), 'uRadius');
      const ring = uniformOf(node(ctx.root, 'shock-ring-0'), 'uRadius');
      expect(mist, `t=${t} 雾带跑到波前之前`).toBeLessThan(ring);
      expect(mist, `t=${t} 雾带未跟上`).toBeGreaterThan(ring * 0.5);
      expect(mist).toBeGreaterThan(prev);
      prev = mist;
    }
    stage.dispose();
  });

  it('远山剪影整幕在场，被环波掠过时轮廓被照亮', () => {
    const { stage, ctx } = build();
    let rimPeak = 0; let rimAt = 0;
    for (let i = 0; i <= 200; i += 1) {
      const t = i / 200;
      at(stage, t);
      expect(uniformOf(node(ctx.root, 'ridge-0'), 'uAlpha'), `t=${t} 山不见了`).toBeGreaterThan(0.4);
      const rim = uniformOf(node(ctx.root, 'ridge-0'), 'uRim');
      if (rim > rimPeak) { rimPeak = rim; rimAt = t; }
    }
    expect(rimPeak, '山脊从未被照亮').toBeGreaterThan(0.2);
    // 照亮时刻必须是波前扫到山脚的时刻附近，不是随便某一帧。
    const frontThen = shockRadius(rimAt, 0, SPEED);
    expect(frontThen, `峰值 ${rimAt} 时前沿在 ${frontThen}`).toBeGreaterThan(REACH * 0.5);
    expect(frontThen).toBeLessThan(REACH * 1.1);
    stage.dispose();
  });

  // ───────── 降档与释放 ─────────

  it('降档只减粒子/碎石密度，8 个命名元素一个不少', () => {
    const hi = build();
    at(hi.stage, 0.5);
    const lo = build({ quality: 'low' });
    at(lo.stage, 0.5);

    const hiTree = names(hi.ctx.root);
    const loTree = names(lo.ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(hiTree, `cinematic ${name}`).toContain(name);
      expect(loTree, `low ${name}`).toContain(name);
    }
    // 结构件数量不变。
    for (const prefix of ['shock-ring', 'echo-wave', 'mist-band', 'ridge']) {
      expect(collectExact(lo.ctx.root, prefix).length, prefix)
        .toBe(collectExact(hi.ctx.root, prefix).length);
    }
    // 密度件严格变少，但至少留一个（scaledCount 的下限）。
    for (const prefix of ['rock', 'dust-anchor']) {
      const hiN = collectExact(hi.ctx.root, prefix).length;
      const loN = collectExact(lo.ctx.root, prefix).length;
      expect(loN, `${prefix} 降档未减密度（${hiN} → ${loN}）`).toBeLessThan(hiN);
      expect(loN, `${prefix} 降档被整体移除`).toBeGreaterThanOrEqual(1);
    }
    hi.stage.dispose();
    lo.stage.dispose();
  });

  /**
   * dispose 必须把**每一层**都摘净，刚体层尤其。
   *
   * 只断言 `ctx.root.children` 为空是不够的：`res.dispose()` 会把整个
   * 场景 group 从 root 上摘走，于是漏掉 `rubble.dispose()` 时这条依旧全绿
   * （已由变异验证证实：注释掉 rubble.dispose() 后 25 条全过）。刚体层
   * 自己的容器仍挂着 30 个 mesh、World 仍持有 30 个 body——是真实泄漏。
   * 因此这里改为持有刚体容器的引用，断言它的子节点也被清空。
   */
  it('dispose 幂等：连刚体层一并摘净，再次 update 与 dispose 都不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(ctx.root.children.length).toBeGreaterThan(0);

    const rubbleGroup = node(ctx.root, 'rubble-field');
    expect(rubbleGroup.children.length, '碎石未挂进刚体层').toBeGreaterThan(10);
    expect(collectExact(ctx.root, 'rock').length).toBe(rubbleGroup.children.length);

    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    // 刚体层自己也必须清空并脱离父节点，否则 World 仍持有全部 body。
    expect(rubbleGroup.children, 'dispose 漏掉了刚体层').toHaveLength(0);
    expect(rubbleGroup.parent).toBeNull();
    expect(collectExact(ctx.root, 'rock')).toHaveLength(0);

    expect(() => at(stage, 0.8)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
    expect(rubbleGroup.children).toHaveLength(0);
  });
});
