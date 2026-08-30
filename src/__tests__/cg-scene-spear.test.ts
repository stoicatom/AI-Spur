/**
 * 场景 27 spear 实现验收（设计规格 §4.2 场景 27）。
 *
 * 取证方式的三点说明（都是本项目吃过亏的地方）：
 *
 * 1. **螺旋必须同时测「绕杆角度」与「沿杆位置」**。只测角度会被「原地打转」
 *    蒙混，只测位置会被「直线跟随」蒙混——螺旋的定义就是两者同时推进。
 * 2. **收束半径的取证不测「随时间收紧」而测「与速度负相关」**。前者被
 *    「时间的单调函数」轻易满足；后者要求巡航减速段半径**回张**，
 *    且两个不同时刻只要速度相同半径就必须相同——时间函数做不到。
 * 3. **断裂的对齐检查针对整条曲线**，不只比一个时刻：换一个命中时刻，
 *    断裂点必须跟着走（自跑曲线的峰值时刻差 0.011 就能蒙混过阈值比较）。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-spear';
import { resolveScene } from '../overlay/cg-scene-registry';
import { SPEAR_ACT1_END, SPEAR_ACT2_END } from '../overlay/cg-scenes/cg-spear';
import { FLEX_BEADS, SHOCK_RINGS, TEAR_PUFFS } from '../overlay/cg-scenes/spear-parts';
import { SWIRL_MOTES } from '../overlay/cg-scenes/spear-swirl';
import { TEAR_SEGMENTS } from '../overlay/cg-scenes/spear-shaders';
import {
  ACCEL_FRAC,
  BREAK_SPAN,
  FLIGHT_SPAN,
  HIT_AT,
  LAUNCH_END,
  SPEAR_SPAN_S,
  airflowContinuity,
  airflowSpeed,
  slipRate,
  spearPassTime,
  spearProgress,
  speedShape,
  spiralRadiusScale,
  swirlBackwash,
  swirlRate,
  swirlSpin,
} from '../overlay/cg-scenes/spear-flight';
import { shaftDisplacement, shaftRing, tearWidth } from '../overlay/cg-scenes/spear-shaft';
import { arrowProgress, DRAW_END, FLIGHT_END } from '../overlay/cg-scenes/bow-ballistics';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf, visualSnapshot } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 27 的八元素对应的具名节点。 */
const NAMED_ELEMENTS = [
  'spear-body',        // ① 矛 mesh（枪头 + 杆）
  'swirl-sheath',      // ② 螺旋气流
  'ripwind-streaks',   // ③ 破空纹
  'shockring-0',       // ④ 命中震荡
  'flexbead-0',        // ⑤ 矛杆震动
  'target-board',      // ⑥ 靶板裂纹
  'airflow-cloud',     // ⑦ 气流云
  'tip-flare',         // ⑧ 枪头闪光
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('spear');
  if (!scene) throw new Error('spear 场景未注册');
  const ctx = makeSceneCtx({ now: 0, ...overrides });
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * 1200, quality);
}

/** 飞行段相位 → 整幕进度。 */
function flightT(k: number): number {
  return LAUNCH_END + k * FLIGHT_SPAN;
}

/**
 * 精确正则收集：前缀撞车会让断言测错对象却照样通过（本项目真实事故）。
 * `swirl-mote-N` / `flexbead-N` / `shockring-N` / `tearpuff-N` 四族互不包含。
 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

function motes(root: THREE.Object3D): THREE.Object3D[] {
  return collectExact(root, 'swirl-mote');
}

/** 一颗气流点相对枪尖的螺旋坐标：绕杆角、绕杆半径、沿杆后掠距离。 */
function spiralOf(mote: THREE.Object3D, tipX: number, pathY: number): {
  angle: number; radius: number; along: number;
} {
  const dy = mote.position.y - pathY;
  const dz = mote.position.z;
  return {
    angle: Math.atan2(dy, dz),
    radius: Math.hypot(dy, dz),
    along: tipX - mote.position.x,
  };
}

function tipX(root: THREE.Object3D): number {
  return node(root, 'tip-flare').position.x;
}

function pathYOf(root: THREE.Object3D): number {
  return node(root, 'tip-flare').position.y;
}

function tearArray(root: THREE.Object3D): number[] {
  const dust = node(root, 'airflow-cloud') as THREE.Mesh;
  const mat = dust.material as THREE.ShaderMaterial;
  return Array.from(mat.uniforms.uTear.value as Float32Array);
}

describe('场景 27 spear（破空长矛）', () => {
  it('注册项声明规格原文的 8 个元素与独立签名', () => {
    const scene = resolveScene('spear');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toEqual([
      '矛 mesh', '螺旋气流', '破空纹', '命中震荡',
      '矛杆震动', '靶板裂纹', '气流云', '枪头闪光',
    ]);
    expect(scene!.config.signature).toContain('螺旋气流加持的直飞');
    expect(scene!.config.signature).toContain('ninja-star');
    expect(scene!.config.preset).toBe('dash');
  });

  it('八个规格元素全部落地为具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(tree, `缺元素 ${name}`).toContain(name);
    }
    // 矛 mesh 的两个部件都在（枪头 + 杆，规格元素①的原文）。
    expect(tree).toContain('spear-head');
    expect(tree).toContain('spear-shaft');
    expect(collectExact(ctx.root, 'shockring')).toHaveLength(SHOCK_RINGS);
    expect(collectExact(ctx.root, 'flexbead')).toHaveLength(FLEX_BEADS);
    expect(collectExact(ctx.root, 'tearpuff')).toHaveLength(TEAR_PUFFS);
    expect(motes(ctx.root)).toHaveLength(SWIRL_MOTES);
    stage.dispose();
  });

  // ===== 签名：螺旋气流加持的直飞 =====

  // 螺旋的定义 = 绕杆角度推进 **且** 沿杆位置前移。缺一个就不是螺旋：
  // 只有角度是「原地打转」，只有位置是「直线跟随」。
  it('签名·气流粒子真的绕矛杆螺旋（角度单调推进 + 沿杆位置单调前移）', () => {
    const { stage, ctx } = build();
    const list = motes(ctx.root);
    expect(list.length).toBeGreaterThan(20);

    const cum = new Map<string, number[]>();
    const along = new Map<string, number[]>();
    const prev = new Map<string, number>();
    const acc = new Map<string, number>();

    for (let i = 0; i <= 10; i += 1) {
      const t = flightT(0.02 + (i / 10) * 0.9);
      at(stage, t);
      const tx = tipX(ctx.root);
      const py = pathYOf(ctx.root);
      for (const mote of list) {
        const { angle, along: a } = spiralOf(mote, tx, py);
        const last = prev.get(mote.name);
        if (last === undefined) {
          acc.set(mote.name, 0);
        } else {
          // 展开跨 ±π 的跳变，否则单调性会被折返假象打断。
          let step = angle - last;
          while (step > Math.PI) step -= Math.PI * 2;
          while (step < -Math.PI) step += Math.PI * 2;
          acc.set(mote.name, (acc.get(mote.name) ?? 0) + step);
        }
        prev.set(mote.name, angle);
        if (!cum.has(mote.name)) cum.set(mote.name, []);
        if (!along.has(mote.name)) along.set(mote.name, []);
        cum.get(mote.name)!.push(acc.get(mote.name)!);
        along.get(mote.name)!.push(a);
      }
    }

    const mono = (xs: number[]): boolean => xs.every((v, i) => i === 0 || v > xs[i - 1]);
    for (const mote of list) {
      const a = cum.get(mote.name)!;
      const s = along.get(mote.name)!;
      // 每一颗都必须同时满足：气流是同一个涡管，有一颗不螺旋就说明
      // 它拿到的不是那个涡管的解。
      expect(mono(a), `${mote.name} 绕杆角度未单调推进: ${a.map((n) => n.toFixed(2)).join(',')}`)
        .toBe(true);
      expect(mono(s), `${mote.name} 沿杆位置未单调前移: ${s.map((n) => n.toFixed(1)).join(',')}`)
        .toBe(true);
      // 幅度下限：至少绕过一整圈，且沿杆滑过屏短边的十分之一。
      expect(a[a.length - 1] - a[0], `${mote.name} 绕杆不足一圈`).toBeGreaterThan(Math.PI * 2);
      expect(s[s.length - 1] - s[0], `${mote.name} 沿杆位移过小`)
        .toBeGreaterThan(Math.min(ctx.width, ctx.height) * 0.1);
    }
    stage.dispose();
  });

  // 螺旋的横向自由度**只**来自 (半径, 转角)：验收方式是「反解回相位」——
  // 由 (y, z) 算出的半径必须与 tube×收束系数 一致，若掺进了平流项，
  // 半径会被平流量污染而不再等于任何一颗的常量流管半径。
  it('签名续·横向位置纯由绕杆相位决定（半径不含平流污染）', () => {
    const { stage, ctx } = build();
    const list = motes(ctx.root);
    // 同一时刻各颗的半径 = tube × 同一个收束系数，所以
    // 「各颗半径之比」在不同时刻必须完全一致（比值只由常量 tube 决定）。
    at(stage, flightT(0.2));
    const tx1 = tipX(ctx.root); const py1 = pathYOf(ctx.root);
    const r1 = list.map((m) => spiralOf(m, tx1, py1).radius);
    at(stage, flightT(0.7));
    const tx2 = tipX(ctx.root); const py2 = pathYOf(ctx.root);
    const r2 = list.map((m) => spiralOf(m, tx2, py2).radius);

    const ratios = r1.map((v, i) => r2[i] / v);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    for (let i = 0; i < ratios.length; i += 1) {
      // 比值必须处处相同：有平流项掺入时，靠近/远离轴的点比值会分岔。
      expect(ratios[i], `第 ${i} 颗半径比 ${ratios[i].toFixed(5)} 偏离均值 ${mean.toFixed(5)}`)
        .toBeCloseTo(mean, 6);
    }
    // 半径必须真的非零（不是所有点都趴在轴上，那样比值也处处相同）。
    expect(Math.min(...r1)).toBeGreaterThan(1);
    stage.dispose();
  });

  // ===== 与 ninja-star 的对照：直飞 vs 回旋 =====

  it('对照 ninja-star·矛路是直线（逐帧位移方向点积 >0.999）且不返回起点', () => {
    const { stage, ctx } = build();
    const track: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i += 1) {
      at(stage, flightT(i / 16));
      track.push(node(ctx.root, 'spear-body').position.clone());
    }
    const dirs: THREE.Vector3[] = [];
    for (let i = 1; i < track.length; i += 1) {
      const d = track[i].clone().sub(track[i - 1]);
      expect(d.length(), `第 ${i} 段无位移`).toBeGreaterThan(0);
      dirs.push(d.normalize());
    }
    for (let i = 1; i < dirs.length; i += 1) {
      const dot = dirs[i].dot(dirs[i - 1]);
      expect(dot, `第 ${i} 段方向拐弯（点积 ${dot.toFixed(6)}）`).toBeGreaterThan(0.999);
    }
    // 不返回起点：ninja-star 的回旋镖会回来，矛不会。
    const startToEnd = track[track.length - 1].distanceTo(track[0]);
    for (let i = 1; i < track.length; i += 1) {
      // 到起点距离必须单调递增（回旋轨迹在后半段会缩小这个距离）。
      expect(track[i].distanceTo(track[0]), `第 ${i} 帧回头了`)
        .toBeGreaterThan(track[i - 1].distanceTo(track[0]));
    }
    expect(startToEnd).toBeGreaterThan(ctx.width * 0.9);
    stage.dispose();
  });

  it('全屏·矛路平贯全屏（横跨超屏宽，且纵向几乎不偏）', () => {
    const { stage, ctx } = build();
    at(stage, LAUNCH_END);
    const start = node(ctx.root, 'tip-flare').position.clone();
    at(stage, HIT_AT);
    const end = node(ctx.root, 'tip-flare').position.clone();
    // 「平」贯：横跨全屏，纵向位移为零。
    expect(end.x - start.x).toBeGreaterThan(ctx.width);
    expect(Math.abs(end.y - start.y)).toBeLessThan(1e-9);
    // 起点在左屏外、终点接近右屏缘。
    expect(start.x).toBeLessThan(-ctx.width * 0.5);
    expect(end.x).toBeGreaterThan(ctx.width * 0.4);
    stage.dispose();
  });

  // ===== 与 bow 的区分：发射加速段 =====

  it('区分 bow·spear 有发射加速段（进度二阶差分为正），bow 程减速', () => {
    // spear 加速段：位置曲线二阶差分恒为正。
    const p: number[] = [];
    for (let i = 0; i <= 8; i += 1) p.push(spearProgress(flightT(ACCEL_FRAC * (i / 8))));
    const d1 = p.slice(1).map((v, i) => v - p[i]);
    const d2 = d1.slice(1).map((v, i) => v - d1[i]);
    expect(d2.length).toBeGreaterThan(4);
    for (let i = 0; i < d2.length; i += 1) {
      expect(d2[i], `加速段第 ${i} 个二阶差分应为正: ${d2[i].toExponential(2)}`).toBeGreaterThan(0);
    }
    // 同一采样方式下 bow 的箭：二阶差分恒为负（对照组，规格明写的差异）。
    const bp: number[] = [];
    for (let i = 0; i <= 8; i += 1) {
      bp.push(arrowProgress(DRAW_END + (FLIGHT_END - DRAW_END) * ACCEL_FRAC * (i / 8)));
    }
    const bd1 = bp.slice(1).map((v, i) => v - bp[i]);
    const bd2 = bd1.slice(1).map((v, i) => v - bd1[i]);
    for (let i = 0; i < bd2.length; i += 1) {
      expect(bd2[i], `bow 同段应减速: ${bd2[i].toExponential(2)}`).toBeLessThan(0);
    }
    // 巡航段转为减速：加速只在前段，不是全程越来越快。
    const q: number[] = [];
    for (let i = 0; i <= 8; i += 1) {
      q.push(spearProgress(flightT(ACCEL_FRAC + (1 - ACCEL_FRAC) * (i / 8))));
    }
    const e1 = q.slice(1).map((v, i) => v - q[i]);
    const e2 = e1.slice(1).map((v, i) => v - e1[i]);
    for (let i = 0; i < e2.length; i += 1) {
      expect(e2[i], `巡航段第 ${i} 应减速`).toBeLessThan(0);
    }
  });

  it('区分 bow 续·速度剖面先升后降，峰值落在加速段末端', () => {
    const ks: number[] = [];
    for (let i = 0; i <= 20; i += 1) ks.push(i / 20);
    const vs = ks.map(speedShape);
    const peak = Math.max(...vs);
    const peakK = ks[vs.indexOf(peak)];
    expect(peakK).toBeCloseTo(ACCEL_FRAC, 2);
    // 离手速度显著低于峰值——「加速」不是从满速开始的微调。
    expect(vs[0]).toBeLessThan(peak * 0.5);
    // 末速低于峰值但高于离手速度：巡航减速幅度小于发射加速幅度。
    expect(vs[vs.length - 1]).toBeLessThan(peak);
    expect(vs[vs.length - 1]).toBeGreaterThan(vs[0]);
  });

  // ===== 互动①：螺旋气流在发射加速段收束 =====

  it('互动①·加速段螺旋半径单调减小（收束与速度负相关）', () => {
    const { stage, ctx } = build();
    const mote = motes(ctx.root)[3];
    const radii: number[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = flightT(ACCEL_FRAC * (i / 8));
      at(stage, t);
      radii.push(spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).radius);
    }
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i], `加速段第 ${i} 段半径未收紧: ${radii.map((n) => n.toFixed(2)).join(',')}`)
        .toBeLessThan(radii[i - 1]);
    }
    // 收束幅度下限：末段至少比初段紧 30%，微动不算「收束」。
    expect(radii[radii.length - 1]).toBeLessThan(radii[0] * 0.7);
    stage.dispose();
  });

  // 判决性证据：收束吃的是**速度**而不是时间。巡航段速度回落，
  // 半径必须**回张**——时间的单调函数做不到这一点。
  it('互动①·巡航减速段半径回张（因果是速度，不是时间）', () => {
    const { stage, ctx } = build();
    const mote = motes(ctx.root)[3];
    const read = (k: number): number => {
      at(stage, flightT(k));
      return spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).radius;
    };
    const tightest = read(ACCEL_FRAC);
    const cruise: number[] = [];
    for (let i = 1; i <= 6; i += 1) cruise.push(read(ACCEL_FRAC + (1 - ACCEL_FRAC) * (i / 6) * 0.98));
    for (let i = 1; i < cruise.length; i += 1) {
      expect(cruise[i], `巡航段第 ${i} 未回张`).toBeGreaterThan(cruise[i - 1]);
    }
    expect(cruise[0]).toBeGreaterThan(tightest);
    stage.dispose();
  });

  // 最强的一条：加速段与巡航段各有一个速度 = 0.8 的时刻，
  // 两处半径必须**相等**。若半径含任何时间项，两者不可能相等。
  it('互动①·同速度必同半径（半径是速度的函数，与时刻无关）', () => {
    const { stage, ctx } = build();
    const mote = motes(ctx.root)[5];
    const target = 0.8;
    // 解 speedShape(k) = 0.8 的两个根。
    const kAccel = ACCEL_FRAC * ((target - 0.3) / 0.7);
    const kCruise = ACCEL_FRAC + (1 - ACCEL_FRAC) * ((1 - target) / 0.24);
    expect(speedShape(kAccel)).toBeCloseTo(target, 9);
    expect(speedShape(kCruise)).toBeCloseTo(target, 9);
    expect(kCruise).toBeGreaterThan(kAccel + 0.4);

    at(stage, flightT(kAccel));
    const rA = spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).radius;
    at(stage, flightT(kCruise));
    const rB = spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).radius;
    expect(rB, `加速段 ${rA.toFixed(6)} vs 巡航段 ${rB.toFixed(6)}`).toBeCloseTo(rA, 6);
    // 而两处的**沿杆位置**必须显著不同——否则「同半径」是因为整体没动。
    at(stage, flightT(kAccel));
    const aA = spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).along;
    at(stage, flightT(kCruise));
    const aB = spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).along;
    expect(Math.abs(aB - aA)).toBeGreaterThan(10);
    stage.dispose();
  });

  // ===== M8 变异抓出的缺口：累计量必须是速率的原函数 =====
  //
  // 起初这里只有「转角单调 + 稀疏密集等价」，于是把 `swirlSpin` 换成
  // 「当帧速度快照 × 已过时间」时**九条断言全绿**——那个写法同样是 t 的
  // 闭式函数（等价性过关）、同样单调（螺旋性过关），但它的导数比真速率
  // 多出一项 v′·k，在加速段偏差四成，物理上就是「气流的转速由它自己的
  // 历史平均决定」而不是由当帧来流决定。修法不是调阈值，而是把
  // **速率**独立导出成真值，并断言累计量确实是它的原函数。
  it('累计转角是当帧角速度的原函数（不是速度快照 × 已过时间）', () => {
    // 中心差分逼近 d(swirlSpin)/dt，与 swirlRate 逐点比对。
    // 注意量纲：spin 对**归一化幕**求导要再除以场景秒数才是 rad/s。
    const h = 1e-5;
    for (const k of [0.05, 0.15, 0.3, 0.44, 0.5, 0.7, 0.9]) {
      const t = flightT(k);
      const numeric = (swirlSpin(t + h) - swirlSpin(t - h)) / (2 * h) / SPEAR_SPAN_S;
      const analytic = swirlRate(t);
      expect(numeric, `k=${k} 转角导数 ${numeric.toFixed(4)} ≠ 角速度 ${analytic.toFixed(4)}`)
        .toBeCloseTo(analytic, 4);
    }
    // 后掠同理：累计后掠必须是当帧后掠速率的原函数。
    for (const k of [0.1, 0.35, 0.6, 0.85]) {
      const t = flightT(k);
      const numeric = (swirlBackwash(t + h) - swirlBackwash(t - h)) / (2 * h) / SPEAR_SPAN_S;
      expect(numeric, `k=${k} 后掠导数`).toBeCloseTo(slipRate(t), 4);
    }
    // 且速率真的随来流变化（不是常数——常数也能通过原函数检查）。
    const rates = [0.05, 0.2, 0.44].map((k) => swirlRate(flightT(k)));
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i], `加速段角速度未随来流上升`).toBeGreaterThan(rates[i - 1]);
    }
    // 巡航减速段角速度回落——速率吃的是当帧速度，不是单调的时间。
    expect(swirlRate(flightT(0.95))).toBeLessThan(swirlRate(flightT(ACCEL_FRAC)));
  });

  it('角速度与后掠速率都仿射地吃来流速度（同速度必同速率）', () => {
    const target = 0.8;
    const kA = ACCEL_FRAC * ((target - 0.3) / 0.7);
    const kB = ACCEL_FRAC + (1 - ACCEL_FRAC) * ((1 - target) / 0.24);
    expect(swirlRate(flightT(kB))).toBeCloseTo(swirlRate(flightT(kA)), 9);
    expect(slipRate(flightT(kB))).toBeCloseTo(slipRate(flightT(kA)), 9);
    // 量纲检查：整幕累计转角落在「几圈」的量级，不是每秒十几圈的荒唐值
    // （wind 场景吃过 `short * 系数` 的亏：81rad/s ≈ 每秒 13 圈）。
    const total = swirlSpin(HIT_AT);
    expect(total / (Math.PI * 2)).toBeGreaterThan(1.5);
    expect(total / (Math.PI * 2)).toBeLessThan(6);
  });

  it('互动①·收束系数纯函数与速度严格负相关', () => {
    const speeds = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const scales = speeds.map(spiralRadiusScale);
    for (let i = 1; i < scales.length; i += 1) {
      expect(scales[i], `速度 ${speeds[i]} 的收束未更紧`).toBeLessThan(scales[i - 1]);
    }
    // 满速时贴杆到 40% 以下，静止时接近满张。
    expect(scales[scales.length - 1]).toBeLessThan(0.4);
    expect(scales[0]).toBe(1);
  });

  // ===== 互动②：命中时气流断裂 =====

  // 对齐检查针对**整条曲线**：换一个命中时刻，断裂曲线必须整体平移。
  // 只比一个峰值时刻的差值，自跑曲线也能蒙混（本项目实测差 0.011 即过关）。
  it('互动②·气流连续性曲线随命中时刻整体平移（不是自跑的定时器）', () => {
    const probes: number[] = [];
    for (let i = -6; i <= 12; i += 1) probes.push(i * (BREAK_SPAN / 4));

    const curveAt = (hit: number): number[] => probes.map((d) => airflowContinuity(hit + d, hit));
    const ref = curveAt(HIT_AT);
    // 命中时刻挪到三个完全不同的位置，曲线形状必须逐点完全一致。
    for (const hit of [0.3, 0.5, 0.92]) {
      const moved = curveAt(hit);
      for (let i = 0; i < ref.length; i += 1) {
        expect(moved[i], `hit=${hit} 第 ${i} 点形状变了`).toBeCloseTo(ref[i], 12);
      }
    }
    // 断裂前恒为 1（完整涡管），断裂后归零且不恢复。
    expect(airflowContinuity(HIT_AT - 0.2)).toBe(1);
    expect(airflowContinuity(HIT_AT)).toBe(1);
    expect(airflowContinuity(HIT_AT + BREAK_SPAN * 0.5)).toBeCloseTo(0.5, 6);
    expect(airflowContinuity(HIT_AT + BREAK_SPAN)).toBe(0);
    expect(airflowContinuity(0.99)).toBe(0);
    // 断裂是「骤降」：BREAK_SPAN 不足飞行段的二十分之一。
    expect(BREAK_SPAN).toBeLessThan(FLIGHT_SPAN / 20);
  });

  it('互动②·命中瞬间螺旋半径突变暴张（连续性被打断的可见后果）', () => {
    const { stage, ctx } = build();
    const mote = motes(ctx.root)[7];
    const read = (t: number): number => {
      at(stage, t);
      return spiralOf(mote, tipX(ctx.root), pathYOf(ctx.root)).radius;
    };
    // 命中前的相邻两帧：半径变化平缓。
    const preA = read(HIT_AT - BREAK_SPAN * 1.6);
    const preB = read(HIT_AT - BREAK_SPAN * 0.6);
    const smoothStep = Math.abs(preB - preA);
    // 跨过命中点的同等时长：半径必须跳一大步。
    const post = read(HIT_AT + BREAK_SPAN);
    const jump = post - preB;
    expect(jump, '命中后半径未暴张').toBeGreaterThan(0);
    // 「突变」的判据：同等时长内的变化量比命中前大一个数量级。
    expect(jump, `平缓段 ${smoothStep.toFixed(4)} / 跨命中 ${jump.toFixed(4)}`)
      .toBeGreaterThan(smoothStep * 10);
    stage.dispose();
  });

  it('互动②·气流亮度与半径共用同一份连续性真值（不是两条巧合曲线）', () => {
    const { stage, ctx } = build();
    const list = motes(ctx.root);
    // 断裂完成后：整层气流熄灭（continuity=0 直接乘进 opacity）。
    at(stage, HIT_AT + BREAK_SPAN);
    for (const mote of list) {
      expect(opacity(mote), `${mote.name} 断裂后仍亮`).toBe(0);
    }
    // 断裂中途：亮度恰为「同速度下未断裂亮度」的一半。
    at(stage, HIT_AT + BREAK_SPAN * 0.5);
    const half = opacity(list[0]);
    at(stage, HIT_AT);
    const full = opacity(list[0]);
    expect(full).toBeGreaterThan(0);
    // 连续性从 1 → 0.5，其余因子（速度、幕系数）在这 0.01 幕内几乎不变。
    expect(half / full).toBeGreaterThan(0.44);
    expect(half / full).toBeLessThan(0.56);
    stage.dispose();
  });

  it('互动②·雾化细尘发射率在命中后骤降（与断裂同源）', () => {
    const { stage, ctx } = build();
    // 发射锚点是 quarks emitter 的场景侧镜像（emitter 本体会被摘走）。
    at(stage, flightT(0.5));
    const flying = node(ctx.root, 'mist-anchor').position.clone();
    // 锚点必须跟在矛尾（枪尖后方）。
    expect(flying.x).toBeLessThan(tipX(ctx.root));
    at(stage, 0.95);
    // 命中后锚点停在靶板处（矛不再前进）。
    const stuck = node(ctx.root, 'mist-anchor').position.clone();
    expect(stuck.x).toBeGreaterThan(flying.x);
    at(stage, 0.99);
    expect(node(ctx.root, 'mist-anchor').position.x).toBeCloseTo(stuck.x, 6);
    stage.dispose();
  });

  // ===== 规格元素⑤：矛杆震动是驻波 =====

  it('元素⑤·矛杆驻波两端固定（端点位移恒为零，中段有波腹）', () => {
    // 两端固定：枪头端（x=0）与尾镦端（x=1）在**任意时刻**位移都为零。
    for (const t of [LAUNCH_END + 0.01, 0.4, HIT_AT + 0.02, 0.95]) {
      expect(shaftDisplacement(0, t), `t=${t} 枪头端不该动`).toBeCloseTo(0, 12);
      expect(shaftDisplacement(1, t), `t=${t} 尾镦端不该动`).toBeCloseTo(0, 12);
    }
    // 中段必须真的在动，否则「端点为零」只是整条弦不动。
    let midPeak = 0;
    for (let i = 0; i <= 60; i += 1) {
      midPeak = Math.max(midPeak, Math.abs(shaftDisplacement(0.4, LAUNCH_END + i * 0.004)));
    }
    expect(midPeak, '杆中段没有波腹').toBeGreaterThan(0.3);
  });

  it('元素⑤·运行期驻波珠首末两颗恒在轴上，中间珠离轴摆动', () => {
    const { stage, ctx } = build();
    const beads = collectExact(ctx.root, 'flexbead');
    let midMax = 0;
    for (const t of [LAUNCH_END + 0.005, LAUNCH_END + 0.02, 0.45, HIT_AT + 0.01, HIT_AT + 0.05]) {
      at(stage, t);
      expect(beads[0].position.y, `t=${t} 首珠离轴`).toBeCloseTo(0, 9);
      expect(beads[beads.length - 1].position.y, `t=${t} 末珠离轴`).toBeCloseTo(0, 9);
      for (let i = 1; i < beads.length - 1; i += 1) {
        midMax = Math.max(midMax, Math.abs(beads[i].position.y));
      }
    }
    expect(midMax, '中间珠从未离轴').toBeGreaterThan(1);
    // 珠沿杆均匀排布且顺序固定（枪头端 x 最大）。
    at(stage, 0.5);
    for (let i = 1; i < beads.length; i += 1) {
      expect(beads[i].position.x).toBeLessThan(beads[i - 1].position.x);
    }
    stage.dispose();
  });

  it('元素⑤·驻波由掷出与命中两次激励（不掷不震，命中再激励）', () => {
    // 离手前不震。
    expect(shaftRing(0)).toBe(0);
    expect(shaftRing(LAUNCH_END - 0.01)).toBe(0);
    // 离手瞬间起振并衰减。
    expect(shaftRing(LAUNCH_END)).toBeCloseTo(1, 6);
    const decayed = shaftRing(HIT_AT - 0.02);
    expect(decayed).toBeLessThan(0.05);
    // 命中再激励：包络重新抬起，且比命中前的残余高一个数量级。
    expect(shaftRing(HIT_AT)).toBeCloseTo(1, 6);
    expect(shaftRing(HIT_AT)).toBeGreaterThan(decayed * 10);
    // 命中后同样衰减，末幕已趋静。
    expect(shaftRing(0.99)).toBeLessThan(shaftRing(HIT_AT + 0.05));
  });

  // ===== 稀疏 vs 密集 update 等价（经验③）=====

  it('稀疏与密集 update 结果一致（闭式解，不依赖调用历史）', () => {
    const sparse = build();
    // 稀疏：一步跨 0.35 幕（420ms）。
    at(sparse.stage, 0.35);
    at(sparse.stage, 0.7);
    const sparseSnap = visualSnapshot(sparse.ctx.root);

    const dense = build();
    // 密集：每 1/72 幕推进一次，最终落在同一个 t。
    for (let i = 1; i <= 72; i += 1) at(dense.stage, (i / 72) * 0.7);
    const denseSnap = visualSnapshot(dense.ctx.root);

    expect(sparseSnap).toBe(denseSnap);
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('稀疏与密集下螺旋的绕杆角度与后掠距离都一致', () => {
    const sparse = build();
    at(sparse.stage, 0.72);
    const a = motes(sparse.ctx.root).map((m) =>
      spiralOf(m, tipX(sparse.ctx.root), pathYOf(sparse.ctx.root)));

    const dense = build();
    for (let i = 1; i <= 120; i += 1) at(dense.stage, (i / 120) * 0.72);
    const b = motes(dense.ctx.root).map((m) =>
      spiralOf(m, tipX(dense.ctx.root), pathYOf(dense.ctx.root)));

    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(b[i].angle, `第 ${i} 颗角度`).toBeCloseTo(a[i].angle, 9);
      expect(b[i].along, `第 ${i} 颗后掠`).toBeCloseTo(a[i].along, 6);
      expect(b[i].radius, `第 ${i} 颗半径`).toBeCloseTo(a[i].radius, 9);
    }
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  // ===== 气流云与靶板裂纹 =====

  it('元素⑦·尘云各段依次被撕开（跟着矛走，不是整条齐撕）', () => {
    const { stage, ctx } = build();
    at(stage, flightT(0.4));
    const tear = tearArray(ctx.root);
    expect(tear).toHaveLength(TEAR_SEGMENTS);
    // 前段（矛已过）已撕开。
    expect(tear[0], `前段 ${tear.slice(0, 3).map((n) => n.toFixed(3)).join(',')}`)
      .toBeGreaterThan(0.3);
    // 末段（矛未到）严格为零。
    for (const v of tear.slice(-2)) expect(v).toBe(0);
    // 沿路单调：越靠前撕得越久也越宽。
    const nonZero = tear.filter((v) => v > 0);
    for (let i = 1; i < nonZero.length; i += 1) {
      expect(nonZero[i]).toBeLessThan(nonZero[i - 1]);
    }
    stage.dispose();
  });

  // 与 bow 云缝的分界：那边张开后**回落**（可逆），这里只会越撕越宽。
  it('元素⑦·尘云裂口不愈合（与 bow 云缝的可逆形变相反）', () => {
    const passAt = 0.35;
    const widths: number[] = [];
    for (let i = 0; i <= 40; i += 1) widths.push(tearWidth(passAt + i * 0.015, passAt));
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i], `第 ${i} 点收窄了（愈合）`).toBeGreaterThan(widths[i - 1]);
    }
    expect(tearWidth(0.2, 0.35)).toBe(0);
    // 末幕仍敞开。
    expect(widths[widths.length - 1]).toBeGreaterThan(0.9);
  });

  it('元素⑦续·尘团被推离路轴且不回位', () => {
    const { stage, ctx } = build();
    const puff = node(ctx.root, 'tearpuff-2');
    at(stage, 0.28);
    const base = Math.abs(puff.position.y - pathYOf(ctx.root));
    const offs: number[] = [];
    for (const t of [0.5, 0.65, 0.8, 0.95]) {
      at(stage, t);
      offs.push(Math.abs(puff.position.y - pathYOf(ctx.root)));
    }
    for (let i = 1; i < offs.length; i += 1) {
      expect(offs[i], `第 ${i} 段回位了`).toBeGreaterThan(offs[i - 1]);
    }
    expect(offs[0]).toBeGreaterThan(base);
    stage.dispose();
  });

  it('元素⑥·靶板裂纹只在命中后出现，前沿单调外扩', () => {
    const { stage, ctx } = build();
    at(stage, flightT(0.9));
    expect(uniformOf(node(ctx.root, 'target-board'), 'uFront'), '命中前不该有裂纹').toBe(0);
    const fronts: number[] = [];
    for (let i = 1; i <= 5; i += 1) {
      at(stage, HIT_AT + (1 - HIT_AT) * (i / 5));
      fronts.push(uniformOf(node(ctx.root, 'target-board'), 'uFront'));
    }
    for (let i = 1; i < fronts.length; i += 1) {
      expect(fronts[i], `裂纹前沿第 ${i} 段未外扩`).toBeGreaterThan(fronts[i - 1]);
    }
    expect(fronts[fronts.length - 1]).toBeGreaterThan(0.9);
    stage.dispose();
  });

  it('元素④·命中震荡三环错峰，且仅在第三幕出现', () => {
    const { stage, ctx } = build();
    at(stage, flightT(0.8));
    for (let i = 0; i < SHOCK_RINGS; i += 1) {
      expect(opacity(node(ctx.root, `shockring-${i}`)), `命中前 shockring-${i}`).toBe(0);
    }
    const peakAt = new Array<number>(SHOCK_RINGS).fill(0);
    const peaks = new Array<number>(SHOCK_RINGS).fill(0);
    for (let i = 0; i <= 40; i += 1) {
      const t = HIT_AT + (1 - HIT_AT) * (i / 40);
      at(stage, t);
      for (let r = 0; r < SHOCK_RINGS; r += 1) {
        const o = opacity(node(ctx.root, `shockring-${r}`));
        if (o > peaks[r]) { peaks[r] = o; peakAt[r] = t; }
      }
    }
    for (let r = 0; r < SHOCK_RINGS; r += 1) {
      expect(peaks[r], `shockring-${r} 未亮`).toBeGreaterThan(0.1);
    }
    // 错峰：三环峰值时刻两两不同。
    expect(new Set(peakAt).size).toBe(SHOCK_RINGS);
    stage.dispose();
  });

  it('元素③⑧·破空纹与枪头闪光跟着枪尖，且强度随速度', () => {
    const { stage, ctx } = build();
    // 破空纹贴在矛身（枪尖后方）。
    at(stage, flightT(0.5));
    const rip = node(ctx.root, 'ripwind-streaks');
    expect(rip.position.x).toBeLessThan(tipX(ctx.root));
    expect(rip.position.y).toBeCloseTo(pathYOf(ctx.root), 9);
    // 闪光节点就在枪尖上。
    const slow = uniformOf(rip, 'uSpeed');
    at(stage, flightT(ACCEL_FRAC));
    expect(uniformOf(rip, 'uSpeed'), '峰速时纹应更强').toBeGreaterThan(slow);
    // 离手前与命中后都无破空纹（矛不在飞）。
    at(stage, 0.1);
    expect(uniformOf(rip, 'uAlpha')).toBe(0);
    at(stage, 0.95);
    expect(uniformOf(rip, 'uAlpha')).toBe(0);
    stage.dispose();
  });

  it('spearPassTime 是 spearProgress 的解析反解（自洽）', () => {
    for (const p of [0.05, 0.2, 0.29, 0.4, 0.6, 0.8, 0.95]) {
      expect(spearProgress(spearPassTime(p)), `progress ${p}`).toBeCloseTo(p, 9);
    }
    expect(spearPassTime(0)).toBe(LAUNCH_END);
    expect(spearPassTime(1)).toBe(HIT_AT);
  });

  it('airflowSpeed 命中后停在末速（不归零，避免污染断裂取证）', () => {
    expect(airflowSpeed(0.95)).toBeCloseTo(speedShape(1), 9);
    expect(airflowSpeed(0.1)).toBeCloseTo(speedShape(0), 9);
  });

  // ===== 三幕 / 降档 / 释放 =====

  it('三幕视觉状态两两不同', () => {
    const { stage, ctx } = build();
    at(stage, SPEAR_ACT1_END * 0.6);
    const a1 = visualSnapshot(ctx.root);
    at(stage, (SPEAR_ACT1_END + SPEAR_ACT2_END) / 2);
    const a2 = visualSnapshot(ctx.root);
    at(stage, 0.97);
    const a3 = visualSnapshot(ctx.root);
    expect(a1).not.toBe(a2);
    expect(a2).not.toBe(a3);
    expect(a1).not.toBe(a3);
    stage.dispose();
  });

  it('降档后八元素仍在，只有粒子密度严格变少', () => {
    const hi = build({ quality: 'cinematic' });
    at(hi.stage, 0.5, 'cinematic');
    const lo = build({ quality: 'medium' });
    at(lo.stage, 0.5, 'medium');

    for (const name of NAMED_ELEMENTS) {
      expect(names(hi.ctx.root), `cinematic 缺 ${name}`).toContain(name);
      expect(names(lo.ctx.root), `medium 缺 ${name}`).toContain(name);
    }
    // 螺旋气流点严格变少但不消失（scaledCount 的下限）。
    const hiMotes = motes(hi.ctx.root).length;
    const loMotes = motes(lo.ctx.root).length;
    expect(loMotes).toBeLessThan(hiMotes);
    expect(loMotes, '螺旋气流在 medium 档消失').toBeGreaterThan(0);
    // 结构件数量不随档位变化（降档只减密度）。
    expect(collectExact(lo.ctx.root, 'shockring')).toHaveLength(SHOCK_RINGS);
    expect(collectExact(lo.ctx.root, 'flexbead')).toHaveLength(FLEX_BEADS);
    expect(collectExact(lo.ctx.root, 'tearpuff')).toHaveLength(TEAR_PUFFS);
    // 最低档也保留元素。
    const low = build({ quality: 'low' });
    at(low.stage, 0.5, 'low');
    for (const name of NAMED_ELEMENTS) {
      expect(names(low.ctx.root), `low 缺 ${name}`).toContain(name);
    }
    expect(motes(low.ctx.root).length).toBeGreaterThan(0);
    expect(motes(low.ctx.root).length).toBeLessThan(loMotes);

    hi.stage.dispose(); lo.stage.dispose(); low.stage.dispose();
  });

  it('dispose 幂等：场景树摘净、螺旋容器清空且脱离父级、再次 update 不抛', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const sheath = node(ctx.root, 'swirl-sheath');
    const body = node(ctx.root, 'spear-body');
    expect(ctx.root.children.length).toBeGreaterThan(0);
    expect(sheath.children.length).toBeGreaterThan(0);
    expect(body.children.length).toBeGreaterThan(0);

    stage.dispose();
    // res.dispose() 会把整个 group 摘走。
    expect(ctx.root.children).toHaveLength(0);
    // 两个**嵌套**容器也必须清空且脱离父级：res.dispose 只 clear 自己的
    // group，嵌套容器不单独登记回收就会连着子节点一起留在内存里。
    expect(sheath.children).toHaveLength(0);
    expect(sheath.parent).toBeNull();
    expect(body.children).toHaveLength(0);
    expect(body.parent).toBeNull();

    expect(() => at(stage, 0.8)).not.toThrow();
    expect(() => stage.dispose()).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });
});

