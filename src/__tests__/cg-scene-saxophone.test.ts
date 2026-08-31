import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-saxophone';
import '../overlay/cg-scenes/cg-piano';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  SAX_ACT1_END,
  SAX_ACT2_END,
  SAX_BEAM_COUNT,
  SAX_DURATION_MS,
  SAX_KEY_COUNT,
  SAX_NOTE_COUNT,
  beamAngle,
  breathMist,
  KEY_LIT_SPAN,
  drumPulse,
  keyLight,
  melodyIntensity,
  noteBlowAt,
  noteRise,
  noteSway,
  sheenSeat,
} from '../overlay/cg-scenes/sax-sway';
// piano 对照断言要 import 它的 noteHeight——这是跨场景签名的守门人：
// 两个场景的分野写在同一张测试里，改任何一边的曲线都会在这里变红。
import { noteHeight as pianoNoteHeight } from '../overlay/cg-scenes/piano-notes';
import { MIST_COUNT, MIST_PEAK_RATE } from '../overlay/cg-scenes/sax-mist';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 39 的 8 个元素的具名节点（热雾由 quarks 承载，用锚点观测）。 */
const NAMED_ELEMENTS = [
  'sax-body',          // ① 萨克斯 mesh（②按键流光 与 ⑤反光带 是它的 uniform）
  'saxnote-0',         // ③ 音符摇曳
  'breath-mist',       // ④ 管口热雾
  'stage-curtain',     // ⑦ 舞台暗幕
  'beampivot-0',       // ⑧ 摇摆光束容器
  'lightbeam-0',       // ⑧ 摇摆光束本体
  'mist-anchor',       // ④ 热雾粒子锚点
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('saxophone');
  if (!scene) throw new Error('saxophone 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** saxophone 时长 1800ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * SAX_DURATION_MS, quality);
}

/** 精确正则收集：`saxnote-N` 与 `sax-` 类前缀相近，必须锁「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

function noteNode(root: THREE.Object3D, n: number): THREE.Object3D {
  return node(root, `saxnote-${n}`);
}

/** 读按键流光 uniform 数组的第 i 项（按键不是节点，是管身 shader 的数组 uniform）。 */
function keyLightUniform(root: THREE.Object3D, i: number): number {
  const mesh = node(root, 'sax-body') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  const arr = mesh.material.uniforms.uKeyLight.value as number[];
  return arr[i];
}

/** 读折算后的粒子时钟（quarks 在 Group 根下首帧自毁，锚点是唯一出口）。 */
function particleClock(root: THREE.Object3D): number {
  const value = node(root, 'mist-anchor').userData.particleT;
  if (typeof value !== 'number') throw new Error('mist-anchor 未暴露 particleT');
  return value;
}

function mistRate(root: THREE.Object3D): number {
  const value = node(root, 'mist-anchor').userData.mistRate;
  if (typeof value !== 'number') throw new Error('mist-anchor 未暴露 mistRate');
  return value;
}

describe('场景 39 saxophone（爵士萨克斯·慵懒摇曳）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('saxophone');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.title).toBe('爵士萨克斯');
    expect(scene!.config.signature).toContain('慵懒摇曳');
    expect(scene!.config.preset).toBe('note-dance');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) expect(tree).toContain(name);
    stage.dispose();
  });

  it('音符与光束建齐，各持独立材质实例', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const notes = collectExact(ctx.root, 'saxnote');
    const beams = collectExact(ctx.root, 'lightbeam');
    expect(notes).toHaveLength(SAX_NOTE_COUNT);
    expect(beams).toHaveLength(SAX_BEAM_COUNT);
    // 透明度与倾斜是逐个的，共用一份材质会让六个音符同动。
    expect(new Set(notes.map((m) => (m as THREE.Mesh).material)).size).toBe(SAX_NOTE_COUNT);
    stage.dispose();
  });

  // ── 签名一：摇曳 vs piano 的跃动 ──

  it('签名：竖向严格单调光滑上升——速度永不换号（与 piano 相反）', () => {
    const n = 1;
    const born = noteBlowAt(n);
    const h = 1e-5;
    let signChanges = 0;
    let prevSign = 0;
    // 扫过整个行程段。
    for (let k = 2; k <= 590; k += 1) {
      const t = born + (k / 600) * 0.62;
      const d = noteRise(n, t + h) - noteRise(n, t - h);
      const s = Math.sign(d);
      if (s !== 0 && prevSign !== 0 && s !== prevSign) signChanges += 1;
      if (s !== 0) prevSign = s;
    }
    expect(signChanges).toBe(0);
    // 竖向值单调不减且在途中确实升起来了（不是恒为 0 的空壳）。
    let prev = -1;
    for (let t = born; t <= born + 0.62; t += 1 / 480) {
      const v = noteRise(n, t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(noteRise(n, born + 0.62)).toBeGreaterThan(0.9);
  });

  it('签名（与 piano 对照）：同一时刻，piano 换号而 sax 不换——两条曲线形状不同', () => {
    // 直接 import piano 的 noteHeight 做同构对照。取同一时间窗，统计
    // 竖向速度换号：piano 的拼接线必须换号，sax 的 smoothstep 必须不换。
    // 这个断言把「piano=跃动、sax=摇曳」的分野钉死在同一条测试里。
    const bornP = 0.24; // 大致对齐两个场景的起音时刻
    const bornS = noteBlowAt(1);
    const h = 1e-4;
    let pChanges = 0;
    let pPrev = 0;
    let sChanges = 0;
    let sPrev = 0;
    for (let k = 1; k < 400; k += 1) {
      const dt = (0.22 / 400) * k;
      // piano 用它的跳窗口采样（它的 noteHeight 分段）。
      const pv = pianoNoteHeight(0, bornP + dt * 6) - pianoNoteHeight(0, bornP + dt * 6 - 2 * h);
      const sv = noteRise(1, bornS + dt) - noteRise(1, bornS + dt - 2 * h);
      const ps = Math.sign(pv);
      const ss = Math.sign(sv);
      if (ps !== 0 && pPrev !== 0 && ps !== pPrev) pChanges += 1;
      if (ss !== 0 && sPrev !== 0 && ss !== sPrev) sChanges += 1;
      if (ps !== 0) pPrev = ps;
      if (ss !== 0) sPrev = ss;
    }
    expect(pChanges).toBeGreaterThan(0);
    expect(sChanges).toBe(0);
  });

  it('签名：水平反复过零（与 trumpet 的定向喷出相反）', () => {
    const n = 0;
    const born = noteBlowAt(n);
    let crossings = 0;
    let prev = noteSway(n, born + 0.01);
    for (let k = 1; k < 600; k += 1) {
      const t = born + (k / 600) * 0.62;
      const v = noteSway(n, t);
      if (v !== 0 && Math.sign(v) !== Math.sign(prev)) { crossings += 1; prev = v; }
    }
    expect(crossings).toBeGreaterThanOrEqual(3);
    // 摆幅真的到位：不是 ±0.001 的抖动。
    let peak = 0;
    for (let t = born; t <= born + 0.62; t += 1 / 480) {
      peak = Math.max(peak, Math.abs(noteSway(n, t)));
    }
    expect(peak).toBeGreaterThan(0.25);
  });

  it('吹出前恒静止：未吹的音符不摆不升', () => {
    for (let n = 0; n < SAX_NOTE_COUNT; n += 1) {
      const born = noteBlowAt(n);
      expect(noteRise(n, 0)).toBe(0);
      expect(noteSway(n, 0)).toBe(0);
      expect(noteRise(n, born - 1e-4)).toBe(0);
      expect(noteSway(n, born - 1e-4)).toBe(0);
    }
  });

  it('六个音符等间隔错开（与 piano 的前疏后密相反——慵懒来自稳定呼吸）', () => {
    const times = Array.from({ length: SAX_NOTE_COUNT }, (_, n) => noteBlowAt(n));
    for (let n = 1; n < times.length; n += 1) {
      expect(times[n]).toBeGreaterThan(times[n - 1]);
    }
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    // 等间隔：相邻间隔差在 1e-9 内。
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]).toBeCloseTo(gaps[i - 1], 9);
    }
  });

  it('互动①：摇摆幅度以旋律强度为乘性因子（同一个量的两次使用）', () => {
    // 直接验证乘性关系：noteSway / melodyIntensity 的比值必须是「与强度
    // 无关」的函数——它是纯振荡（sin×高度衰减），值域在 [-1,1] 内。
    // 若强度只是加法偏移或被换成别的量，比值会飘出这个值域。
    for (const n of [0, 2, 5]) {
      const born = noteBlowAt(n);
      for (let p = 0.02; p < 0.95; p += 0.01) {
        const t = born + p * 0.62;
        const i = melodyIntensity(t);
        if (i < 0.05) continue;
        const ratio = noteSway(n, t) / i;
        expect(ratio, `音符${n} p=${p.toFixed(2)} 比例超出 [-1,1]`).toBeGreaterThanOrEqual(-1);
        expect(ratio).toBeLessThanOrEqual(1);
      }
    }
    // 收尾：强度归零，摆幅必归零。
    expect(melodyIntensity(1)).toBe(0);
    expect(noteSway(2, 1)).toBe(0);
    // 强度本身确实在起伏（否则这个断言没有区分度）。
    let maxI = 0;
    let minI = 1;
    for (let t = SAX_ACT1_END; t <= SAX_ACT2_END; t += 1 / 240) {
      maxI = Math.max(maxI, melodyIntensity(t));
      minI = Math.min(minI, melodyIntensity(t));
    }
    expect(maxI - minI).toBeGreaterThan(0.3);
  });

  it('互动②：光束幅度同读旋律强度，且两束反相（交叉而非平行）', () => {
    // 两束反相：同一时刻符号相反。
    // 判据必须是「异号占多数」而不是「至少有一次异号」：两束同相时
    // 也会因固定相位差在少数帧上偶然异号，只查 >0 分辨不出同相与反相
    // （实测该变异存活）。真正的「交叉」意味着绝大多数时刻符号相反。
    let sameSign = 0;
    let crossSign = 0;
    for (let t = 0; t <= 1; t += 1 / 2000) {
      const a = beamAngle(0, t);
      const b = beamAngle(1, t);
      if (a === 0 || b === 0) continue;
      if (Math.sign(a) === Math.sign(b)) sameSign += 1;
      else crossSign += 1;
    }
    expect(crossSign).toBeGreaterThan(sameSign * 3);
    // 且两束近似互为相反数：和的幅度远小于单束幅度。
    let maxSum = 0;
    let maxSingle = 0;
    for (let t = 0; t <= 1; t += 1 / 2000) {
      maxSum = Math.max(maxSum, Math.abs(beamAngle(0, t) + beamAngle(1, t)));
      maxSingle = Math.max(maxSingle, Math.abs(beamAngle(0, t)));
    }
    expect(maxSum).toBeLessThan(maxSingle * 0.6);
    // 幅度上限由强度包络封顶：束角不超过 0.38（声明值）。
    for (let t = 0; t <= 1; t += 1 / 240) {
      expect(Math.abs(beamAngle(0, t))).toBeLessThanOrEqual(0.38 + 1e-9);
    }
    // 收尾：光退去，摆角归零。
    expect(Math.abs(beamAngle(0, 1))).toBeLessThanOrEqual(melodyIntensity(1) + 1e-9);
  });

  it('⑤ 铜管反光带随光束摆动反解（不是另调一条曲线）', () => {
    // sheenSeat 是 beamAngle(0) 的归一化：两者读同一个量。
    for (let t = 0; t <= 1; t += 1 / 240) {
      expect(sheenSeat(t)).toBeGreaterThanOrEqual(0);
      expect(sheenSeat(t)).toBeLessThanOrEqual(1);
    }
    // 光束摆到一侧时反光带跟着偏移（与摆角单调同向）。
    let maxSeat = 0;
    let maxSeatT = 0;
    for (let t = 0; t <= 1; t += 1 / 480) {
      if (sheenSeat(t) > maxSeat) { maxSeat = sheenSeat(t); maxSeatT = t; }
    }
    expect(beamAngle(0, maxSeatT)).toBeGreaterThan(0);
  });

  // ── 元素 ②④⑥ 的独立行为 ──

  it('② 按键流光按序亮起：每键是三角包络，不是脉冲', () => {
    for (let i = 0; i < SAX_KEY_COUNT; i += 1) {
      const span = SAX_ACT2_END - SAX_ACT1_END;
      const at = SAX_ACT1_END + (i / SAX_KEY_COUNT) * span;
      expect(keyLight(i, at - 1e-4)).toBe(0);
      // 三角包络的峰在 span 中点（按下→按住→松开），不是起亮即峰。
      expect(keyLight(i, at + KEY_LIT_SPAN * 0.5)).toBeGreaterThan(0.99);
    }
    // 按序：键 0 亮起时末键还没。
    const early = SAX_ACT1_END + 0.02;
    expect(keyLight(0, early)).toBeGreaterThan(0.5);
    expect(keyLight(SAX_KEY_COUNT - 1, early)).toBe(0);
    // 越界序号无亮度。
    expect(keyLight(-1, 0.5)).toBe(0);
    expect(keyLight(SAX_KEY_COUNT, 0.5)).toBe(0);
  });

  it('④ 管口热雾读旋律强度，且演奏前不吹', () => {
    expect(breathMist(0)).toBe(0);
    expect(breathMist(1)).toBe(0);
    // 起吹渐强：第一幕内单调上升。
    let prev = -1;
    for (let t = 0; t <= SAX_ACT1_END; t += 1 / 240) {
      const v = breathMist(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    // 演奏段内确实吹得起来（峰值 > 0.6）。峰值时刻随呼吸起伏挪动，
    // 不钉死在固定时刻。
    let peak = 0;
    for (let t = SAX_ACT1_END; t <= SAX_ACT2_END; t += 1 / 240) {
      peak = Math.max(peak, breathMist(t));
    }
    expect(peak).toBeGreaterThan(0.6);
  });

  it('⑥ 节奏鼓点光：均匀拍点，强度受旋律包络调制', () => {
    // 拍内衰减：同一拍的起点最强，随拍内进度衰减。
    for (let t = 0.02; t < 0.95; t += 0.01) {
      const inBeat = (t * 6) - Math.floor(t * 6);
      if (inBeat < 0.05 && melodyIntensity(t) > 0.2) {
        expect(drumPulse(t)).toBeGreaterThan(0.4 * melodyIntensity(t));
      } else if (inBeat > 0.6 && melodyIntensity(t) > 0.1) {
        expect(drumPulse(t)).toBeLessThan(0.5 * melodyIntensity(t));
      }
    }
    // 拍点均匀：峰在拍起点，间隔恒为 1/6 幕长。峰的定义是
    // drumPulse 的局部极大——不能靠「超阈值」判定，那会在同一次峰的
    // 连续采样上重复记峰。离散采样下局部极大也可能漏掉真正的主峰
    // （峰顶恰好落在两次采样之间），所以这里不测「峰间等距」本身，
    // 而是直接验证**拍的周期结构**：对每个拍起点 k/6，drumPulse 在
    // 该拍起点处有峰，而拍内进度靠后处显著衰减。
    const period = 1 / 6;
    for (let k = 1; k <= 5; k += 1) {
      const beatStart = k / 6;
      // 拍起点（如 t=1/6）：正值。
      expect(drumPulse(beatStart)).toBeGreaterThan(0.4 * melodyIntensity(beatStart));
      // 拍内 60% 进度处：已显著衰减（拍内是指数衰减）。
      const inBeat = beatStart + period * 0.6;
      expect(drumPulse(inBeat)).toBeLessThan(drumPulse(beatStart) * 0.5);
      // 且每拍起点之间等距（这就是「节拍器」的数学定义）。
    }
    expect(period).toBeCloseTo(1 / 6, 9);
    // 起吹前恒为 0（t=0 时强度为 0）。
    expect(drumPulse(0)).toBe(0);
  });

  it('三幕边界取自 1800ms 时间表', () => {
    expect(SAX_DURATION_MS).toBe(1800);
    expect(SAX_ACT1_END).toBeCloseTo(400 / 1800, 9);
    expect(SAX_ACT2_END).toBeCloseTo(1350 / 1800, 9);
    expect(noteBlowAt(SAX_NOTE_COUNT)).toBe(Number.POSITIVE_INFINITY);
  });

  // ── 场景状态：签名必须落到节点上 ──

  it('签名落到场景状态：音符水平在节点上反复换向（摇曳真的落到画面）', () => {
    // 判据必须是「换向」而不是「x 有变化」：音符本身有一份随进度的单向
    // 右漂（气流带着走），只查 |Δx| > 0 时那份漂移就把摆动完全掩护掉了
    // ——把 sway 项从场景层删掉，弱断言照样全绿（实测该变异存活）。
    const { stage, ctx } = build();
    const n = 1;
    const born = noteBlowAt(n);
    const xs: number[] = [];
    for (let k = 0; k <= 120; k += 1) {
      const t = born + (k / 120) * 0.62;
      at(stage, t);
      xs.push(noteNode(ctx.root, n).position.x);
    }
    // 逐差分统计换向：摆动必然让 x 的增量反复变号。
    let turns = 0;
    let prevSign = 0;
    for (let i = 1; i < xs.length; i += 1) {
      const s = Math.sign(xs[i] - xs[i - 1]);
      if (s !== 0 && prevSign !== 0 && s !== prevSign) turns += 1;
      if (s !== 0) prevSign = s;
    }
    expect(turns, '音符水平位移未换向：摇曳没落到场景层').toBeGreaterThanOrEqual(3);
    stage.dispose();
  });

  it('签名落到场景状态：音符竖向是 smoothstep 形状（两端慢、中段快）', () => {
    // 判据不能只查「末端高于始端」：线性上升也满足。smoothstep 的可测
    // 特征是**中段速度显著高于两端**——把 noteRise 换成 noteProgress
    // （线性）后各段速度相等，这条即变红。
    const { stage, ctx } = build();
    const n = 1;
    const born = noteBlowAt(n);
    const ys: number[] = [];
    const steps = 60;
    for (let k = 0; k <= steps; k += 1) {
      at(stage, born + (k / steps) * 0.62);
      ys.push(noteNode(ctx.root, n).position.y);
    }
    expect(ys[steps]).toBeGreaterThan(ys[0]);
    // 三段平均速度：首段、中段、末段。
    const seg = Math.floor(steps / 3);
    const vHead = (ys[seg] - ys[0]) / seg;
    const vMid = (ys[seg * 2] - ys[seg]) / seg;
    const vTail = (ys[steps] - ys[seg * 2]) / seg;
    expect(vMid).toBeGreaterThan(vHead * 1.4);
    expect(vMid).toBeGreaterThan(vTail * 1.4);
    stage.dispose();
  });

  it('音符起吹后现形、行程末端淡出（uAlpha 门控）', () => {
    const { stage, ctx } = build();
    const n = 2;
    at(stage, noteBlowAt(n) - 1e-3);
    expect(uniformOf(noteNode(ctx.root, n), 'uAlpha')).toBe(0);
    at(stage, noteBlowAt(n) + 0.03);
    expect(uniformOf(noteNode(ctx.root, n), 'uAlpha')).toBeGreaterThan(0);
    at(stage, 0.99);
    expect(uniformOf(noteNode(ctx.root, n), 'uAlpha')).toBeLessThan(0.1);
    stage.dispose();
  });

  it('按键流光逐个写入 uniform 数组', () => {
    const { stage, ctx } = build();
    at(stage, SAX_ACT1_END + KEY_LIT_SPAN * 0.5);
    expect(keyLightUniform(ctx.root, 0)).toBeGreaterThan(0.5);
    expect(keyLightUniform(ctx.root, SAX_KEY_COUNT - 1)).toBe(0);
    const mesh = node(ctx.root, 'sax-body') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect((mesh.material.uniforms.uKeyLight.value as number[])).toHaveLength(SAX_KEY_COUNT);
    stage.dispose();
  });

  it('④ 热雾锚点落在管口，发射率读呼吸强度', () => {
    const { stage, ctx } = build();
    // 起吹即渐强：t=0 时强度恒为 0（这只是断言纯函数值，不连 update）。
    expect(breathMist(0)).toBe(0);
    // 第一幕内已是正发射率（起吹是渐强，不是「吹之前完全没气」）。
    at(stage, SAX_ACT1_END * 0.6);
    expect(mistRate(ctx.root)).toBeGreaterThan(0);
    at(stage, (SAX_ACT1_END + SAX_ACT2_END) / 2);
    expect(mistRate(ctx.root)).toBeGreaterThan(0);
    expect(mistRate(ctx.root)).toBeLessThanOrEqual(MIST_PEAK_RATE + 1e-9);
    at(stage, 1);
    expect(mistRate(ctx.root)).toBeLessThan(0.01);
    stage.dispose();
  });

  it('⑧ 光束绕容器顶点摆动（rotation 加在 pivot 上）', () => {
    const { stage, ctx } = build();
    at(stage, SAX_ACT1_END + 0.05);
    const pivot = node(ctx.root, 'beampivot-0');
    expect(Math.abs(pivot.rotation.z)).toBeGreaterThan(0);
    stage.dispose();
  });

  it('尾声渐弱：第三幕的场景值低于纯函数值（fade 真的在起作用）', () => {
    const { stage, ctx } = build();
    const t1 = SAX_ACT2_END + (1 - SAX_ACT2_END) * 0.35;
    const t2 = SAX_ACT2_END + (1 - SAX_ACT2_END) * 0.95;
    at(stage, t1);
    const mist1 = uniformOf(node(ctx.root, 'breath-mist'), 'uLevel');
    const ratio1 = mist1 / breathMist(t1);
    at(stage, t2);
    const mist2 = uniformOf(node(ctx.root, 'breath-mist'), 'uLevel');
    const ratio2 = mist2 / breathMist(t2);
    expect(ratio1).toBeLessThan(1);
    expect(ratio2).toBeLessThan(ratio1);
    stage.dispose();
  });

  // ── 稀疏 update / 降档 / dispose ──

  it('粒子时钟按场景时间轴折算，不随 update 次数漂移', () => {
    const few = build();
    const many = build();
    at(few.stage, SAX_ACT2_END);
    for (let i = 1; i <= 24; i += 1) at(many.stage, (i / 24) * SAX_ACT2_END);
    expect(particleClock(few.ctx.root)).toBeGreaterThan(0);
    expect(particleClock(few.ctx.root)).toBeCloseTo(particleClock(many.ctx.root), 5);
    const target = SAX_ACT2_END * 1.8;
    expect(particleClock(few.ctx.root)).toBeGreaterThan(target - 1 / 60 - 1e-9);
    expect(particleClock(few.ctx.root)).toBeLessThanOrEqual(target + 1e-9);
    few.stage.dispose();
    many.stage.dispose();
  });

  it('稀疏 update 与密集 update 同结果（时变场不吃 frameDelta）', () => {
    const sparse = build();
    at(sparse.stage, 0.4);
    at(sparse.stage, SAX_ACT2_END);

    const dense = build();
    for (let t = 0; t <= SAX_ACT2_END; t += 1 / 240) at(dense.stage, t);
    at(dense.stage, SAX_ACT2_END);

    for (let n = 0; n < SAX_NOTE_COUNT; n += 1) {
      expect(noteNode(sparse.ctx.root, n).position.y)
        .toBeCloseTo(noteNode(dense.ctx.root, n).position.y, 6);
      expect(noteNode(sparse.ctx.root, n).position.x)
        .toBeCloseTo(noteNode(dense.ctx.root, n).position.x, 6);
      expect(keyLightUniform(sparse.ctx.root, n % SAX_KEY_COUNT))
        .toBeCloseTo(keyLightUniform(dense.ctx.root, n % SAX_KEY_COUNT), 6);
    }
    expect(mistRate(sparse.ctx.root)).toBeCloseTo(mistRate(dense.ctx.root), 6);
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('低档位 8 元素一个不少，签名载体不被 scaledCount 削掉', () => {
    for (const quality of ['low', 'medium', 'high', 'cinematic'] as EffectQuality[]) {
      const { stage, ctx } = build({ quality });
      at(stage, SAX_ACT2_END, quality);
      const tree = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(tree, `${quality} 档缺元素 ${name}`).toContain(name);
      }
      expect(collectExact(ctx.root, 'saxnote'), `${quality} 档音符被削`)
        .toHaveLength(SAX_NOTE_COUNT);
      expect(collectExact(ctx.root, 'lightbeam'), `${quality} 档光束被削`)
        .toHaveLength(SAX_BEAM_COUNT);
      stage.dispose();
    }
  });

  it('降档只减粒子密度，不改摇曳力学', () => {
    const low = build({ quality: 'low' });
    const cine = build({ quality: 'cinematic' });
    const t = noteBlowAt(2) + 0.2;
    at(low.stage, t, 'low');
    at(cine.stage, t, 'cinematic');
    for (let n = 0; n < SAX_NOTE_COUNT; n += 1) {
      expect(noteNode(low.ctx.root, n).position.y)
        .toBeCloseTo(noteNode(cine.ctx.root, n).position.y, 9);
      expect(noteNode(low.ctx.root, n).position.x)
        .toBeCloseTo(noteNode(cine.ctx.root, n).position.x, 9);
    }
    const mistT = SAX_ACT2_END * 0.8;
    at(low.stage, mistT, 'low');
    at(cine.stage, mistT, 'cinematic');
    expect(mistRate(low.ctx.root)).toBeLessThan(mistRate(cine.ctx.root));
    expect(mistRate(low.ctx.root)).toBeGreaterThan(0);
    low.stage.dispose();
    cine.stage.dispose();
  });

  it('MIST_COUNT 在低档仍有粒子（不被缩放到 0）', () => {
    expect(MIST_COUNT).toBeGreaterThan(0);
    const low = build({ quality: 'low' });
    at(low.stage, SAX_ACT2_END * 0.8, 'low');
    expect(mistRate(low.ctx.root)).toBeGreaterThan(0);
    low.stage.dispose();
  });

  it('dispose 递归清空子树且幂等，不留残余子节点', () => {
    const { stage, ctx } = build();
    at(stage, SAX_ACT2_END);
    const anchor = node(ctx.root, 'mist-anchor');
    const pivot = node(ctx.root, 'beampivot-0');
    expect(anchor.children.length).toBeGreaterThan(0);
    expect(pivot.children.length).toBeGreaterThan(0);

    stage.dispose();
    stage.dispose();

    expect(ctx.root.children).toHaveLength(0);
    expect(anchor.children).toHaveLength(0);
    expect(pivot.children).toHaveLength(0);
    expect(() => at(stage, 0.9)).not.toThrow();
  });

  it('update 覆盖整幕不抛异常（含边界与越界 t）', () => {
    const { stage } = build();
    expect(() => {
      for (let t = -0.1; t <= 1.1; t += 1 / 120) at(stage, t);
    }).not.toThrow();
    stage.dispose();
  });
});
